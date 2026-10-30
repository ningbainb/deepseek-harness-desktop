import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function tinyPE(resource = 'generic', text = 0x42) {
  const buffer = Buffer.alloc(2048)
  buffer.writeUInt16LE(0x5a4d, 0)
  buffer.writeUInt32LE(128, 0x3c)
  buffer.writeUInt32LE(0x4550, 128)
  buffer.writeUInt16LE(0x8664, 132)
  buffer.writeUInt16LE(3, 134)
  buffer.writeUInt16LE(240, 148)
  buffer.writeUInt16LE(0x20b, 152)
  for (const [i, name] of ['.text', '.rdata', '.rsrc'].entries()) {
    const header = 392 + i * 40
    buffer.write(name, header, 'ascii')
    buffer.writeUInt32LE(512, header + 16)
    buffer.writeUInt32LE(512 + i * 512, header + 20)
  }
  buffer.fill(text, 512, 1024)
  buffer.fill(0x35, 1024, 1536)
  buffer.write(resource, 1536)
  return buffer
}
export async function payloadFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-electron-payload-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const app = join(root, 'app')
  const electron = join(app, 'resources/app.asar.unpacked/node_modules/electron')
  const dist = join(electron, 'dist')
  await mkdir(dist, { recursive: true })
  await writeFile(join(electron, 'package.json'), JSON.stringify({ name: 'electron', version: '44.0.0' }))
  await writeFile(join(app, 'DeepSeek Harness Desktop.exe'), tinyPE('desktop'))
  await writeFile(join(dist, 'electron.exe'), tinyPE('generic'))
  await writeFile(join(app, 'icudtl.dat'), 'same-data')
  await writeFile(join(dist, 'icudtl.dat'), 'same-data')
  await writeFile(join(app, 'resources.pak'), 'new-resources')
  await writeFile(join(dist, 'resources.pak'), 'different-resources')
  return { root, app, electron, dist }
}
