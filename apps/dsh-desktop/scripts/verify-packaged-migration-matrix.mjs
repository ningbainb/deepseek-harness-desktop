import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import { runPackagedMigrationMatrix } from './packaged-migration-matrix-runner.mjs'

const SKIP_MESSAGE = 'SKIP packaged migration matrix: DSH_DESKTOP_E2E_EXECUTABLE is not set.'
const configuredExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE?.trim()

if (!configuredExecutable) {
  console.log(SKIP_MESSAGE)
} else {
  const appPath = resolve(configuredExecutable)
  const executable = await stat(appPath)
  if (!executable.isFile()) throw new Error('DSH_DESKTOP_E2E_EXECUTABLE must resolve to a packaged Desktop executable file')
  const result = await runPackagedMigrationMatrix({ appPath })
  console.log(`packaged migration matrix ${JSON.stringify(result)}`)
}
