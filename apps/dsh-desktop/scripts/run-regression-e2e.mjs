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

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acceptedReleaseIssue } from './release-known-issues.mjs'
import { prepareSourceSkins } from './prepare-source-skins.mjs'

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const IS_FULL = process.argv.includes('--full')
const COLLECT_FAILURES = process.argv.includes('--collect-failures')
const SOURCE_ONLY = process.argv.includes('--source')
const ACCEPT_KNOWN_DPI = process.argv.includes('--accept-known-dpi-position-3.4.0')
const VERSION = JSON.parse(readFileSync(resolve(APP_DIR, 'package.json'), 'utf8')).version
const acceptedIssues = []
const receiptArgument = process.argv.find((argument) => argument.startsWith('--evidence='))
const RECEIPT_PATH = receiptArgument
  ? resolve(process.cwd(), receiptArgument.slice('--evidence='.length))
  : (process.env.DSH_DESKTOP_E2E_RECEIPT ? resolve(process.env.DSH_DESKTOP_E2E_RECEIPT) : undefined)
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
    name: 'Background Tray Residency, Restoration, Restart and Safe Quit',
    script: 'scripts/verify-background-residency.mjs',
    args: [],
  },
  {
    name: 'Official Defaults, Progressive Streaming and Collapsible Sidebar Tools',
    script: 'scripts/verify-beta-usability.mjs',
    args: [],
  },
  {
    name: 'bai First-user Sign-in, Model Entry and Browser Isolation',
    script: 'scripts/verify-bai-onboarding.mjs',
    args: [],
  },
  {
    name: 'Official Account OAuth, bai Recommendation and Skin Caption Geometry',
    script: 'scripts/verify-account-skin-chrome.mjs',
    args: [],
  },
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
    name: 'Extension Dock Opaque Surfaces, Contrast and Preserved Navigation',
    script: 'scripts/verify-dock-clarity.mjs',
    args: [],
  },
  {
    name: 'Shared Skill Discovery Root & Skill Center Mount',
    script: 'scripts/verify-skill-discovery.mjs',
    args: [],
  },
  {
    name: 'Conversation Skill Menu, Search & Keyboard Selection',
    script: 'scripts/verify-conversation-skills.mjs',
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
    name: 'Native Settings Menu Pointer Input, Link Choices, Shortcuts and Sidebar Cards',
    script: 'scripts/verify-native-settings-interactions.mjs',
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
  {
    name: 'Real SDK Settings, Third-party Models, Profile Reload and Restart',
    script: 'scripts/verify-runtime-settings-reload.mjs',
    args: process.env.DSH_DESKTOP_E2E_EXECUTABLE ? [
      `--resources=${resolve(dirname(process.env.DSH_DESKTOP_E2E_EXECUTABLE), 'resources')}`,
      `--executable=${resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE)}`,
    ] : [],
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
      'test/runtime-large-legacy-history.test.mjs',
      'test/runtime-large-v0-history.test.mjs',
      'test/profile-settings-preservation.test.mjs',
      'test/plugin-staging.test.mjs',
      'test/user-plugin-archive.test.mjs',
      'test/packaged-update-config.test.mjs',
      'test/package-win-stages.test.mjs',
      'test/runtime-pipe.test.mjs',
      'test/runtime-pipe-framing.test.mjs',
      'test/runtime-history-transport.test.mjs',
      'test/pet-client-polling.test.mjs',
      'test/pet-installed-canvas.test.mjs',
      'test/model-capabilities-installed.test.mjs',
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
      'test/local-lan-gateway.test.mjs',
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
  {
    name: 'Real Plugin-owned Configuration, Detail Click and Persisted Options',
    script: 'scripts/verify-plugin-options.mjs',
    args: [],
  },
  ...(process.platform === 'win32' ? [{
    name: 'Compiled NSIS Upgrade & Rollback Lifecycle',
    script: 'scripts/verify-installer-lifecycle.mjs',
    args: [],
  }, {
    name: 'Compiled NSIS Community Identity Migration',
    script: 'scripts/verify-installer-identity-migration.mjs',
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
    name: 'Packaged Local LAN Gateway over Authenticated Pipe',
    script: 'scripts/verify-packaged-local-lan-gateway.mjs',
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
      ? ['--test', '--test-concurrency=2', ...suite.args]
      : [suite.script, ...suite.args]

    const child = spawn(process.execPath, nodeArgs, {
      cwd: APP_DIR,
      env: {
        ...process.env,
        // Ensure child processes inherit packaged executable if defined
        DSH_DESKTOP_E2E_EXECUTABLE: process.env.DSH_DESKTOP_E2E_EXECUTABLE,
        ...(suite.script === 'scripts/verify-settings-readiness.mjs' && process.env.DSH_SETTINGS_READINESS_TRACE === '1'
          ? { DEBUG: 'pw:browser,pw:protocol' } : {}),
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
    child.on('close', (code, signal) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      if (code === 0) {
        console.log(`[PASS] ${suite.name} (${elapsed}s)`)
        resolveRun({
          name: suite.name,
          script: suite.script,
          args: suite.args,
          status: 'passed',
          durationSeconds: Number(elapsed),
        })
      } else {
        const issue = acceptedReleaseIssue({ version: VERSION, enabled: ACCEPT_KNOWN_DPI,
          script: suite.script, code, signal, output })
        if (issue) {
          acceptedIssues.push(issue)
          console.warn(`[ACCEPTED KNOWN ISSUE] ${issue}: test failed; maintainer explicitly deferred it for 3.4.0. No test was skipped.`)
          resolveRun({
            name: suite.name,
            script: suite.script,
            args: suite.args,
            status: 'accepted-known-issue',
            durationSeconds: Number(elapsed),
            issue,
          })
          return
        }
        const reason = signal ? `signal ${signal}` : `exit code ${code}`
        const error = new Error(`[FAIL] ${suite.name} failed with ${reason} (${elapsed}s)`)
        error.suiteResult = {
          name: suite.name,
          script: suite.script,
          args: suite.args,
          status: 'failed',
          durationSeconds: Number(elapsed),
          reason,
        }
        reject(error)
      }
    })
  })
}

function repositoryCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: resolve(APP_DIR, '../..'),
      encoding: 'utf8',
      windowsHide: true,
    }).trim()
  } catch {
    return 'unavailable'
  }
}

