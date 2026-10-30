import { join } from 'node:path'

export async function buildVerifiedWindowsInstaller({ appDirectory, builderArguments, runBuilder, verifyDirectory, prepareArchive, reuseVerifiedDirectory = false }) {
  if (!reuseVerifiedDirectory) await runBuilder(['--win', '--dir', ...builderArguments])
  const appOutDir = join(appDirectory, 'dist', 'win-unpacked')
  await verifyDirectory(join(appOutDir, 'resources'))
  const payload = prepareArchive ? await prepareArchive(appOutDir) : undefined
  let failure
  try {
    await runBuilder(['--win', 'nsis', '--prepackaged', appOutDir, ...builderArguments, ...(payload?.builderArguments ?? [])])
  } catch (error) { failure = error }
  finally {
    try { await payload?.restore() } catch (error) {
      if (failure) throw new AggregateError([failure, error], 'Installer compression and runtime restoration failed')
      throw error
    }
  }
  if (failure) throw failure
  if (payload) await verifyDirectory(join(appOutDir, 'resources'))
}
