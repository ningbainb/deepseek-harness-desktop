import { join } from 'node:path'

export async function buildVerifiedWindowsInstaller({ appDirectory, builderArguments, runBuilder, verifyDirectory }) {
  await runBuilder(['--win', '--dir', ...builderArguments])
  const appOutDir = join(appDirectory, 'dist', 'win-unpacked')
  await verifyDirectory(join(appOutDir, 'resources'))
  await runBuilder(['--win', 'nsis', '--prepackaged', appOutDir, ...builderArguments])
}
