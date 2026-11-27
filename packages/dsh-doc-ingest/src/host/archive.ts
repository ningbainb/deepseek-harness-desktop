import { crc32 } from 'node:zlib'
import { fromBuffer, type Entry, type ZipFile } from 'yauzl'
import { MAX_ARCHIVE_BYTES, MAX_ARCHIVE_RATIO, type ArchiveFormat } from '../core/types.ts'

const MAX_ENTRIES = 4096
const REQUIRED_PARTS: Record<ArchiveFormat, string> = {
  docx: 'word/document.xml',
  xlsx: 'xl/workbook.xml',
  pptx: 'ppt/presentation.xml',
  odt: 'content.xml',
  ods: 'content.xml',
  odp: 'content.xml',
}
const ODF_MIME: Partial<Record<ArchiveFormat, string>> = {
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
}

function openZip(bytes: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    fromBuffer(bytes, { autoClose: false, lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error) reject(error)
      else resolve(zip)
    })
  })
}

function centralDirectoryOffset(bytes: Buffer): number {
  const min = Math.max(0, bytes.length - 65_557)
  for (let end = bytes.length - 22; end >= min; end--) {
    if (bytes.readUInt32LE(end) !== 0x06054b50) continue
    const entries = bytes.readUInt16LE(end + 8)
    const offset = bytes.readUInt32LE(end + 16)
    if (bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0
      || entries !== bytes.readUInt16LE(end + 10) || entries === 0xffff
      || offset + bytes.readUInt32LE(end + 12) !== end
      || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length
      || end >= 20 && bytes.readUInt32LE(end - 20) === 0x07064b50) {
      throw new Error('Invalid or unsupported Office archive directory.')
    }
    return offset
  }
  throw new Error('Office archive directory is missing.')
}

function nextEntry(zip: ZipFile): Promise<Entry | undefined> {
  return new Promise((resolve, reject) => {
    const onEntry = (entry: Entry): void => { clear(); resolve(entry) }
    const onEnd = (): void => { clear(); resolve(undefined) }
    const onError = (error: Error): void => { clear(); reject(error) }
    function clear(): void {
      zip.off('entry', onEntry)
      zip.off('end', onEnd)
      zip.off('error', onError)
    }
    zip.once('entry', onEntry)
    zip.once('end', onEnd)
    zip.once('error', onError)
    zip.readEntry()
  })
}

function localRange(bytes: Buffer, entry: Entry, centralOffset: number): [number, number] {
  const offset = entry.relativeOffsetOfLocalHeader
  if (offset < 0 || offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error('Invalid Office archive local header.')
  }
  const flags = bytes.readUInt16LE(offset + 6)
  const nameEnd = offset + 30 + bytes.readUInt16LE(offset + 26)
  const dataStart = nameEnd + bytes.readUInt16LE(offset + 28)
  const end = dataStart + entry.compressedSize
  if (dataStart > centralOffset || end > centralOffset
    || bytes.readUInt16LE(offset + 8) !== entry.compressionMethod
    || flags !== entry.generalPurposeBitFlag
    || bytes.subarray(offset + 30, nameEnd).toString('utf8') !== entry.fileName) {
    throw new Error('Inconsistent Office archive local header.')
  }
  if ((flags & 8) === 0 && (bytes.readUInt32LE(offset + 18) !== entry.compressedSize
    || bytes.readUInt32LE(offset + 22) !== entry.uncompressedSize)) {
    throw new Error('Inconsistent Office archive member sizes.')
  }
  return [offset, end]
}

async function streamEntry(zip: ZipFile, entry: Entry, capture: boolean): Promise<Buffer | undefined> {
  const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zip.openReadStream(entry, (error, output) => error ? reject(error) : resolve(output))
  })
  let checksum = 0
  let expanded = 0
  const captured: Buffer[] = []
  for await (const chunk of stream) {
    const data = chunk as Buffer
    expanded += data.byteLength
    if (expanded > entry.uncompressedSize) throw new Error('Office archive member exceeded its declared size.')
    checksum = crc32(data, checksum)
    if (capture) captured.push(data)
  }
  if (expanded !== entry.uncompressedSize || checksum !== entry.crc32) {
    throw new Error('Office archive member integrity check failed.')
  }
  return capture ? Buffer.concat(captured, expanded) : undefined
}

export async function validateArchive(
  bytes: Uint8Array,
  format: ArchiveFormat,
  parts?: { shouldRead: (name: string) => boolean; readPart: (name: string, bytes: Buffer) => void },
): Promise<void> {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let zip: ZipFile | undefined
  try {
    const centralOffset = centralDirectoryOffset(buffer)
    zip = await openZip(buffer)
    if (zip.entryCount > MAX_ENTRIES) throw new Error('Office archive contains too many members.')
    const names = new Set<string>()
    const entries: Entry[] = []
    const ranges: Array<[number, number]> = []
    let totalCompressed = 0
    let totalExpanded = 0
    for (let entry = await nextEntry(zip); entry; entry = await nextEntry(zip)) {
      const nameKey = entry.fileName.normalize('NFC').toLowerCase()
      if (names.has(nameKey) || /[\x00-\x1f]/u.test(entry.fileName) || nameKey === '__proto__'
        || entry.fileName.split('/').includes('.') || entry.isEncrypted()
        || ![0, 8].includes(entry.compressionMethod)) {
        throw new Error('Invalid or unsupported Office archive member.')
      }
      names.add(nameKey)
      totalCompressed += entry.compressedSize
      totalExpanded += entry.uncompressedSize
      if (totalExpanded > MAX_ARCHIVE_BYTES) throw new Error('Expanded Office archive exceeds the 128 MiB size limit.')
      if (entry.uncompressedSize > entry.compressedSize * MAX_ARCHIVE_RATIO) {
        throw new Error('Office archive expansion ratio exceeds 100:1.')
      }
      ranges.push(localRange(buffer, entry, centralOffset))
      entries.push(entry)
    }
    if (totalExpanded > totalCompressed * MAX_ARCHIVE_RATIO) throw new Error('Office archive expansion ratio exceeds 100:1.')
    const sorted = ranges.sort(([left], [right]) => left - right)
    if (sorted.some(([start], index) => index > 0 && sorted[index - 1][1] > start)) {
      throw new Error('Office archive member data overlaps.')
    }
    if (!entries.some(entry => entry.fileName === REQUIRED_PARTS[format])) {
      throw new Error('Office archive format does not match the file extension.')
    }
    const mime = ODF_MIME[format]
    for (const entry of entries) {
      const isMime = mime !== undefined && entry.fileName === 'mimetype'
      if (isMime && entry.uncompressedSize > 128) throw new Error('Invalid OpenDocument archive format.')
      const readPart = parts?.shouldRead(entry.fileName) ?? false
      const value = await streamEntry(zip, entry, isMime || readPart)
      if (isMime && value?.toString('utf8') !== mime) throw new Error('OpenDocument archive format does not match the file extension.')
      if (readPart && value) parts?.readPart(entry.fileName, value)
    }
    if (mime && !names.has('mimetype')) throw new Error('OpenDocument archive format has no media type.')
  } catch (cause) {
    if (cause instanceof Error && /archive|spreadsheet formula/iu.test(cause.message)) throw cause
    throw new Error('Invalid Office archive.', { cause })
  } finally {
    zip?.close()
  }
}
