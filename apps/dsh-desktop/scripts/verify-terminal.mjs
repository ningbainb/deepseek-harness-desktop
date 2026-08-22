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
  await startup.getByRole('button', { name: '打开内置终端', exact: true }).click()

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
  })
  const expectedPnpmShim = resolve(userData, 'runtime-bin', 'pnpm.cmd')
  await terminal.keyboard.type('Write-Output ("__DSH_PNPM__" + (Get-Command pnpm).Source)')
  await terminal.keyboard.press('Enter')
  await terminal.waitForFunction((expected) => {
    const output = document.querySelector('.xterm-rows')?.textContent ?? ''
    return output.toLowerCase().includes(`__dsh_pnpm__${expected}`.toLowerCase())
  }, expectedPnpmShim, { timeout: 15_000 })
  const expectedProfileCwd = resolve(dshHome, 'profiles', 'desktop')
  await terminal.keyboard.type('Write-Output ("__DSH_CWD__" + $PWD.Path)')
  await terminal.keyboard.press('Enter')
  await terminal.waitForFunction((expected) => {
    const output = document.querySelector('.xterm-rows')?.textContent ?? ''
    return output.toLowerCase().includes(`__dsh_cwd__${expected}`.toLowerCase())
  }, expectedProfileCwd, { timeout: 15_000 })
  const context = await terminal.locator('#terminal-context').textContent()
  assert.match(context ?? '', /PowerShell/u)
  await Promise.all([
    terminal.waitForEvent('close'),
    terminal.getByRole('button', { name: '收起内置终端', exact: true }).click(),
  ])
  await startup.waitForTimeout(300)
  assert.equal(electronApp.windows().some((page) => page.url().includes('/ui/terminal.html')), false)
  assert.equal(startup.isClosed(), false)
  console.log('verified embedded PowerShell PTY, no popup BrowserWindow, no visible console subprocess, packaged Git and pnpm PATH, persistent Desktop Profile cwd, terminal output, and close cleanup')
} finally {
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
