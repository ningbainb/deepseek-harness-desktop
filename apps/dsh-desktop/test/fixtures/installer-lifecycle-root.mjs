import { mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** QA owns this new directory; resolve TEMP aliases before deriving any scenario paths. */
export async function createInstallerLifecycleRoot(temporaryDirectory = tmpdir()) {
  // Hosted Windows TEMP may contain RUNNER~1 even though the physical path is
  // runneradmin. Production payload validation still rejects linked inputs.
  return realpath(await mkdtemp(join(temporaryDirectory, 'dsh-nsis-lifecycle-')))
}
