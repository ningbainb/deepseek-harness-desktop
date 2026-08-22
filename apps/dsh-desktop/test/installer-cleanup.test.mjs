import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
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
    '  [pscustomobject]@{ ProcessId = $processId; ProcessName = $dotnet.ProcessName; DotNetPath = $dotnet.Path; CimName = $cim.Name; CimPath = $cim.ExecutablePath; CimCommandLine = $cim.CommandLine }',
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

async function waitForWindowsProcessCommandLines(processIds) {
  const probeCommand = [
    '$expected = @($env:DSH_EXPECTED_PROCESS_IDS -split "," | ForEach-Object { [uint32] $_ })',
    '$deadline = [DateTime]::UtcNow.AddSeconds(8)',
    'do {',
    '  $rows = @(foreach ($targetId in $expected) { Get-CimInstance Win32_Process -Filter "ProcessId = $targetId" -ErrorAction SilentlyContinue })',
    '  $ready = @($rows | Where-Object { -not [string]::IsNullOrWhiteSpace($_.CommandLine) })',
    '  if ($ready.Count -eq $expected.Count) { exit 0 }',
    '  Start-Sleep -Milliseconds 100',
    '} while ([DateTime]::UtcNow -lt $deadline)',
    'Write-Error "process command lines did not become visible through WMI"',
    'exit 1',
  ].join('\n')
  await execFileAsync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', probeCommand],
    {
      env: {
        ...process.env,
        DSH_EXPECTED_PROCESS_IDS: processIds.join(','),
      },
      timeout: 10_000,
      windowsHide: true,
    },
  )
}

