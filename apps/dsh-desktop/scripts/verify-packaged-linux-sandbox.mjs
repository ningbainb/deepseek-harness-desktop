import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { packagedLinuxExecutable, packagedLinuxResourcesPath } from './verify-packaged-smoke-linux.mjs'

const desktopAppDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function assertLinux(platform = process.platform) {
  if (platform !== 'linux') throw new Error('packaged Linux sandbox verification only runs on Linux')
}

export async function verifyPackagedLinuxSandbox({ appDir = desktopAppDir, platform = process.platform } = {}) {
  assertLinux(platform)
  const resources = packagedLinuxResourcesPath(packagedLinuxExecutable(appDir))
  const modules = join(resources, 'app.asar.unpacked', 'node_modules')
  const entry = join(modules, '@deepseek-ai', 'node-addon-system', 'lib', 'index.js')
  await access(entry)
  const { grantArgs, launcherPath, probe } = await import(pathToFileURL(entry).href)
  const launcher = launcherPath()
  await access(launcher)
  const enforcement = probe(launcher, { timeoutMs: 5_000 })
  if (enforcement === 'unusable') throw new Error('packaged Linux Landlock launcher is unusable')

  const root = await mkdtemp(join(tmpdir(), 'dsh-linux-sandbox-'))
  const allowedRoot = join(root, 'allowed')
  const deniedRoot = join(root, 'denied')
  const allowedFile = join(allowedRoot, 'write.txt')
  const deniedFile = join(deniedRoot, 'write.txt')
  try {
    await mkdir(allowedRoot, { recursive: true })
    await mkdir(deniedRoot, { recursive: true })
    const prefix = [
      ...grantArgs({ readOnly: ['/'], readWrite: [allowedRoot] }),
      '--',
      '/bin/sh',
      '-c',
    ]
    const allowed = spawnSync(launcher, [...prefix, 'printf allowed > "$1"', 'dsh', allowedFile], {
      encoding: 'utf8',
    })
    if (allowed.status !== 0 || (await readFile(allowedFile, 'utf8')) !== 'allowed') {
      throw new Error(`packaged Linux Landlock launcher rejected an allowed write: ${allowed.stderr ?? ''}`)
    }
    const denied = spawnSync(launcher, [...prefix, 'printf denied > "$1"', 'dsh', deniedFile], {
      encoding: 'utf8',
    })
    if (denied.status === 0) throw new Error('packaged Linux Landlock launcher allowed a denied write')
    return Object.freeze({ enforcement, launcher })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await verifyPackagedLinuxSandbox()
  console.log(`packaged Linux sandbox ${JSON.stringify(result)}`)
}
