import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import {
  CWD_PROBE_MISMATCH,
  CWD_PROBE_SUCCESS,
  createPowerShellCwdProbe,
} from './terminal-e2e-probe.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-terminal-e2e-'))
const userData = resolve(temporary, 'user-data')
const dshHome = resolve(temporary, 'dsh-home')
const executeFile = promisify(execFile)
let electronApp

async function assertNoVisibleConsoleDescendants(rootPid) {
  if (process.platform !== 'win32') return
  const script = String.raw`
$source = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class DshVisibleWindowProbe {
  private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  public static uint[] ProcessIds() {
    var result = new HashSet<uint>();
    EnumWindows(delegate(IntPtr handle, IntPtr state) {
      if (IsWindowVisible(handle)) {
        uint processId;
        GetWindowThreadProcessId(handle, out processId);
        result.Add(processId);
      }
      return true;
    }, IntPtr.Zero);
    var values = new uint[result.Count];
    result.CopyTo(values);
    return values;
  }
}
'@
Add-Type -TypeDefinition $source
$processes = @(Get-CimInstance Win32_Process | ForEach-Object {
  [PSCustomObject]@{ processId = [int]$_.ProcessId; parentProcessId = [int]$_.ParentProcessId; name = [string]$_.Name }
})
[PSCustomObject]@{ processes = $processes; visible = @([DshVisibleWindowProbe]::ProcessIds()) } | ConvertTo-Json -Compress -Depth 4
`
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const { stdout } = await executeFile('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded,
  ], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
  const snapshot = JSON.parse(stdout)
  const processes = Array.isArray(snapshot.processes) ? snapshot.processes : [snapshot.processes]
  const children = new Map()
  for (const process of processes) {
    const list = children.get(process.parentProcessId) ?? []
    list.push(process)
    children.set(process.parentProcessId, list)
  }
  const descendants = []
  const pending = [rootPid]
  const seen = new Set(pending)
  while (pending.length > 0) {
    const parent = pending.pop()
    for (const child of children.get(parent) ?? []) {
      if (seen.has(child.processId)) continue
      seen.add(child.processId)
      descendants.push(child)
      pending.push(child.processId)
    }
  }
  const consoleNames = new Set(['cmd.exe', 'conhost.exe', 'openconsole.exe', 'powershell.exe', 'pwsh.exe'])
  const consoleProcesses = descendants.filter((process) => consoleNames.has(process.name.toLowerCase()))
  assert.ok(consoleProcesses.some((process) => ['powershell.exe', 'pwsh.exe'].includes(process.name.toLowerCase())), 'terminal shell process was not observed')
  const visible = new Set((Array.isArray(snapshot.visible) ? snapshot.visible : [snapshot.visible]).map(Number))
  const visibleConsoles = consoleProcesses.filter((process) => visible.has(process.processId))
  assert.deepEqual(visibleConsoles, [], `console subprocess unexpectedly owns a visible window: ${JSON.stringify(visibleConsoles)}`)
}

