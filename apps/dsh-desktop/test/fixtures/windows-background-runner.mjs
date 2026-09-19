// Exercise the real official Windows Job runner under Electron's GUI subsystem.
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'

const require = createRequire(import.meta.url)
const runtimeRequire = createRequire(require.resolve('@deepseek-ai/dsh/package.json'))
const baseRequire = createRequire(runtimeRequire.resolve('@deepseek-ai/dsh-base/package.json'))
const { LocalSubprocessRuntime } = await import(pathToFileURL(baseRequire.resolve('@deepseek-ai/dsh-subprocess-local')).href)
const ctx = new Context()
const service = new LocalSubprocessRuntime(ctx)
const koffi = require('koffi')
const kernel32 = koffi.load('kernel32.dll')
const consoleProcesses = kernel32.func('__stdcall', 'GetConsoleProcessList', 'uint32', ['uint32*', 'uint32'])
const consoleWindow = kernel32.func('__stdcall', 'GetConsoleWindow', 'uintptr', [])
const runtimeConsole = { window: consoleWindow(), members: consoleProcesses(Buffer.alloc(128), 32) }
const positiveControl = process.argv.includes('--positive-control')
const script = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DshConsoleProbe {
  [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
  [DllImport("kernel32.dll")] public static extern uint GetConsoleProcessList([Out] uint[] processes, uint size);
  [DllImport("kernel32.dll")] public static extern bool FreeConsole();
  [DllImport("kernel32.dll")] public static extern bool AllocConsole();
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
}
'@
$ForceVisible = ${positiveControl ? '$true' : '$false'}
if ($ForceVisible) {
  [void][DshConsoleProbe]::FreeConsole()
  if (-not [DshConsoleProbe]::AllocConsole()) { throw 'positive control could not allocate its own console' }
  [void][DshConsoleProbe]::ShowWindow([DshConsoleProbe]::GetConsoleWindow(), 5)
}
$handle = [DshConsoleProbe]::GetConsoleWindow()
$processes = New-Object uint[] 32
$count = [DshConsoleProbe]::GetConsoleProcessList($processes, 32)
[PSCustomObject]@{ console = $handle.ToInt64(); visible = [DshConsoleProbe]::IsWindowVisible($handle); pid = $PID; count = $count; processes = @($processes | Where-Object { $_ -ne 0 }) } | ConvertTo-Json -Compress
`
try {
  const results = []
  for (let index = 0; index < 3; index += 1) {
    if (positiveControl) {
      // Probe the observer with a deliberately unhidden raw child. The
      // official alpha.2 subprocess runner can hide consoles by itself, so
      // it is no longer a reliable positive control for Desktop's shim.
      const raw = spawnSync('powershell.exe', [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ], { cwd: process.cwd(), windowsHide: false, encoding: 'utf8', timeout: 15_000 })
      if (raw.status !== 0) throw new Error(`positive console probe failed: ${raw.stderr || raw.error}`)
      results.push(JSON.parse(raw.stdout))
      continue
    }
    const handle = service.spawn({
      argv: ['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      cwd: process.cwd(),
      stdio: { stdin: 'ignore', stdout: { maxBytes: 16_384 }, stderr: { maxBytes: 16_384 } },
      graceMs: 1_000,
      // A fresh hosted Windows runner may spend more than 15 seconds preparing
      // PowerShell's first-use module cache before Add-Type executes. Keep the
      // repeated warm probes strict while giving only the first cold probe a
      // bounded startup allowance.
      signal: AbortSignal.timeout(index === 0 ? 30_000 : 15_000),
    })
    const outcome = await handle.done
    await handle.waitForExit()
    const stdout = handle.collected.stdout.readFrom(0).text
    const stderr = handle.collected.stderr.readFrom(0).text
    if (outcome.exitCode !== 0) throw new Error(`console probe failed: ${stderr}`)
    results.push(JSON.parse(stdout))
  }
  const io = service.spawn({
    argv: ['cmd.exe', '/d', '/c', 'echo DSH_STDOUT& echo DSH_STDERR 1>&2& exit /b 7'],
    cwd: process.cwd(),
    stdio: { stdin: 'ignore', stdout: { maxBytes: 16_384 }, stderr: { maxBytes: 16_384 } },
    graceMs: 1_000, signal: AbortSignal.timeout(15_000),
  })
  assert.equal((await io.done).exitCode, 7)
  await io.waitForExit()
  assert.match(io.collected.stdout.readFrom(0).text, /DSH_STDOUT/u)
  assert.match(io.collected.stderr.readFrom(0).text, /DSH_STDERR/u)
  process.stdout.write(`DSH_CONSOLE_PROBE=${JSON.stringify({ runtimePid: process.pid, runtimeConsole, results })}\n`)
} finally {
  await service.disposeManagedProcesses()
}
