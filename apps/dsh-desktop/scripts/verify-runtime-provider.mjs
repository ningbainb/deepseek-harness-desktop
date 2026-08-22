import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { ensureDesktopProfile, resolveDshCliPath, resolveRuntimePackages } from '../src/profile.mjs'
import { DshRuntimeController } from '../src/runtime-controller.mjs'
import { DshRuntimeProvider } from '../src/runtime-provider.mjs'

const temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-runtime-provider-'))
const dshHome = join(temporaryRoot, 'dsh-home')
const repositoryRoot = resolve(import.meta.dirname, '..', '..', '..')
const runtimePackages = resolveRuntimePackages()
const ensureProfile = () => ensureDesktopProfile({ dshHome, packageRoots: runtimePackages })

try {
  await ensureProfile()
  const controller = new DshRuntimeController({
    cliPath: resolveDshCliPath(),
    cwd: repositoryRoot,
    dshHome,
    executable: process.execPath,
    logStore: { append: async () => {} },
    startupTimeoutMs: 180_000,
    shutdownTimeoutMs: 15_000,
    preferredPort: 0,
  })
  const provider = new DshRuntimeProvider({
    controller,
    ensureProfile,
    dshHome,
    upstreamVersion: process.env.DSH_CANDIDATE_VERSION ?? '0.1.1-rc.1',
    desktopVersion: '2.5.0',
    runtimeIdentity: { packageName: '@deepseek-ai/dsh', cliRelativePath: 'lib/bin.js' },
  })
  const firstUrl = await provider.start()
  await provider.stop()
  const recoveredUrl = await provider.recover()
  await provider.stop()
  if (!firstUrl.startsWith('http://127.0.0.1:') || !recoveredUrl.startsWith('http://127.0.0.1:')) {
    throw new Error('runtime provider returned a non-loopback URL')
  }
  if (provider.status.state !== 'stopped') throw new Error('runtime provider did not stop after recover verification')
  console.log(JSON.stringify({ firstUrl, recoveredUrl, profileDir: provider.resolveProfilePaths().profileDir }))
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