try {
  await seedPrimaryRuntimePermissionForTest({ userData })
  electronApp = await electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: packagedExecutable ? [] : [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_HOLD_STARTUP: '1',
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_STARTUP_PREVIEW_STATE: 'starting',
      DSH_DESKTOP_USER_DATA: userData,
      DSH_HOME: dshHome,
    },
  })
  await electronApp.firstWindow()
  const startupDeadline = Date.now() + 30_000
  let startup
  while (Date.now() < startupDeadline) {
    startup = electronApp.windows().find((page) => !page.isClosed() && page.url().includes('/ui/startup.html'))
    if (startup) break
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  assert.ok(startup, 'startup surface did not become available')
  const browserWindowIdsBefore = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => window.id))
  await startup.getByRole('button', { name: /工具|Tools/u }).click()
  await startup.getByRole('menuitem', { name: /内置终端|Built-in Terminal/u }).click()

  const deadline = Date.now() + 20_000
  let terminal
  while (Date.now() < deadline) {
    terminal = electronApp.windows().find((page) => page.url().includes('/ui/terminal.html'))
    if (terminal) break
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  assert.ok(terminal, 'built-in terminal panel did not open')
  const embedding = await electronApp.evaluate(({ BrowserWindow, webContents }) => {
    const terminalContents = webContents.getAllWebContents().find((contents) => contents.getURL().includes('/ui/terminal.html'))
    const owner = terminalContents ? BrowserWindow.fromWebContents(terminalContents) : undefined
    return {
      found: terminalContents !== undefined,
      isPrimaryWindowContents: Boolean(terminalContents && owner?.webContents?.id === terminalContents.id),
      ownerWindowId: owner?.id,
      browserWindowIds: BrowserWindow.getAllWindows().map((window) => window.id),
    }
  })
  assert.equal(embedding.found, true)
  assert.equal(embedding.isPrimaryWindowContents, false, 'terminal must be a child view, not a popup BrowserWindow')
  assert.ok(embedding.browserWindowIds.every((id) => browserWindowIdsBefore.includes(id)), 'opening terminal must not add a window')
  assert.ok(browserWindowIdsBefore.includes(embedding.ownerWindowId), 'terminal must stay attached to the existing Desktop window')
  terminal.on('pageerror', (error) => console.error(`terminal renderer error: ${error.message}`))
  await terminal.locator('#terminal-status[data-state="ready"]').waitFor({ state: 'visible', timeout: 20_000 })
  await assertNoVisibleConsoleDescendants(electronApp.process().pid)
  await terminal.locator('.xterm-helper-textarea').focus()
  await terminal.keyboard.type('Write-Output "__DSH_TERMINAL_OK__"')
  await terminal.keyboard.press('Enter')
  await terminal.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent?.includes('__DSH_TERMINAL_OK__'), undefined, {
    timeout: 15_000,
  })

  await terminal.keyboard.type('git --version')
  await terminal.keyboard.press('Enter')
  await terminal.waitForFunction(() => /git version [0-9]/u.test(document.querySelector('.xterm-rows')?.textContent ?? ''), undefined, {
    timeout: 15_000,
  })
  await terminal.keyboard.type('pnpm --version')
  await terminal.keyboard.press('Enter')
  await terminal.waitForFunction(() => /11\.22\.0/u.test(document.querySelector('.xterm-rows')?.textContent ?? ''), undefined, {
    timeout: 15_000,
  }).catch(async error => {
    console.error(`isolated terminal pnpm probe output: ${(await terminal.locator('.xterm-rows').textContent() ?? '').slice(-5_000)}`)
    throw error
  })
  const expectedPnpmShim = resolve(userData, 'runtime-bin', 'pnpm.cmd')
  await terminal.keyboard.type('Write-Output ("__DSH_PNPM__" + (Get-Command pnpm).Source)')
  await terminal.keyboard.press('Enter')
  await terminal.waitForFunction((expected) => {
    const output = document.querySelector('.xterm-rows')?.textContent ?? ''
    return output.toLowerCase().includes(`__dsh_pnpm__${expected}`.toLowerCase())
  }, expectedPnpmShim, { timeout: 15_000 })
  const expectedProfileCwd = resolve(dshHome, 'profiles', 'desktop')
  await terminal.keyboard.type(createPowerShellCwdProbe(expectedProfileCwd))
  await terminal.keyboard.press('Enter')
  await terminal.waitForFunction(({ success, mismatch }) => {
    const output = document.querySelector('.xterm-rows')?.textContent ?? ''
    return output.includes(success) || output.includes(mismatch)
  }, { success: CWD_PROBE_SUCCESS, mismatch: CWD_PROBE_MISMATCH }, { timeout: 15_000 })
  const terminalOutput = await terminal.locator('.xterm-rows').textContent() ?? ''
  assert.ok(
    terminalOutput.includes(CWD_PROBE_SUCCESS),
    `terminal shell cwd does not match the Desktop Profile: ${terminalOutput.slice(-2_000)}`,
  )
  const context = await terminal.locator('#terminal-context').textContent()
  assert.match(context ?? '', /PowerShell/u)
  assert.ok(
    (context ?? '').toLowerCase().includes(expectedProfileCwd.toLowerCase()),
    `terminal context does not identify the Desktop Profile cwd: ${context}`,
  )
  await Promise.all([
    terminal.waitForEvent('close'),
    terminal.getByRole('button', { name: '收起内置终端', exact: true }).click(),
  ])
  await startup.waitForTimeout(300)
  assert.equal(electronApp.windows().some((page) => page.url().includes('/ui/terminal.html')), false)
  assert.equal(startup.isClosed(), false)
  if (!packagedExecutable) {
    // Real renderer check: a slow main-process PATH resolver must not hold
    // loadFile/visibility hostage, and closing during that wait creates no PTY.
    const delayed = await electronApp.evaluate(async ({ BrowserWindow, WebContentsView, ipcMain }, modulePath) => {
      const { createDesktopTerminalPanel } = process.getBuiltinModule('module').createRequire(modulePath)(modulePath)
      const parent = BrowserWindow.getAllWindows()[0]
      const probe = { started: false, spawned: 0, release: undefined, panel: undefined }
      globalThis.__dshTerminalDelayProbe = probe
      const pendingPaths = new Promise(resolve => { probe.release = resolve })
      probe.panel = await createDesktopTerminalPanel({
        WebContentsView, browserWindow: parent, ipcMain, cwd: process.cwd(),
        resolvePathEntries: () => { probe.started = true; return pendingPaths },
        loadPty: async () => ({ spawn: () => { probe.spawned += 1; throw new Error('late PTY spawn') } }),
        installContextMenu: () => () => {},
      })
      return { visible: probe.panel.view.getVisible(), spawned: probe.spawned }
    }, fileURLToPath(new URL('../src/terminal-window.mjs', import.meta.url)))
    assert.equal(delayed.visible, true)
    assert.equal(delayed.spawned, 0)
    const waitingTerminal = electronApp.windows().find(page => page.url().includes('/ui/terminal.html'))
    assert.ok(waitingTerminal)
    await waitingTerminal.getByRole('button', { name: '收起内置终端', exact: true }).click()
    const closedWhileWaiting = await electronApp.evaluate(async () => {
      const probe = globalThis.__dshTerminalDelayProbe
      probe.release([])
      await new Promise(resolve => setTimeout(resolve, 50))
      const result = { disposed: probe.panel.disposed, spawned: probe.spawned, started: probe.started }
      delete globalThis.__dshTerminalDelayProbe
      return result
    })
    assert.deepEqual(closedWhileWaiting, { disposed: true, spawned: 0, started: true })
    console.log('verified real terminal renderer stays visible and closes safely while PATH verification is stalled')
    await electronApp.evaluate(async ({ BrowserWindow, WebContentsView, ipcMain }, modulePath) => {
      const { createDesktopTerminalPanel } = process.getBuiltinModule('module').createRequire(modulePath)(modulePath)
      const probe = { calls: 0, spawns: 0, kills: 0, reject: undefined, panel: undefined }
      globalThis.__dshTerminalRestartProbe = probe
      const pendingPaths = new Promise((_resolve, reject) => { probe.reject = reject })
      probe.panel = await createDesktopTerminalPanel({
        WebContentsView, browserWindow: BrowserWindow.getAllWindows()[0], ipcMain, cwd: process.cwd(),
        resolvePathEntries: () => ++probe.calls === 1 ? pendingPaths : [],
        loadPty: async () => ({ spawn: () => {
          probe.spawns += 1
          return { write() {}, resize() {}, kill() { probe.kills += 1 }, onData() { return { dispose() {} } }, onExit() { return { dispose() {} } } }
        } }),
        installContextMenu: () => () => {},
      })
    }, fileURLToPath(new URL('../src/terminal-window.mjs', import.meta.url)))
    const restartingTerminal = electronApp.windows().find(page => page.url().includes('/ui/terminal.html'))
    assert.ok(restartingTerminal)
    await restartingTerminal.locator('#terminal-status[data-state="starting"]').waitFor()
    await restartingTerminal.getByRole('button', { name: '重启会话', exact: true }).click()
    await restartingTerminal.locator('#terminal-status[data-state="ready"]').waitFor()
    await electronApp.evaluate(() => globalThis.__dshTerminalRestartProbe.reject(new Error('obsolete PATH probe')))
    await restartingTerminal.waitForTimeout(100)
    assert.equal(await restartingTerminal.locator('#terminal-status').getAttribute('data-state'), 'ready')
    assert.deepEqual(await electronApp.evaluate(() => {
      const probe = globalThis.__dshTerminalRestartProbe
      return { calls: probe.calls, spawns: probe.spawns, kills: probe.kills }
    }), { calls: 2, spawns: 1, kills: 0 })
    // Playwright waitForEvent rejects on the deliberately injected crash
    // before Electron emits destroyed/close; observe the actual close event.
    const rendererClosed = new Promise((resolveClosed, rejectClosed) => {
      const timeout = setTimeout(() => rejectClosed(new Error('crashed terminal was not closed')), 15_000)
      restartingTerminal.once('close', () => { clearTimeout(timeout); resolveClosed() })
    })
    await electronApp.evaluate(() => globalThis.__dshTerminalRestartProbe.panel.webContents.forcefullyCrashRenderer())
    await rendererClosed
    assert.deepEqual(await electronApp.evaluate(() => {
      const probe = globalThis.__dshTerminalRestartProbe
      const result = { disposed: probe.panel.disposed, kills: probe.kills }
      delete globalThis.__dshTerminalRestartProbe
      return result
    }), { disposed: true, kills: 1 })
    assert.equal(startup.isClosed(), false)
    console.log('verified real terminal restart ignores stale PATH failure and renderer crash reclaims its isolated panel')
  }
  console.log('verified embedded PowerShell PTY, no popup BrowserWindow, no visible console subprocess, packaged Git and pnpm PATH, persistent Desktop Profile cwd, terminal output, and close cleanup')
} finally {
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
