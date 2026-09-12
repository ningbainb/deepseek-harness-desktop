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
 *   node scripts/run-regression-e2e.mjs --source # Verify current source and rebuilt plugins
 *   node scripts/run-regression-e2e.mjs --core   # Core regression
 *   node scripts/run-regression-e2e.mjs --full   # Full regression
 */

import { existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acceptedReleaseIssue } from './release-known-issues.mjs'

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const IS_FULL = process.argv.includes('--full')
const SOURCE_ONLY = process.argv.includes('--source')
const ACCEPT_KNOWN_DPI = process.argv.includes('--accept-known-dpi-position-3.4.0')
const VERSION = JSON.parse(readFileSync(resolve(APP_DIR, 'package.json'), 'utf8')).version
const acceptedIssues = []
// QA uses isolated data and must also leave the host's link association intact.
process.env.DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION = '1'
if (SOURCE_ONLY) delete process.env.DSH_DESKTOP_E2E_EXECUTABLE

const defaultPackagedExe = resolve(APP_DIR, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe')
if (!SOURCE_ONLY && !process.env.DSH_DESKTOP_E2E_EXECUTABLE && existsSync(defaultPackagedExe)) {
  process.env.DSH_DESKTOP_E2E_EXECUTABLE = defaultPackagedExe
  console.log(`Auto-detected packaged desktop executable: ${defaultPackagedExe}`)
}


const CORE_SUITES = [
  {
    name: 'Native Plugin Pages, Preserved Skins and Window Palette',
    script: 'scripts/verify-native-plugin-pages.mjs',
    args: [],
  },
  {
    name: 'Settings Availability Before Slow Resources Complete',
    script: 'scripts/verify-settings-readiness.mjs',
    args: [],
  },
  {
    name: 'Optional Prompt Ordering & Once-per-release Lifecycle',
    script: 'scripts/verify-star-prompt.mjs',
    args: [],
  },
  {
    name: 'Extension Dock Settings & Compact Layout',
    script: 'scripts/verify-dock-settings.mjs',
    args: [],
  },
  {
    name: 'Selected Model Balance & Provider Credential Isolation',
    script: 'scripts/verify-selected-balance.mjs',
    args: [],
  },
  {
    name: 'Dock Model Catalog, Selection & Timeout Recovery',
    script: 'scripts/verify-dock-model-catalog.mjs',
    args: [],
  },
  {
    name: 'Network Proxy Routing & Recovery',
    script: 'scripts/verify-proxy-routing.mjs',
    args: [],
  },
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
    name: 'Long Conversation Scroll & Turn Navigation',
    script: 'scripts/verify-conversation-scroll.mjs',
    args: [],
  },
  {
    name: 'Native DSH Turn Navigation Without Duplicate Controls',
    script: 'scripts/verify-conversation-scroll.mjs',
    args: ['--native-turns', '--native-tabs', '--mode-switch'],
  },
  {
    name: 'Directory Picker & Workspace Import',
    script: 'scripts/verify-directory-picker.mjs',
    args: ['--native-layout'],
  },
  {
    name: 'Runtime Provider & IPC Services',
    script: 'scripts/verify-runtime-provider.mjs',
    args: [],
  },
  ...(process.platform === 'win32' ? [{
    name: 'Windows DPI Persistence, Maximize and Explicit Resize',
    script: 'scripts/verify-window-state-dpi.mjs',
    args: [],
  }] : []),
  {
    name: 'Particle Composer Clearance & Multi-window Settings Delivery',
    script: 'scripts/verify-particle-theme.mjs',
    args: [],
  },
  {
    name: 'Preset Deep-Link Protocol Handler',
    script: 'scripts/verify-preset-deep-link.mjs',
    args: [],
  },
  {
    name: 'Real Preset Export, Visible Feedback & Retry',
    script: 'scripts/verify-preset-export.mjs',
    args: [],
  },
  {
    name: 'Direct-Start Matrix & Repair Unit Integration',
    script: '--test',
    args: [
      'test/packaged-direct-start-matrix.test.mjs',
      'test/repair-agent-integration.test.mjs',
      'test/session-preservation.test.mjs',
      'test/legacy-session-backend.test.mjs',
      'test/pet-client-polling.test.mjs',
      'test/dock-settings-fixture.test.mjs',
      'test/dock-settings-close.test.mjs',
      'test/dock-settings-save.test.mjs',
      'test/extensions-renderer-actions.test.mjs',
      'test/panel-layout-menu.test.mjs',
      'test/desktop-ingress.test.mjs',
      'test/runtime-presentation.test.mjs',
      'test/runtime-startup-timing.test.mjs',
      'test/runtime-shutdown-control.test.mjs',
      'test/runtime-stream-drain.test.mjs',
      'test/window-state.test.mjs',
      'test/window-chrome.test.mjs',
      'test/settings-window.test.mjs',
      'test/modal-reveal.test.mjs',
      'test/star-prompt.test.mjs',
      'test/install-recovery.test.mjs',
      'test/terminal-session.test.mjs',
      'test/terminal-window.test.mjs',
      'test/terminal-renderer.test.mjs',
      'test/windows-background-runner.test.mjs',
      'test/windows-runner-console.test.mjs',
    ],
  },
]

const PACKAGED_SUITES = [
  ...(process.platform === 'win32' ? [{
    name: 'Compiled NSIS Upgrade & Rollback Lifecycle',
    script: 'scripts/verify-installer-lifecycle.mjs',
    args: [],
  }] : []),
  {
    name: 'Embedded Terminal (ConPTY / xterm)',
    script: 'scripts/verify-terminal.mjs',
    args: [],
  },
  {
    name: 'Packaged SSH Terminal & Relaunch Persistence',
    script: 'scripts/verify-packaged-ssh.mjs',
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
    name: 'Packaged Image Drop Reliability & Memory',
    script: 'scripts/verify-packaged-image-drop.mjs',
    args: [],
  },
  {
    name: 'Packaged Session Message & Agent Tool Work',
    script: 'scripts/verify-packaged-agent-work.mjs',
    args: [],
  },
  {
    name: 'Workspace Relocation Compatibility & Rollback',
    script: 'scripts/verify-workspace-relocation.mjs',
    args: [],
  },
  {
    name: 'Skin Center Live Apply & Relaunch Persistence',
    script: 'scripts/verify-skin-center.mjs',
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
    let output = ''
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
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    for (const [stream, destination] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      stream.on('data', chunk => {
        output = (output + chunk.toString()).slice(-128_000)
        destination.write(chunk)
      })
    }

    child.on('error', (err) => reject(err))
    child.on('exit', (code, signal) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      if (code === 0) {
        console.log(`[PASS] ${suite.name} (${elapsed}s)`)
        resolveRun()
      } else {
        const issue = acceptedReleaseIssue({ version: VERSION, enabled: ACCEPT_KNOWN_DPI,
          script: suite.script, code, signal, output })
        if (issue) {
          acceptedIssues.push(issue)
          console.warn(`[ACCEPTED KNOWN ISSUE] ${issue}: test failed; maintainer explicitly deferred it for 3.4.0. No test was skipped.`)
          resolveRun()
          return
        }
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
  console.log(` [${acceptedIssues.length ? 'COMPLETED WITH ACCEPTED KNOWN ISSUE' : 'ALL PASSED'}] Unified Desktop Regression Gate (${suitesToRun.length} suites, ${totalElapsed}s)`)
  if (acceptedIssues.length) console.log(` Accepted issues: ${acceptedIssues.join(', ')}`)
  console.log(`============================================================`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