function releaseArtifactEvidence() {
  if (SOURCE_ONLY) return undefined
  const manifestPath = resolve(APP_DIR, 'dist', 'release-manifest.json')
  if (!existsSync(manifestPath)) return undefined
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const installer = manifest.files?.find((entry) => entry.file?.endsWith('.exe'))
  if (!installer) return undefined
  return {
    releaseManifest: relative(APP_DIR, manifestPath).replaceAll('\\', '/'),
    installer: {
      file: installer.file,
      size: installer.size,
      sha256: installer.sha256,
      signature: installer.signature,
    },
  }
}

function writeReceipt({ startedAt, finishedAt, status, suites, failure, terminal = true }) {
  if (!RECEIPT_PATH) return
  const executable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
    ? relative(APP_DIR, resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE)).replaceAll('\\', '/')
    : undefined
  const receipt = {
    schemaVersion: 1,
    kind: 'desktop-regression-e2e',
    version: VERSION,
    mode: IS_FULL ? 'full-release' : (SOURCE_ONLY ? 'source-core' : 'core'),
    sourceCommit: repositoryCommit(),
    startedAt: new Date(startedAt).toISOString(),
    updatedAt: new Date(finishedAt).toISOString(),
    ...(terminal ? { finishedAt: new Date(finishedAt).toISOString() } : {}),
    durationSeconds: Number(((finishedAt - startedAt) / 1000).toFixed(1)),
    status,
    acceptedIssues: [...acceptedIssues],
    executable,
    ...releaseArtifactEvidence(),
    suites,
    totalSuites: IS_FULL ? CORE_SUITES.length + PACKAGED_SUITES.length : CORE_SUITES.length,
    completedSuites: suites.length,
    completed: terminal && suites.length === (IS_FULL ? CORE_SUITES.length + PACKAGED_SUITES.length : CORE_SUITES.length),
    ...(failure ? { failure } : {}),
  }
  mkdirSync(dirname(RECEIPT_PATH), { recursive: true })
  const temporary = `${RECEIPT_PATH}.tmp-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  try {
    renameSync(temporary, RECEIPT_PATH)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
  console.log(`Acceptance evidence: ${RECEIPT_PATH}`)
}

async function main() {
  if (!process.env.DSH_DESKTOP_E2E_EXECUTABLE) {
    const restored = await prepareSourceSkins()
    console.log(`Verified source Skin Center assets: restored ${restored.length} offline skins`)
  }
  const suitesToRun = IS_FULL
    ? [...CORE_SUITES, ...PACKAGED_SUITES]
    : CORE_SUITES

  console.log(`Starting Desktop Regression E2E Gate (${IS_FULL ? 'FULL RELEASE' : 'CORE PR'} mode, ${suitesToRun.length} suites)...`)
  const totalStart = Date.now()
  const suiteResults = []
  const failures = []

  for (let i = 0; i < suitesToRun.length; i++) {
    const suite = suitesToRun[i]
    const suiteStartedAt = Date.now()
    console.log(`\nProgress: [${i + 1}/${suitesToRun.length}] ${suite.name}`)
    try {
      suiteResults.push(await runSuite(suite))
      writeReceipt({
        startedAt: totalStart,
        finishedAt: Date.now(),
        status: failures.length ? 'failed' : 'running',
        suites: suiteResults,
        terminal: false,
        ...(failures.length ? { failure: failures.join('\n') } : {}),
      })
      if (i + 1 < suitesToRun.length) {
        await new Promise((r) => setTimeout(r, 1200))
      }
    } catch (err) {
      suiteResults.push(err?.suiteResult ?? {
        name: suite.name,
        script: suite.script,
        args: suite.args,
        status: 'failed',
        durationSeconds: Number(((Date.now() - suiteStartedAt) / 1000).toFixed(1)),
        reason: err instanceof Error ? err.message : String(err),
      })
      failures.push(err instanceof Error ? err.message : String(err))
      writeReceipt({
        startedAt: totalStart,
        finishedAt: Date.now(),
        status: 'failed',
        suites: suiteResults,
        failure: failures.join('\n'),
        terminal: !COLLECT_FAILURES,
      })
      console.error(`\n------------------------------------------------------------`)
      console.error(` [REGRESSION E2E FAILURE] Regression gate blocked release/merge!`)
      console.error(` ${err.message}`)
      console.error(`------------------------------------------------------------`)
      if (!COLLECT_FAILURES) process.exit(1)
    }
  }

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1)
  if (failures.length) {
    writeReceipt({
      startedAt: totalStart,
      finishedAt: Date.now(),
      status: 'failed',
      suites: suiteResults,
      failure: failures.join('\n'),
    })
    console.error(` [FAILED] Unified Desktop Regression Gate (${failures.length}/${suitesToRun.length} suites failed, ${totalElapsed}s)`)
    process.exitCode = 1
    return
  }
  writeReceipt({
    startedAt: totalStart,
    finishedAt: Date.now(),
    status: acceptedIssues.length ? 'accepted-known-issue' : 'passed',
    suites: suiteResults,
  })
  console.log(`\n============================================================`)
  console.log(` [${acceptedIssues.length ? 'COMPLETED WITH ACCEPTED KNOWN ISSUE' : 'ALL PASSED'}] Unified Desktop Regression Gate (${suitesToRun.length} suites, ${totalElapsed}s)`)
  if (acceptedIssues.length) console.log(` Accepted issues: ${acceptedIssues.join(', ')}`)
  console.log(`============================================================`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
