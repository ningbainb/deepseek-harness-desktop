import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'

import { runPresetDeepLinkE2E } from './preset-deep-link-runner.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
await runPresetDeepLinkE2E({
  appDir,
  executablePath: process.env.DSH_DESKTOP_E2E_EXECUTABLE,
  electronPath,
  timeoutMs: Math.max(process.env.CI || process.env.DSH_DESKTOP_E2E_EXECUTABLE ? 120_000 : 60_000,
    Number(process.env.DSH_DESKTOP_E2E_TIMEOUT_MS) || 0),
})
