#!/usr/bin/env node
/**
 * Unified Desktop E2E Regression Gate.
 *
 * Runs critical desktop E2E suites sequentially:
 * - Default / --core: Runs core desktop E2E suites (window chrome, settings window,
 *   directory picker, runtime provider, preset deep-link, direct-start/repair unit integration).
 *   Fast, deterministic, and runnable in PR CI.
 * - --full: Runs complete regression (core + packaged suites: terminal, direct-start matrix,
 *   fresh relaunch, personalization cards, model preferences, profile reset, update shutdown,
 *   remote isolation). Required for full release verification.
 *
 * Usage:
 *   node scripts/run-regression-e2e.mjs          # Core regression
 *   node scripts/run-regression-e2e.mjs --core   # Core regression
 *   node scripts/run-regression-e2e.mjs --full   # Full regression
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const IS_FULL = process.argv.includes('--full')

const defaultPackagedExe = resolve(APP_DIR, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe')
if (!process.env.DSH_DESKTOP_E2E_EXECUTABLE && existsSync(defaultPackagedExe)) {
  process.env.DSH_DESKTOP_E2E_EXECUTABLE = defaultPackagedExe
  console.log(`Auto-detected packaged desktop executable: ${defaultPackagedExe}`)
}


const CORE_SUITES = [
  {
    name: 'Window Chrome & Geometry',
    script: 'scripts/verify-window-chrome.mjs',
    args: [],
  },
  {
    name: 'Settings Window Multi-tab & Resizing',
    script: 'scripts/verify-settings-window.mjs',
    args: [],
  },
  {
    name: 'Directory Picker & Workspace Import',
    script: 'scripts/verify-directory-picker.mjs',
    args: [],
  },
  {
    name: 'Runtime Provider & IPC Services',
    script: 'scripts/verify-runtime-provider.mjs',
    args: [],
  },
  {
    name: 'Preset Deep-Link Protocol Handler',
    script: 'scripts/verify-preset-deep-link.mjs',
    args: [],
  },
  {
    name: 'Direct-Start Matrix & Repair Unit Integration',
    script: '--test',
    args: [
      'test/packaged-direct-start-matrix.test.mjs',
      'test/repair-agent-integration.test.mjs',
      'test/session-preservation.test.mjs',
    ],
  },
]

const PACKAGED_SUITES = [
  {
    name: 'Embedded Terminal (ConPTY / xterm)',
    script: 'scripts/verify-terminal.mjs',
    args: [],
  },
  {
    name: 'Packaged Direct-Start Matrix',
    script: 'scripts/verify-packaged-direct-start-matrix.mjs',
    args: [],
  },
  {
    name: 'Packaged Clean Profile Relaunch',
    script: 'scripts/verify-packaged-fresh-second-launch.mjs',
    args: [],
  },
  {
    name: 'Packaged Personalization (Prompt & Memory Cards)',
    script: 'scripts/verify-packaged-personalization.mjs',
    args: [],
  },
  {
    name: 'Packaged Model Preferences Card',
    script: 'scripts/verify-packaged-model-preferences.mjs',
    args: [],
  },
  {
    name: 'Packaged Cleared Profile Rebuild',
    script: 'scripts/verify-packaged-profile-reset.mjs',
    args: [],
  },
  {
    name: 'Packaged Update Shutdown Receipt',
    script: 'scripts/verify-update-shutdown.mjs',
    args: [],
  },
]

function runSuite(suite) {
  return new Promise((resolveRun, reject) => {
    const startTime = Date.now()
    console.log(`\n============================================================`)
    console.log(` [RUNNING E2E] ${suite.name}`)
    console.log(` Command: node ${suite.script} ${suite.args.join(' ')}`)
    console.log(`============================================================`)

    const nodeArgs = suite.script === '--test'
      ? ['--test', ...suite.args]
      : [suite.script, ...suite.args]

    const child = spawn(process.execPath, nodeArgs, {
      cwd: APP_DIR,
      env: {
        ...process.env,
        // Ensure child processes inherit packaged executable if defined
        DSH_DESKTOP_E2E_EXECUTABLE: process.env.DSH_DESKTOP_E2E_EXECUTABLE,
      },
      stdio: 'inherit',
    })

    child.on('error', (err) => reject(err))
    child.on('exit', (code, signal) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      if (code === 0) {
        console.log(`[PASS] ${suite.name} (${elapsed}s)`)
        resolveRun()
      } else {
        const reason = signal ? `signal ${signal}` : `exit code ${code}`
        reject(new Error(`[FAIL] ${suite.name} failed with ${reason} (${elapsed}s)`))
      }
    })
  })
}

async function main() {
  const suitesToRun = IS_FULL
    ? [...CORE_SUITES, ...PACKAGED_SUITES]
    : CORE_SUITES

  console.log(`Starting Desktop Regression E2E Gate (${IS_FULL ? 'FULL RELEASE' : 'CORE PR'} mode, ${suitesToRun.length} suites)...`)
  const totalStart = Date.now()

  for (let i = 0; i < suitesToRun.length; i++) {
    const suite = suitesToRun[i]
    console.log(`\nProgress: [${i + 1}/${suitesToRun.length}] ${suite.name}`)
    try {
      await runSuite(suite)
      if (i + 1 < suitesToRun.length) {
        await new Promise((r) => setTimeout(r, 1200))
      }
    } catch (err) {
      console.error(`\n------------------------------------------------------------`)
      console.error(` [REGRESSION E2E FAILURE] Regression gate blocked release/merge!`)
      console.error(` ${err.message}`)
      console.error(`------------------------------------------------------------`)
      process.exit(1)
    }
  }

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1)
  console.log(`\n============================================================`)
  console.log(` [ALL PASSED] Unified Desktop Regression Gate (${suitesToRun.length} suites, ${totalElapsed}s)`)
  console.log(`============================================================`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})