test('NSIS preflight cleans only stale processes owned by the previous install', async () => {
  const config = await readFile(join(desktopRoot, 'electron-builder.yml'), 'utf8')
  const include = await readFile(join(desktopRoot, 'build', 'installer.nsh'), 'utf8')
  const cleanup = await readFile(join(desktopRoot, 'build', 'cleanup-stale-processes.ps1'), 'utf8')

  assert.match(config, /include: build\/installer\.nsh/u)
  assert.match(config, /oneClick: true/u)
  assert.match(config, /perMachine: false/u)
  assert.match(config, /allowElevation: false/u)
  assert.match(config, /packElevateHelper: false/u)
  assert.match(config, /from: build\/update-shutdown-v1[\s\S]*to: update-shutdown-v1/u)
  assert.match(config, /from: build\/update-shutdown-v2[\s\S]*to: update-shutdown-v2/u)
  assert.match(config, /from: build\/installer-upgrade-v3[\s\S]*to: installer-upgrade-v3/u)
  assert.match(include, /customCheckAppRunning/u)
  assert.doesNotMatch(include, /customInit/u)
  assert.match(include, /cleanup-stale-processes\.ps1/u)
  assert.match(include, /SetOutPath "\$TEMP"/u)
  assert.doesNotMatch(include, /SetOutPath "\$PLUGINSDIR"/u)
  assert.match(include, /-InstallRegistryKey "\$\{INSTALL_REGISTRY_KEY\}"/u)
  assert.match(include, /-UninstallRegistryKey "\$\{UNINSTALL_REGISTRY_KEY\}"/u)
  assert.match(include, /-PrepareExistingUpgrade/u)
  assert.match(include, /!ifdef BUILD_UNINSTALLER[\s\S]*!else[\s\S]*-PrepareExistingUpgrade/u)
  assert.match(cleanup, /DeepSeek Harness Desktop\.exe/u)
  assert.match(cleanup, /Registry::\$hive\\\$InstallRegistryKey/u)
  assert.match(cleanup, /Get-UninstallerDirectory/u)
  assert.match(cleanup, /StartsWith\(\$resourcePrefix, \$comparison\)/u)
  assert.match(cleanup, /PROCESS_QUERY_LIMITED_INFORMATION/u)
  assert.match(cleanup, /QueryFullProcessImageName/u)
  assert.match(cleanup, /GetLongPathNameW/u)
  assert.match(cleanup, /\[DshInstaller\.ProcessPath\]::TryGet/u)
  assert.match(cleanup, /\[DshInstaller\.ProcessPath\]::Canonicalize/u)
  assert.match(cleanup, /\$installRootReferences\.Add\(\$fullPath\)/u)
  assert.match(cleanup, /foreach \(\$reference in \$installRootReferences\)/u)
  assert.match(cleanup, /update-shutdown-v1/u)
  assert.match(cleanup, /update-shutdown-v2/u)
  assert.match(cleanup, /dsh-desktop-update-shutdown-receipt=2/u)
  assert.match(cleanup, /--shutdown-for-update/u)
  assert.match(cleanup, /--shutdown-token=\$token/u)
  assert.match(cleanup, /RandomNumberGenerator/u)
  assert.match(cleanup, /dsh-desktop-shutdown-\$token\.json/u)
  assert.match(cleanup, /schemaVersion -isnot \[int\]/u)
  assert.match(cleanup, /\[int64\] \$receipt\.schemaVersion -ne 2/u)
  assert.match(cleanup, /extensionsQuiesced -ne \$true/u)
  assert.match(cleanup, /receipt-fallback/u)
  assert.match(cleanup, /Test-IsDesktopBrowserProcess/u)
  assert.match(cleanup, /--expose-internals/u)
  assert.match(cleanup, /Start-Process[\s\S]*-WindowStyle Hidden/u)
  assert.match(cleanup, /Get-CimInstance Win32_Process/u)
  assert.match(cleanup, /\.Name\.Equals\(\$mainExecutableName, \$comparison\)/u)
  assert.match(cleanup, /\$selfPid/u)
  assert.match(cleanup, /Get-AncestorProcessIds/u)
  assert.match(cleanup, /\$excludedProcessIds\.Contains\(\$processId\)/u)
  assert.doesNotMatch(cleanup, /Test-InstallerUpgradeMarker|installerUpgradeMarker/u)
  assert.match(cleanup, /Stage-UpgradeInstalls/u)
  assert.match(cleanup, /\[System\.IO\.Directory\]::Move/u)
  assert.match(cleanup, /RecycleOption\]::SendToRecycleBin/u)
  assert.match(cleanup, /IndexOf\(\$root, \$comparison\)/u)
  assert.match(cleanup, /Get-CommandLineVariants/u)
  assert.match(cleanup, /\\u62D2\\u7EDD\\u8BBF\\u95EE/u)
  assert.doesNotMatch(cleanup, /[^\x00-\x7F]/u)
  assert.match(cleanup, /FromBase64String/u)
  assert.match(cleanup, /\[System\.Text\.Encoding\]::Unicode/u)
  assert.doesNotMatch(cleanup, /\.MainModule|\$process\.Path/u)
  assert.doesNotMatch(cleanup, /CreateToolhelp32Snapshot/u)
  assert.doesNotMatch(cleanup, /Get-ChildItem -LiteralPath \$resourceRoot/u)
  assert.match(cleanup, /for \(\$attempt = 0; \$attempt -lt \$forceAttempts/u)
  assert.match(cleanup, /Start-Sleep -Milliseconds/u)
  assert.match(cleanup, /exit 32/u)
  assert.match(cleanup, /exit 33/u)
  assert.match(cleanup, /exit 34/u)
  assert.match(cleanup, /exit 35/u)
  assert.match(cleanup, /exit 36/u)
  assert.match(include, /IDRETRY cleanup_retry/u)
  assert.match(include, /StrCmp \$0 "0" cleanup_done/u)
  assert.match(include, /StrCmp \$0 "32" cleanup_busy/u)
  assert.match(include, /StrCmp \$0 "34" cleanup_permission/u)
  assert.match(include, /StrCmp \$0 "35" cleanup_protocol/u)
  assert.match(include, /StrCmp \$0 "36" cleanup_locked/u)
  assert.match(include, /StrCmp \$0 "33" cleanup_script_error/u)
  for (const messageBox of include.split(/\r?\n/u).filter(line => line.trimStart().startsWith('MessageBox '))) {
    assert.match(messageBox, /\/SD (?:IDCANCEL|IDOK)/u)
  }
  assert.doesNotMatch(cleanup, /taskkill|\/IM\s|ProcessName/u)
})

