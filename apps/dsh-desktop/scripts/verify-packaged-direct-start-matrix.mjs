import { access } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { runPackagedDirectStartMatrix } from './direct-start-matrix-runner.mjs'

const { values } = parseArgs({
  options: {
    'desktop-exe': { type: 'string' },
  },
  allowPositionals: false,
})

const supplied = values['desktop-exe'] ?? process.env.DSH_DESKTOP_E2E_EXECUTABLE
if (typeof supplied !== 'string' || supplied.trim().length === 0) {
  console.log('SKIP packaged direct-start matrix: provide --desktop-exe or DSH_DESKTOP_E2E_EXECUTABLE')
  process.exit(0)
}
const appPath = resolve(supplied)
if (!isAbsolute(appPath)) throw new Error('packaged Desktop executable must be absolute')
await access(appPath)
const result = await runPackagedDirectStartMatrix({ appPath })
for (const fixture of result.fixtures) {
  console.log(`PASS direct-start ${fixture.version}: ${fixture.state}`)
}
