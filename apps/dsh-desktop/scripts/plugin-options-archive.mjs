import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const PLUGIN_OPTIONS_FIXTURE = Object.freeze({
  name: 'dsh-free-search',
  version: '0.6.6',
  tarball: 'https://registry.npmjs.org/dsh-free-search/-/dsh-free-search-0.6.6.tgz',
  integrity: 'sha512-B3eFTdCdGci6m31Q0CWZi+j2mML2u0HPkIFcdYy1iex4ikDdudH29zGa8gfY4vxG3vmvB4MwwH23j8sKOkj65g==',
  maxBytes: 2 * 1024 * 1024,
})

export function verifyPluginOptionsArchive(contents, integrity = PLUGIN_OPTIONS_FIXTURE.integrity) {
  if (!Buffer.isBuffer(contents)) throw new TypeError('plugin options archive must be a Buffer')
  if (contents.length === 0 || contents.length > PLUGIN_OPTIONS_FIXTURE.maxBytes) {
    throw new Error('plugin options archive size is invalid')
  }
  const actual = `sha512-${createHash('sha512').update(contents).digest('base64')}`
  if (actual !== integrity) throw new Error('plugin options archive integrity mismatch')
}

export async function preparePluginOptionsArchive({ archivePath, directory = tmpdir(), download = fetch } = {}) {
  if (archivePath !== undefined) {
    const archive = resolve(archivePath)
    verifyPluginOptionsArchive(await readFile(archive))
    return archive
  }
  const response = await download(PLUGIN_OPTIONS_FIXTURE.tarball, {
    redirect: 'error', signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`plugin options fixture download failed: HTTP ${response.status}`)
  if (Number(response.headers.get('content-length')) > PLUGIN_OPTIONS_FIXTURE.maxBytes) {
    throw new Error('plugin options archive size is invalid')
  }
  if (!response.body) throw new Error('plugin options fixture download has no body')
  const chunks = []
  let bytes = 0
  for await (const chunk of response.body) {
    bytes += chunk.byteLength
    if (bytes > PLUGIN_OPTIONS_FIXTURE.maxBytes) throw new Error('plugin options archive size is invalid')
    chunks.push(Buffer.from(chunk))
  }
  const contents = Buffer.concat(chunks)
  verifyPluginOptionsArchive(contents)
  const temporary = await mkdtemp(join(directory, 'dsh-plugin-options-fixture-'))
  const archive = join(temporary, `${PLUGIN_OPTIONS_FIXTURE.name}-${PLUGIN_OPTIONS_FIXTURE.version}.tgz`)
  await writeFile(archive, contents, { flag: 'wx' })
  return archive
}
