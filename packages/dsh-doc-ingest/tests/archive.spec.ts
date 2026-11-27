import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { validateArchive } from '../src/host/archive.ts'

describe('Office archive guard', () => {
  it('accepts bounded archives containing format metadata', async () => {
    const bytes = zipSync({ 'word/document.xml': strToU8('<document>hello</document>') })
    await expect(validateArchive(bytes, 'docx')).resolves.toBeUndefined()
  })

  it('rejects oversized expansion before passing content to the parser', async () => {
    const bytes = zipSync({ 'word/document.xml': new Uint8Array(2 * 1024 * 1024) })
    await expect(validateArchive(bytes, 'docx')).rejects.toThrow(/ratio/i)
  })

  it('rejects a traversal member', async () => {
    const bytes = zipSync({ 'word/document.xml': strToU8('<document/>'), '../nested.xml': strToU8('<ignored/>') })
    await expect(validateArchive(bytes, 'docx')).rejects.toThrow(/archive/i)
  })

  it('checks that the archive content matches its claimed type', async () => {
    const bytes = zipSync({ 'word/document.xml': strToU8('<document/>') })
    await expect(validateArchive(bytes, 'xlsx')).rejects.toThrow(/format/i)
  })

  it('rejects an archive whose member data does not match its declared checksum', async () => {
    const bytes = zipSync({ 'word/document.xml': strToU8('document body') }, { level: 0 })
    const tampered = Buffer.from(bytes)
    tampered[tampered.indexOf('document body')] = 0x62
    await expect(validateArchive(tampered, 'docx')).rejects.toThrow(/integrity/i)
  })
})