test('Windows installer reports a replacement-file lock separately from a running PID', {
  skip: process.platform !== 'win32',
  timeout: 30_000,
}, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-installer-lock-'))
  const installDirectory = join(temporary, 'previous-install')
  const executable = join(installDirectory, 'DeepSeek Harness Desktop.exe')
  let locker
  try {
    await mkdir(installDirectory, { recursive: true })
    await writeFile(executable, 'locked fixture', 'utf8')
    locker = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$stream = [IO.File]::Open($env:DSH_LOCK_PATH, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None); Write-Output ready; try { Start-Sleep -Seconds 60 } finally { $stream.Dispose() }',
    ], {
      env: { ...process.env, DSH_LOCK_PATH: executable },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    await once(locker, 'spawn')
    const [ready] = await once(locker.stdout, 'data')
    assert.match(ready.toString('utf8'), /ready/u)

    await assert.rejects(
      execFileAsync('powershell.exe', [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        join(desktopRoot, 'build', 'cleanup-stale-processes.ps1'),
        '-InstallDirectory',
        installDirectory,
      ], { timeout: 20_000, windowsHide: true }),
      error => error?.code === 36 && /locked path=/u.test(error.stdout ?? ''),
    )
  } finally {
    if (locker?.exitCode === null) {
      const exit = once(locker, 'exit')
      locker.kill('SIGKILL')
      await settleWithin(exit, 2_000, 'file-lock fixture did not exit').catch(() => {})
    }
    await rm(temporary, { recursive: true, force: true })
  }
})

test('Windows 2.3 v1 shutdown marker falls back to exact-path cleanup', {
  skip: process.platform !== 'win32',
  timeout: 25_000,
}, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-installer-v23-'))
  const installDirectory = join(temporary, '2.3.0')
  const resources = join(installDirectory, 'resources')
  const executable = join(installDirectory, 'DeepSeek Harness Desktop.exe')
  const systemPing = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'PING.EXE')
  let legacy
  try {
    await mkdir(resources, { recursive: true })
    await copyFile(systemPing, executable)
    await writeFile(join(resources, 'update-shutdown-v1'), 'dsh-desktop-update-shutdown-protocol=1\n', 'utf8')
    legacy = spawn(executable, ['-t', '127.0.0.1'], { windowsHide: true, stdio: 'ignore' })
    const legacyExit = once(legacy, 'exit')
    await once(legacy, 'spawn')

    await execFileAsync('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(desktopRoot, 'build', 'cleanup-stale-processes.ps1'),
      '-InstallDirectory',
      installDirectory,
    ], { timeout: 20_000, windowsHide: true })
    await settleWithin(legacyExit, 2_000, '2.3 legacy process survived installer cleanup')
  } finally {
    if (legacy?.exitCode === null) {
      const exit = once(legacy, 'exit')
      legacy.kill('SIGKILL')
      await settleWithin(exit, 2_000, '2.3 fixture did not exit').catch(() => {})
    }
    await rm(temporary, { recursive: true, force: true })
  }
})

