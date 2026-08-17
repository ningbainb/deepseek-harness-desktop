import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const desktopRoot = join(import.meta.dirname, '..')
const execFileAsync = promisify(execFile)

async function settleWithin(promise, timeoutMs, message) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function describeWindowsProcesses(ownedProcesses) {
  const traceCommand = [
    "$rows = foreach ($processId in ($env:DSH_TRACE_PIDS -split ',')) {",
    '  $dotnet = Get-Process -Id ([int] $processId) -ErrorAction SilentlyContinue',
    '  $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue',
    '  [pscustomobject]@{ ProcessId = $processId; ProcessName = $dotnet.ProcessName; DotNetPath = $dotnet.Path; CimName = $cim.Name; CimPath = $cim.ExecutablePath }',
    '}',
    '$rows | ConvertTo-Json -Compress',
  ].join('; ')
  try {
    const { stdout, stderr } = await execFileAsync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', traceCommand],
      {
        env: {
          ...process.env,
          DSH_TRACE_PIDS: ownedProcesses.map(({ child }) => child.pid).join(','),
        },
        timeout: 5_000,
        windowsHide: true,
      },
    )
    const expected = ownedProcesses.map(({ child }) => child.spawnfile).join(' | ')
    return `expected=${expected}; observed=${stdout.trim() || '<empty>'}; stderr=${stderr.trim() || '<empty>'}`
  } catch (error) {
    return `process trace unavailable: ${error.message}`
  }
}

test('NSIS preflight cleans only stale processes owned by the previous install', async () => {
  const config = await readFile(join(desktopRoot, 'electron-builder.yml'), 'utf8')
  const include = await readFile(join(desktopRoot, 'build', 'installer.nsh'), 'utf8')
  const cleanup = await readFile(join(desktopRoot, 'build', 'cleanup-stale-processes.ps1'), 'utf8')

  assert.match(config, /include: build\/installer\.nsh/u)
  assert.match(include, /customInit/u)
  assert.match(include, /cleanup-stale-processes\.ps1/u)
  assert.match(cleanup, /DeepSeek Harness Desktop\.exe/u)
  assert.match(cleanup, /Get-Item -LiteralPath \$InstallDirectory -ErrorAction Stop/u)
  assert.match(cleanup, /StartsWith\(\$resourcePrefix, \$comparison\)/u)
  assert.match(cleanup, /Get-ChildItem -LiteralPath \$resourceRoot -Recurse -File -Filter '\*\.exe'/u)
  assert.match(cleanup, /PROCESS_QUERY_LIMITED_INFORMATION/u)
  assert.match(cleanup, /QueryFullProcessImageName/u)
  assert.match(cleanup, /GetLongPathNameW/u)
  assert.match(cleanup, /CreateToolhelp32Snapshot/u)
  assert.match(cleanup, /GetParentProcessIds/u)
  assert.match(cleanup, /\[DshInstaller\.ProcessPath\]::TryGet/u)
  assert.match(cleanup, /\[DshInstaller\.ProcessPath\]::Canonicalize/u)
  assert.match(cleanup, /\$candidatePathSet\.Contains\(\$path\)/u)
  assert.match(cleanup, /\$candidatePathSet\.Contains\(\$canonicalPath\)/u)
  assert.match(cleanup, /\$knownExecutable -or \$resourceChild/u)
  assert.match(cleanup, /StartsWith\(\$canonicalResourceInputPrefix, \$comparison\)/u)
  assert.doesNotMatch(cleanup, /Get-CimInstance|\.MainModule|\$process\.Path/u)
  assert.match(cleanup, /Sort-Object[\s\S]*Descending/u)
  assert.match(cleanup, /for \(\$attempt = 0; \$attempt -lt \$maxAttempts/u)
  assert.match(cleanup, /Start-Sleep -Milliseconds/u)
  assert.match(cleanup, /exit 32/u)
  assert.match(include, /IDRETRY cleanup_retry/u)
  assert.match(include, /StrCmp \$0 "0" cleanup_done/u)
  assert.doesNotMatch(cleanup, /taskkill|\/IM\s|ProcessName/u)
})

test('Windows installer preflight terminates the old app, resources, and plugin descendants', {
  skip: process.platform !== 'win32',
  timeout: 20_000,
}, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-installer-cleanup-'))
  const installDirectory = join(temporary, "用户's Desktop")
  const executable = join(installDirectory, 'DeepSeek Harness Desktop.exe')
  const resourceExecutable = join(installDirectory, 'resources', 'bin', 'dsh-runtime-helper.exe')
  const pluginHostExecutable = join(installDirectory, 'resources', 'bin', 'plugin-prepare-host.exe')
  const systemPing = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'PING.EXE')
  const ownedProcesses = []
  let pluginDescendantPid
  try {
    await mkdir(join(installDirectory, 'resources', 'bin'), { recursive: true })
    await copyFile(systemPing, executable)
    await copyFile(systemPing, resourceExecutable)
    await copyFile(process.execPath, pluginHostExecutable)
    for (const target of [executable, resourceExecutable]) {
      const child = spawn(target, ['-t', '127.0.0.1'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      const exit = once(child, 'exit')
      ownedProcesses.push({ child, exit })
      await once(child, 'spawn')
      assert.equal(child.exitCode, null)
    }
    const pluginHost = spawn(pluginHostExecutable, [
      '-e',
      "const { spawn } = require('node:child_process'); const child = spawn(process.env.SystemRoot + '\\\\System32\\\\PING.EXE', ['-t', '127.0.0.1'], { stdio: 'ignore', windowsHide: true }); process.stdout.write(String(child.pid) + '\\n'); setInterval(() => {}, 1000)",
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const pluginHostExit = once(pluginHost, 'exit')
    ownedProcesses.push({ child: pluginHost, exit: pluginHostExit })
    await once(pluginHost, 'spawn')
    const [pidChunk] = await once(pluginHost.stdout, 'data')
    pluginDescendantPid = Number.parseInt(pidChunk.toString('utf8').trim(), 10)
    assert.equal(Number.isInteger(pluginDescendantPid), true)
    assert.doesNotThrow(() => process.kill(pluginDescendantPid, 0))
    await execFileAsync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        join(desktopRoot, 'build', 'cleanup-stale-processes.ps1'),
        '-InstallDirectory',
        installDirectory,
      ],
      { timeout: 10_000, windowsHide: true },
    )
    let ownedExits
    try {
      ownedExits = await settleWithin(
        Promise.all(ownedProcesses.map(({ exit }) => exit)),
        3_000,
        'installer cleanup returned without terminating every owned process',
      )
    } catch (error) {
      const trace = await describeWindowsProcesses(ownedProcesses)
      throw new Error(`${error.message}; ${trace}`)
    }
    for (const [ownedExitCode] of ownedExits) {
      assert.notEqual(ownedExitCode, 0)
    }
    assert.throws(
      () => process.kill(pluginDescendantPid, 0),
      (error) => error?.code === 'ESRCH',
      'plugin prepare descendant survived installer cleanup',
    )
  } finally {
    for (const { child } of ownedProcesses) {
      if (child.exitCode === null) child.kill('SIGKILL')
    }
    try {
      await settleWithin(
        Promise.allSettled(ownedProcesses.map(({ exit }) => exit)),
        2_000,
        'owned process teardown did not settle',
      )
    } catch {}
    if (Number.isInteger(pluginDescendantPid)) {
      try { process.kill(pluginDescendantPid, 'SIGKILL') } catch {}
    }
    await rm(temporary, { recursive: true, force: true })
  }
})