test('Windows installer preflight accepts a missing previous install directory', {
  skip: process.platform !== 'win32',
}, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-installer-missing-'))
  const missingInstallDirectory = join(temporary, 'already-removed')
  const registryRoot = `Software\\DeepSeekHarnessDesktopTests\\missing-${process.pid}-${Date.now()}`
  const uninstallRegistryKey = `${registryRoot}\\Uninstall`
  try {
    await execFileAsync('reg.exe', [
      'ADD',
      `HKCU\\${uninstallRegistryKey}`,
      '/v',
      'UninstallString',
      '/t',
      'REG_SZ',
      '/d',
      `"${join(missingInstallDirectory, 'Uninstall DeepSeek Harness Desktop.exe')}" /currentuser`,
      '/f',
    ], { timeout: 5_000, windowsHide: true })
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
        missingInstallDirectory,
        '-UninstallRegistryKey',
        uninstallRegistryKey,
        '-PrepareExistingUpgrade',
      ],
      { timeout: 10_000, windowsHide: true },
    )
    await assert.rejects(
      execFileAsync('reg.exe', ['QUERY', `HKCU\\${uninstallRegistryKey}`], { windowsHide: true }),
      error => error?.code === 1,
    )
  } finally {
    await execFileAsync('reg.exe', ['DELETE', `HKCU\\${registryRoot}`, '/f'], {
      timeout: 5_000,
      windowsHide: true,
    }).catch(() => {})
    await rm(temporary, { recursive: true, force: true })
  }
})

test('Windows installer preflight excludes its installer and uninstaller ancestor chain', {
  skip: process.platform !== 'win32',
  timeout: 20_000,
}, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-installer-parent-'))
  const installDirectory = join(temporary, 'previous-install')
  const cleanupScript = join(desktopRoot, 'build', 'cleanup-stale-processes.ps1')
  const wrapper = [
    "const { spawnSync } = require('node:child_process')",
    'const installDirectory = process.argv[1]',
    'const cleanupScript = process.argv[2]',
    "const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', cleanupScript, '-InstallDirectory', installDirectory], { windowsHide: true, encoding: 'utf8' })",
    "if (result.stdout) process.stdout.write(result.stdout)",
    "if (result.stderr) process.stderr.write(result.stderr)",
    'process.exit(result.status ?? 1)',
  ].join('; ')
  try {
    await mkdir(installDirectory, { recursive: true })
    await execFileAsync(process.execPath, [
      '-e',
      wrapper,
      installDirectory,
      cleanupScript,
    ], { timeout: 15_000, windowsHide: true })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('Windows installer stages an unmarked legacy install before electron-builder invokes its broken uninstaller', {
  skip: process.platform !== 'win32',
  timeout: 20_000,
}, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-installer-legacy-stage-'))
  const installDirectory = join(temporary, 'DeepSeek Harness Desktop')
  const resources = join(installDirectory, 'resources')
  const preservedUserData = join(temporary, 'user-data', 'settings.json')
  const registryRoot = `Software\\DeepSeekHarnessDesktopTests\\legacy-${process.pid}-${Date.now()}`
  const installRegistryKey = `${registryRoot}\\Install`
  const uninstallRegistryKey = `${registryRoot}\\Uninstall`
  try {
    await mkdir(resources, { recursive: true })
    await mkdir(join(temporary, 'user-data'), { recursive: true })
    await writeFile(join(installDirectory, 'DeepSeek Harness Desktop.exe'), 'legacy executable', 'utf8')
    await writeFile(join(resources, 'app.asar'), 'legacy app archive', 'utf8')
    await writeFile(join(installDirectory, 'Uninstall DeepSeek Harness Desktop.exe'), 'broken legacy uninstaller', 'utf8')
    await writeFile(preservedUserData, '{"preserved":true}\n', 'utf8')
    await execFileAsync('reg.exe', [
      'ADD',
      `HKCU\\${installRegistryKey}`,
      '/v',
      'InstallLocation',
      '/t',
      'REG_SZ',
      '/d',
      installDirectory,
      '/f',
    ], { timeout: 5_000, windowsHide: true })
    await execFileAsync('reg.exe', [
      'ADD',
      `HKCU\\${uninstallRegistryKey}`,
      '/v',
      'UninstallString',
      '/t',
      'REG_SZ',
      '/d',
      `"${join(installDirectory, 'Uninstall DeepSeek Harness Desktop.exe')}" /currentuser`,
      '/f',
    ], { timeout: 5_000, windowsHide: true })

    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(desktopRoot, 'build', 'cleanup-stale-processes.ps1'),
      '-InstallDirectory',
      installDirectory,
      '-InstallRegistryKey',
      installRegistryKey,
      '-UninstallRegistryKey',
      uninstallRegistryKey,
      '-PrepareExistingUpgrade',
    ], { timeout: 15_000, windowsHide: true })

    assert.match(stdout, /upgrade-install-staged root=/u)
    await assert.rejects(readFile(join(resources, 'app.asar')), error => error?.code === 'ENOENT')
    assert.equal(await readFile(preservedUserData, 'utf8'), '{"preserved":true}\n')
    await assert.rejects(
      execFileAsync('reg.exe', ['QUERY', `HKCU\\${installRegistryKey}`], { windowsHide: true }),
      error => error?.code === 1,
    )
    await assert.rejects(
      execFileAsync('reg.exe', ['QUERY', `HKCU\\${uninstallRegistryKey}`], { windowsHide: true }),
      error => error?.code === 1,
    )
    assert.deepEqual(
      (await readdir(temporary)).filter(name => name.startsWith('.dsh-desktop-update-old-')),
      [],
    )
  } finally {
    await execFileAsync('reg.exe', ['DELETE', `HKCU\\${registryRoot}`, '/f'], {
      timeout: 5_000,
      windowsHide: true,
    }).catch(() => {})
    await rm(temporary, { recursive: true, force: true })
  }
})

test('Windows installer stages a marked 2.5 install instead of trusting its old uninstaller', {
  skip: process.platform !== 'win32',
  timeout: 15_000,
}, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-installer-modern-stage-'))
  const installDirectory = join(temporary, 'DeepSeek Harness Desktop')
  const resources = join(installDirectory, 'resources')
  try {
    await mkdir(resources, { recursive: true })
    await writeFile(join(installDirectory, 'DeepSeek Harness Desktop.exe'), 'modern executable', 'utf8')
    await writeFile(join(resources, 'app.asar'), 'modern app archive', 'utf8')
    await writeFile(join(resources, 'installer-upgrade-v3'), 'dsh-desktop-installer-upgrade=3\n', 'utf8')
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(desktopRoot, 'build', 'cleanup-stale-processes.ps1'),
      '-InstallDirectory',
      installDirectory,
      '-PrepareExistingUpgrade',
    ], { timeout: 10_000, windowsHide: true })
    assert.match(stdout, /upgrade-install-staged root=/u)
    await assert.rejects(readFile(join(resources, 'app.asar')), error => error?.code === 'ENOENT')
    assert.deepEqual(
      (await readdir(temporary)).filter(name => name.startsWith('.dsh-desktop-update-old-')),
      [],
    )
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('Windows 2.2 installer check terminates owned processes and legacy same-name app copies without killing unrelated runtimes', {
  skip: process.platform !== 'win32',
  timeout: 30_000,
}, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-installer-cleanup-'))
  const installDirectory = join(temporary, "用户's Desktop")
  const selectedInstallDirectory = join(temporary, 'new-empty-location')
  const unrelatedDirectory = join(temporary, 'unrelated')
  const registryKey = `Software\\DeepSeekHarnessDesktopTests\\${process.pid}-${Date.now()}`
  const executable = join(installDirectory, 'DeepSeek Harness Desktop.exe')
  const resourceExecutable = join(installDirectory, 'resources', 'bin', 'dsh-runtime-helper.exe')
  const pluginHostExecutable = join(installDirectory, 'resources', 'bin', 'plugin-prepare-host.exe')
  const unrelatedExecutable = join(unrelatedDirectory, 'DeepSeek Harness Desktop.exe')
  const systemPing = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'PING.EXE')
  const ownedProcesses = []
  let unrelatedProcess
  let unrelatedExit
  let pluginDescendantPid
  let encodedUnrelatedProcess
  let officialWebProcess
  try {
    await mkdir(join(installDirectory, 'resources', 'bin'), { recursive: true })
    await mkdir(unrelatedDirectory, { recursive: true })
    await copyFile(systemPing, executable)
    await copyFile(systemPing, resourceExecutable)
    await copyFile(process.execPath, pluginHostExecutable)
    await copyFile(systemPing, unrelatedExecutable)
    await execFileAsync('reg.exe', [
      'ADD',
      `HKCU\\${registryKey}`,
      '/v',
      'InstallLocation',
      '/t',
      'REG_SZ',
      '/d',
      installDirectory,
      '/f',
    ], { timeout: 5_000, windowsHide: true })
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
      "const { spawn } = require('node:child_process'); const child = spawn(process.env.SystemRoot + '\\\\System32\\\\PING.EXE', ['-t', '127.0.0.1'], { detached: true, stdio: 'ignore', windowsHide: true }); child.unref(); process.stdout.write(String(child.pid) + '\\n'); setInterval(() => {}, 1000)",
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
    const attributedProcess = spawn(process.execPath, [
      '-e',
      'setInterval(() => {}, 1000)',
      installDirectory,
    ], {
      windowsHide: true,
      stdio: 'ignore',
    })
    const attributedExit = once(attributedProcess, 'exit')
    ownedProcesses.push({ child: attributedProcess, exit: attributedExit })
    await once(attributedProcess, 'spawn')
    const powershellExecutable = join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    )
    const encodedAttributed = spawn(powershellExecutable, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-EncodedCommand',
      Buffer.from(`Write-Host "${installDirectory}"; Start-Sleep -Seconds 300`, 'utf16le').toString('base64'),
    ], {
      windowsHide: true,
      stdio: 'ignore',
    })
    const encodedAttributedExit = once(encodedAttributed, 'exit')
    ownedProcesses.push({ child: encodedAttributed, exit: encodedAttributedExit })
    await once(encodedAttributed, 'spawn')
    encodedUnrelatedProcess = spawn(powershellExecutable, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-EncodedCommand',
      Buffer.from('Start-Sleep -Seconds 300', 'utf16le').toString('base64'),
    ], {
      windowsHide: true,
      stdio: 'ignore',
    })
    await once(encodedUnrelatedProcess, 'spawn')
    officialWebProcess = spawn(process.execPath, [
      '-e',
      'setInterval(() => {}, 1000)',
      join(temporary, 'official-web-home'),
    ], {
      windowsHide: true,
      stdio: 'ignore',
    })
    await once(officialWebProcess, 'spawn')
    await waitForWindowsProcessCommandLines([
      attributedProcess.pid,
      encodedAttributed.pid,
      encodedUnrelatedProcess.pid,
      officialWebProcess.pid,
    ])
    unrelatedProcess = spawn(unrelatedExecutable, ['-t', '127.0.0.1'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    unrelatedExit = once(unrelatedProcess, 'exit')
    await once(unrelatedProcess, 'spawn')
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
        selectedInstallDirectory,
        '-InstallRegistryKey',
        registryKey,
      ],
      { timeout: 15_000, windowsHide: true },
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
    assert.doesNotThrow(() => process.kill(pluginDescendantPid, 0), 'external plugin descendant was killed')
    assert.doesNotThrow(() => process.kill(encodedUnrelatedProcess.pid, 0), 'encoded PowerShell without an install-root reference was killed')
    assert.doesNotThrow(() => process.kill(officialWebProcess.pid, 0), 'official web runtime without an install-root reference was killed')
    await settleWithin(
      unrelatedExit,
      3_000,
      'legacy same-name app outside the registered install root survived cleanup',
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
    if (encodedUnrelatedProcess?.exitCode === null) encodedUnrelatedProcess.kill('SIGKILL')
    if (officialWebProcess?.exitCode === null) officialWebProcess.kill('SIGKILL')
    if (unrelatedProcess?.exitCode === null) unrelatedProcess.kill('SIGKILL')
    if (unrelatedExit) await settleWithin(unrelatedExit, 2_000, 'unrelated process teardown did not settle').catch(() => {})
    await execFileAsync('reg.exe', ['DELETE', `HKCU\\${registryKey}`, '/f'], {
      timeout: 5_000,
      windowsHide: true,
    }).catch(() => {})
    await rm(temporary, { recursive: true, force: true })
  }
})
