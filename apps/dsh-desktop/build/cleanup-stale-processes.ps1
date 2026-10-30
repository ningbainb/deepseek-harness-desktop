param(
  [Parameter(Mandatory = $true)]
  [string] $InstallDirectory,

  [string] $InstallRegistryKey = '',

  [string] $UninstallRegistryKey = '',

  [Alias('PrepareLegacyUpgrade')]
  [switch] $PrepareExistingUpgrade,

  [string] $UpgradeTransactionScript = ''
)

$ErrorActionPreference = 'Stop'
$mainExecutableName = 'DeepSeek Harness Desktop.exe'
$shutdownProtocolMarker = 'resources\update-shutdown-v1'
$shutdownReceiptMarker = 'resources\update-shutdown-v2'
$shutdownReceiptMarkerValue = 'dsh-desktop-update-shutdown-receipt=2'
$gracefulShutdownTimeoutMs = 7000
$receiptShutdownTimeoutMs = 15000
$receiptProcessExitTimeoutMs = 5000
$replacementFileReleaseTimeoutMs = 5000
$forceAttempts = 12
$retryDelayMs = 400
$script:receiptProtocolFailed = $false
$script:permissionDenied = $false

if ([string]::IsNullOrWhiteSpace($UpgradeTransactionScript)) {
  $UpgradeTransactionScript = Join-Path $PSScriptRoot 'installer-upgrade-transaction.ps1'
}

try {
  function Get-CanonicalPath([string] $path) {
    if ([string]::IsNullOrWhiteSpace($path)) {
      return $path
    }
    try {
      $fullPath = [System.IO.Path]::GetFullPath($path)
    } catch {
      return $path
    }
    try {
      # Get-Item resolves the existing filesystem entry without a temporary
      # compiler. This keeps Unicode TEMP/user paths safe on Windows PowerShell
      # 5.1 and also normalizes aliases exposed by registry install locations.
      return (Get-Item -LiteralPath $fullPath -Force -ErrorAction Stop).FullName
    } catch {
      return $fullPath
    }
  }

  $comparison = [System.StringComparison]::OrdinalIgnoreCase
  $installRoots = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  $installRootReferences = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  function Add-InstallRoot([string] $path) {
    if ([string]::IsNullOrWhiteSpace($path)) {
      return
    }
    try {
      $fullPath = if ([System.IO.Path]::IsPathRooted($path)) {
        $path.TrimEnd([char[]]@('\', '/'))
      } else {
        [System.IO.Path]::GetFullPath($path).TrimEnd([char[]]@('\', '/'))
      }
      $canonicalPath = (Get-CanonicalPath $fullPath).TrimEnd([char[]]@('\', '/'))
      $volumeRoot = [System.IO.Path]::GetPathRoot($canonicalPath).TrimEnd([char[]]@('\', '/'))
      if (-not [string]::IsNullOrWhiteSpace($canonicalPath) -and $canonicalPath -ne $volumeRoot) {
        [void] $installRoots.Add($canonicalPath)
        [void] $installRootReferences.Add($fullPath)
      }
    } catch {
      # A stale registry value must not turn into a false process warning.
    }
  }

  function Get-UninstallerDirectory([string] $uninstallString) {
    if ([string]::IsNullOrWhiteSpace($uninstallString)) {
      return $null
    }
    $match = [System.Text.RegularExpressions.Regex]::Match($uninstallString, '^\s*"([^"]+)"')
    $uninstallerPath = if ($match.Success) {
      $match.Groups[1].Value
    } else {
      ($uninstallString -split '\s+', 2)[0]
    }
    try {
      [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($uninstallerPath))
    } catch {
      $null
    }
  }

  Add-InstallRoot $InstallDirectory
  foreach ($hive in @('HKEY_CURRENT_USER', 'HKEY_LOCAL_MACHINE')) {
    if (-not [string]::IsNullOrWhiteSpace($InstallRegistryKey)) {
      $installRegistryPath = "Registry::$hive\$InstallRegistryKey"
      $installState = Get-ItemProperty -LiteralPath $installRegistryPath -ErrorAction SilentlyContinue
      Add-InstallRoot $installState.InstallLocation
    }
    if (-not [string]::IsNullOrWhiteSpace($UninstallRegistryKey)) {
      $uninstallRegistryPath = "Registry::$hive\$UninstallRegistryKey"
      $uninstallState = Get-ItemProperty -LiteralPath $uninstallRegistryPath -ErrorAction SilentlyContinue
      Add-InstallRoot (Get-UninstallerDirectory $uninstallState.UninstallString)
    }
  }

  $existingRoots = @($installRoots | Where-Object {
    Test-Path -LiteralPath $_ -PathType Container
  })

  $rootVariants = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  foreach ($reference in $installRootReferences) {
    if (Test-Path -LiteralPath $reference -PathType Container) {
      [void] $rootVariants.Add($reference)
    }
  }
  foreach ($root in $existingRoots) {
    $installItem = Get-Item -LiteralPath $root -ErrorAction SilentlyContinue
    foreach ($variant in @(
      $root,
      $installItem.FullName,
      (Get-CanonicalPath $root),
      (Get-CanonicalPath $installItem.FullName)
    )) {
      if (-not [string]::IsNullOrWhiteSpace($variant)) {
        [void] $rootVariants.Add($variant.TrimEnd([char[]]@('\', '/')))
      }
    }
  }

  function Get-Ownership([string] $path) {
    if ([string]::IsNullOrWhiteSpace($path)) {
      return $null
    }
    $pathVariants = @($path, (Get-CanonicalPath $path))
    foreach ($pathVariant in $pathVariants) {
      if ([string]::IsNullOrWhiteSpace($pathVariant)) {
        continue
      }
      foreach ($root in $rootVariants) {
        $mainExecutable = Join-Path $root $mainExecutableName
        if ($pathVariant.Equals($mainExecutable, $comparison)) {
          return [pscustomobject]@{ Kind = 'main'; Root = $root }
        }
        $resourcePrefix = "$(Join-Path $root 'resources')\"
        if ($pathVariant.StartsWith($resourcePrefix, $comparison)) {
          return [pscustomobject]@{ Kind = 'resource'; Root = $root }
        }
      }
    }
    $null
  }

  function Get-DirectInstallProcesses {
    @(foreach ($process in (Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
      $processId = [uint32] $process.ProcessId
      if ($excludedProcessIds.Contains($processId)) {
        continue
      }
      $path = [string] $process.ExecutablePath
      $ownership = Get-Ownership $path
      if (-not $ownership) {
        continue
      }
      [pscustomobject]@{
        ProcessId = $processId
        ExecutablePath = $path
        Kind = $ownership.Kind
        Root = $ownership.Root
      }
    })
  }

  # External hosts are owned only when their actual entry point is an installed
  # SDK runner. A path occurring in an argument or encoded message proves nothing.
  function Get-AncestorProcessIds([uint32] $processId) {
    $ancestors = [System.Collections.Generic.HashSet[uint32]]::new()
    $parents = @{}
    foreach ($process in (Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
      $parents[[uint32] $process.ProcessId] = [uint32] $process.ParentProcessId
    }
    $current = $processId
    for ($depth = 0; $depth -lt 16; $depth += 1) {
      if (-not $parents.ContainsKey($current)) {
        break
      }
      $parent = [uint32] $parents[$current]
      if ($parent -eq 0 -or $parent -eq $current -or -not $ancestors.Add($parent)) {
        break
      }
      $current = $parent
    }
    return $ancestors
  }

  $selfPid = [uint32] $PID
  $excludedProcessIds = [System.Collections.Generic.HashSet[uint32]]::new()
  [void] $excludedProcessIds.Add($selfPid)
  foreach ($ancestorId in (Get-AncestorProcessIds $selfPid)) {
    [void] $excludedProcessIds.Add($ancestorId)
  }

  function Split-WindowsArguments([string] $commandLine) {
    $result = [Collections.Generic.List[string]]::new()
    $word = [Text.StringBuilder]::new()
    $quoted = $false
    $started = $false
    for ($index = 0; $index -lt $commandLine.Length; $index++) {
      $character = $commandLine[$index]
      if (-not $quoted -and [char]::IsWhiteSpace($character)) {
        if ($started) { $result.Add($word.ToString()); [void] $word.Clear(); $started = $false }
        continue
      }
      $started = $true
      if ($character -eq '\') {
        $slashes = 0
        while ($index -lt $commandLine.Length -and $commandLine[$index] -eq '\') { $slashes++; $index++ }
        if ($index -lt $commandLine.Length -and $commandLine[$index] -eq '"') {
          [void] $word.Append(('\' * [int] [math]::Floor($slashes / 2)))
          if ($slashes % 2) { [void] $word.Append('"') } else { $quoted = -not $quoted }
        } else { [void] $word.Append(('\' * $slashes)); $index-- }
      } elseif ($character -eq '"') {
        if ($quoted -and $index + 1 -lt $commandLine.Length -and $commandLine[$index + 1] -eq '"') {
          [void] $word.Append('"'); $index++
        } else { $quoted = -not $quoted }
      } else { [void] $word.Append($character) }
    }
    if ($quoted) { return , @() }
    if ($started) { $result.Add($word.ToString()) }
    return , $result.ToArray()
  }

  function Test-RunnerArguments([string[]] $arguments) {
    $index = 0
    while ($index -lt $arguments.Count -and $arguments[$index] -eq '--expose-internals') { $index++ }
    $preload = $null
    if ($index -lt $arguments.Count -and $arguments[$index] -in @('--require', '-r')) {
      $index++
      if ($index -ge $arguments.Count) { return $null }
      $preload = $arguments[$index++]
    }
    if ($index -ge $arguments.Count -or -not [IO.Path]::IsPathRooted($arguments[$index])) { return $null }
    $entry = Get-CanonicalPath $arguments[$index++]
    $matchedRoot = $null
    foreach ($root in $rootVariants) {
      foreach ($relative in @(
        'resources\app.asar.unpacked\node_modules\@deepseek-ai\dsh\lib\bin.js',
        'resources\app.asar.unpacked\src\runtime-launcher.mjs',
        'resources\app.asar.unpacked\dsh\bin.js', 'resources\dsh\bin.js'
      )) {
        if ($entry.Equals((Join-Path $root $relative), $comparison) -and (Test-Path -LiteralPath $entry -PathType Leaf)) { $matchedRoot = $root }
      }
    }
    if ($null -eq $matchedRoot) { return $null }
    if ($null -ne $preload -and -not (Get-CanonicalPath $preload).Equals(
      (Join-Path $matchedRoot 'resources\app.asar.unpacked\src\windows-console-preload.cjs'), $comparison)) { return $null }
    $profileSeen = $false
    while ($index -lt $arguments.Count) {
      $option = $arguments[$index++]
      if ($option -eq '--no-open') { continue }
      if ($index -ge $arguments.Count) { return $null }
      $value = $arguments[$index++]
      switch ($option) {
        '--profile' {
          if ($profileSeen -or $value -cnotmatch '^[a-z0-9][a-z0-9._-]{0,63}$') { return $null }
          $profileSeen = $true
        }
        '--port' { if ($value -notmatch '^\d{1,5}$' -or [int] $value -gt 65535) { return $null } }
        '--host' { if ($value -notin @('127.0.0.1', 'localhost', '0.0.0.0')) { return $null } }
        '--patch' { if (-not [IO.Path]::IsPathRooted($value)) { return $null } }
        '--dsh-cli' {
          if (-not (Get-CanonicalPath $value).Equals((Join-Path $matchedRoot 'resources\app.asar.unpacked\node_modules\@deepseek-ai\dsh\lib\bin.js'), $comparison)) { return $null }
        }
        default { return $null }
      }
    }
    if ($profileSeen) { return $matchedRoot }
    return $null
  }

  function Get-CommandLineVariants([string] $commandLine) {
    $variants = [Collections.Generic.List[string]]::new()
    $arguments = Split-WindowsArguments $commandLine
    for ($index = 1; $index -lt $arguments.Count; $index++) {
      $option = $arguments[$index]
      # File/Command select the host's execution mode. Everything after that
      # boundary belongs to the script, even if it looks like a host option.
      if ($option -in @('-f', '-fi', '-fil', '-file', '-c', '-co', '-com', '-comm', '-comma', '-comman', '-command', '-commandwithargs')) {
        return , $variants
      }
      if ($option -in @('-e', '-ec', '-enc', '-encodedcommand')) {
        if ($index + 1 -ge $arguments.Count) { return , $variants }
        try {
          $bytes = [Convert]::FromBase64String($arguments[$index + 1])
          if ($bytes.Length -le 65536 -and $bytes.Length % 2 -eq 0) { $variants.Add([System.Text.Encoding]::Unicode.GetString($bytes)) }
        } catch { }
        return , $variants
      }
      if ($option -in @('-nologo', '-noprofile', '-noninteractive', '-noexit', '-mta', '-sta')) { continue }
      if ($option -in @('-windowstyle', '-w', '-executionpolicy', '-ep', '-ex', '-inputformat', '-outputformat', '-version', '-v', '-psconsolefile', '-configurationname', '-encodedarguments')) {
        $index++
        if ($index -ge $arguments.Count) { return , $variants }
        continue
      }
      # An implicit script path or an unrecognized option is not proof that
      # subsequent tokens are host flags. Fail closed without killing it.
      return , $variants
    }
    return , $variants
  }

  function Get-LiteralString($expression) {
    $strings = @($expression.FindAll({ param($node) $node -is [Management.Automation.Language.StringConstantExpressionAst] }, $false))
    if ($strings.Count -eq 1 -and $strings[0].Extent.Text -ceq $expression.Extent.Text.Trim()) { return $strings[0].Value }
    return $null
  }

  function Get-PowerShellRunner([string] $script) {
    $tokens = $null; $parseErrors = $null
    $ast = [Management.Automation.Language.Parser]::ParseInput($script, [ref] $tokens, [ref] $parseErrors)
    if ($parseErrors.Count -or $null -ne $ast.ParamBlock -or $null -ne $ast.BeginBlock -or $null -ne $ast.ProcessBlock) { return $null }
    $statements = @($ast.EndBlock.Statements)
    $invocation = $null
    # Released 2.2: a literal call-operator invocation piped to stdout forwarding.
    if ($statements.Count -eq 2 -and $statements[0] -is [Management.Automation.Language.PipelineAst] -and
        $statements[1].Extent.Text -match '^exit\s+\$LASTEXITCODE$') {
      $command = $statements[0].PipelineElements[0]
      if ($command -isnot [Management.Automation.Language.CommandAst] -or $command.InvocationOperator -ne 'Ampersand') { return $null }
      $values = [Collections.Generic.List[string]]::new()
      foreach ($element in $command.CommandElements) {
        if ($element -isnot [Management.Automation.Language.StringConstantExpressionAst]) { return $null }
        $values.Add($element.Value)
      }
      $invocation = $values.ToArray()
    # Current Desktop: literal ProcessStartInfo executable/argv, Start and WaitForExit.
    } elseif ($statements.Count -eq 13 -and
        $statements[0].Extent.Text -match '^\$ErrorActionPreference\s*=\s*''Stop''$' -and
        $statements[1].Extent.Text -match '^\$startInfo\s*=\s*New-Object System.Diagnostics.ProcessStartInfo$' -and
        $statements[2] -is [Management.Automation.Language.AssignmentStatementAst] -and
        $statements[2].Left.Extent.Text -ceq '$startInfo.FileName' -and
        $statements[3] -is [Management.Automation.Language.AssignmentStatementAst] -and
        $statements[3].Left.Extent.Text -ceq '$startInfo.Arguments' -and
        $statements[4].Extent.Text -match '^\$startInfo.UseShellExecute\s*=\s*\$false$' -and
        $statements[5].Extent.Text -match '^\$startInfo.CreateNoWindow\s*=\s*\$false$' -and
        $statements[6].Extent.Text -match '^\$startInfo.WindowStyle\s*=\s*\[System.Diagnostics.ProcessWindowStyle\]::Hidden$' -and
        $statements[7].Extent.Text -match '^\$runtime\s*=\s*New-Object System.Diagnostics.Process$' -and
        $statements[8].Extent.Text -match '^\$runtime.StartInfo\s*=\s*\$startInfo$' -and
        $statements[9].Extent.Text -match '^\[void\]\s*\$runtime.Start\(\)$' -and
        $statements[10].Extent.Text -match '^\[Console\]::Out.WriteLine\(''dsh desktop runtime pid [a-f0-9]{48}: '' \+ \$runtime.Id\)$' -and
        $statements[11].Extent.Text -ceq '$runtime.WaitForExit()' -and
        $statements[12].Extent.Text -ceq 'exit $runtime.ExitCode') {
      $executable = Get-LiteralString $statements[2].Right
      $arguments = Get-LiteralString $statements[3].Right
      if ($null -eq $executable -or $null -eq $arguments) { return $null }
      $invocation = @($executable) + (Split-WindowsArguments $arguments)
    }
    if ($null -eq $invocation -or $invocation.Count -lt 2) { return $null }
    $root = Test-RunnerArguments $invocation[1..($invocation.Count - 1)]
    if ($null -ne $root -and ([IO.Path]::GetFileName($invocation[0]) -in @('node.exe', 'electron.exe') -or
        $invocation[0].Equals((Join-Path $root $mainExecutableName), $comparison))) { return $root }
    return $null
  }

  function Get-ExternalRunnerRoot($process) {
    if ([string]::IsNullOrWhiteSpace($process.CommandLine)) { return $null }
    if ([IO.Path]::GetFileName([string] $process.ExecutablePath) -in @('node.exe', 'electron.exe')) {
      $arguments = Split-WindowsArguments $process.CommandLine
      if ($arguments.Count -gt 1) { return Test-RunnerArguments $arguments[1..($arguments.Count - 1)] }
    }
    foreach ($relative in @('System32\WindowsPowerShell\v1.0\powershell.exe', 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe')) {
      if ([string]::Equals([string] $process.ExecutablePath, (Join-Path $env:SystemRoot $relative), $comparison)) {
        foreach ($script in (Get-CommandLineVariants $process.CommandLine)) {
          $root = Get-PowerShellRunner $script
          if ($null -ne $root) { return $root }
        }
      }
    }
    return $null
  }

  function Get-AttributedInstallProcesses([System.Collections.Generic.HashSet[uint32]] $directProcessIds) {
    @(foreach ($cim in (Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
      $processId = [uint32] $cim.ProcessId
      if ($excludedProcessIds.Contains($processId) -or $directProcessIds.Contains($processId)) {
        continue
      }
      # Electron-builder uninstallers through 2.2 reject any running process with
      # the product executable name, even when a damaged or moved installation is
      # no longer discoverable through the registry. Mirror that exact product-name
      # boundary so the legacy uninstaller cannot fail after this preflight succeeds.
      # The name is unique to the Desktop host; official dsh web runtimes use node.
      if ($cim.Name -and $cim.Name.Equals($mainExecutableName, $comparison)) {
        [pscustomobject]@{
          ProcessId = $processId
          ExecutablePath = if ($cim.ExecutablePath) { $cim.ExecutablePath } else { $cim.Name }
          Kind = 'main'
          Root = ''
        }
        continue
      }
      # The second WMI pass includes command lines and catches product-name or
      # attributed descendants not already owned by an exact executable path.
      $ownership = Get-Ownership $cim.ExecutablePath
      if ($ownership) {
        [pscustomobject]@{
          ProcessId = $processId
          ExecutablePath = $cim.ExecutablePath
          Kind = $ownership.Kind
          Root = $ownership.Root
        }
        continue
      }
      $matchedRoot = Get-ExternalRunnerRoot $cim
      if ($null -ne $matchedRoot) {
          [pscustomobject]@{
            ProcessId = $processId
            ExecutablePath = if ($cim.ExecutablePath) { $cim.ExecutablePath } else { $cim.Name }
            Kind = 'attributed'
            Root = $matchedRoot
          }
      }
    })
  }

  function Get-InstallProcesses {
    $direct = @(Get-DirectInstallProcesses)
    $directProcessIds = [System.Collections.Generic.HashSet[uint32]]::new()
    foreach ($target in $direct) {
      [void] $directProcessIds.Add($target.ProcessId)
    }
    $direct + @(Get-AttributedInstallProcesses $directProcessIds)
  }

  function New-ShutdownToken {
    $bytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
      $generator.GetBytes($bytes)
    } finally {
      $generator.Dispose()
    }
    -join ($bytes | ForEach-Object { $_.ToString('x2') })
  }

  function Get-ShutdownReceiptPath([string] $token) {
    if ($token -notmatch '^[a-f0-9]{64}$') {
      throw 'invalid generated shutdown token'
    }
    Join-Path ([System.IO.Path]::GetTempPath()) "dsh-desktop-shutdown-$token.json"
  }

  function Read-ValidatedShutdownReceipt(
    [string] $path,
    [string] $token,
    [uint32] $expectedPid
  ) {
    try {
      $receiptFile = Get-Item -LiteralPath $path -ErrorAction Stop
      if ($receiptFile.Length -gt 4096) { return $null }
      $receipt = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
      if (($receipt.schemaVersion -isnot [int]) -and ($receipt.schemaVersion -isnot [long])) { return $null }
      if ([int64] $receipt.schemaVersion -ne 2) { return $null }
      if (($receipt.token -isnot [string]) -or $receipt.token -cne $token) { return $null }
      if (($receipt.pid -isnot [int]) -and ($receipt.pid -isnot [long])) { return $null }
      if ([int64] $receipt.pid -ne [int64] $expectedPid) { return $null }
      if (($receipt.runtimeStopped -isnot [bool]) -or $receipt.runtimeStopped -ne $true) { return $null }
      if (($receipt.extensionsQuiesced -isnot [bool]) -or $receipt.extensionsQuiesced -ne $true) { return $null }
      if ($receipt.writtenAt -isnot [string]) { return $null }
      $parsedWrittenAt = [System.DateTimeOffset]::MinValue
      if (-not [System.DateTimeOffset]::TryParse(
        $receipt.writtenAt,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [System.Globalization.DateTimeStyles]::RoundtripKind,
        [ref] $parsedWrittenAt
      )) { return $null }
      return $receipt
    } catch {
      return $null
    }
  }

  function Wait-ForProcessExit([uint32] $processId, [int] $timeoutMs) {
    $wait = [System.Diagnostics.Stopwatch]::StartNew()
    do {
      if ($null -eq (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
        return $true
      }
      Start-Sleep -Milliseconds 100
    } while ($wait.ElapsedMilliseconds -lt $timeoutMs)
    return $false
  }

  function Test-ShutdownReceiptMarker([string] $path) {
    try {
      (Get-Content -LiteralPath $path -Raw -Encoding UTF8).Trim() -ceq $shutdownReceiptMarkerValue
    } catch {
      $false
    }
  }

  function Get-ReplacementFileBlockers {
    $paths = [System.Collections.Generic.HashSet[string]]::new(
      [System.StringComparer]::OrdinalIgnoreCase
    )
    foreach ($root in $existingRoots) {
      [void] $paths.Add((Join-Path $root $mainExecutableName))
      [void] $paths.Add((Join-Path $root 'resources\app.asar'))
    }
    @(foreach ($path in $paths) {
      if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        continue
      }
      $stream = $null
      try {
        $stream = [System.IO.File]::Open(
          $path,
          [System.IO.FileMode]::Open,
          [System.IO.FileAccess]::ReadWrite,
          [System.IO.FileShare]::None
        )
      } catch [System.UnauthorizedAccessException] {
        [pscustomobject]@{ Kind = 'permission'; Path = $path; Message = $_.Exception.Message }
      } catch [System.IO.IOException] {
        [pscustomobject]@{ Kind = 'locked'; Path = $path; Message = $_.Exception.Message }
      } finally {
        if ($null -ne $stream) {
          $stream.Dispose()
        }
      }
    })
  }

  function Stage-UpgradeInstalls {
    if (-not (Test-Path -LiteralPath $UpgradeTransactionScript -PathType Leaf)) {
      throw "upgrade transaction script is missing: $UpgradeTransactionScript"
    }
    & $UpgradeTransactionScript `
      -Mode Begin `
      -InstallDirectory $InstallDirectory `
      -InstallRegistryKey $InstallRegistryKey `
      -UninstallRegistryKey $UninstallRegistryKey
  }

  function Complete-Preflight {
    $blockers = @()
    $replacementWait = [System.Diagnostics.Stopwatch]::StartNew()
    while ($true) {
      $blockers = @(Get-ReplacementFileBlockers)
      if ($blockers.Count -eq 0) {
        if ($PrepareExistingUpgrade) {
          Stage-UpgradeInstalls
        }
        exit 0
      }
      if ($blockers | Where-Object { $_.Kind -eq 'permission' } | Select-Object -First 1) {
        break
      }
      $remainingWaitMs = $replacementFileReleaseTimeoutMs - $replacementWait.ElapsedMilliseconds
      if ($remainingWaitMs -le 0) { break }
      # PID exit and release of executable mappings need not happen together.
      # Poll only while blocked; never replace an image until the exclusive probe succeeds.
      Start-Sleep -Milliseconds ([Math]::Min(200, $remainingWaitMs))
    }
    foreach ($blocker in $blockers) {
      Write-Output "$($blocker.Kind) path=$($blocker.Path): $($blocker.Message)"
    }
    if ($blockers | Where-Object { $_.Kind -eq 'permission' } | Select-Object -First 1) {
      exit 34
    }
    exit 36
  }

  function Test-IsDesktopBrowserProcess($target) {
    try {
      $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $($target.ProcessId)" -ErrorAction Stop
      $commandLine = [string] $cim.CommandLine
      if ([string]::IsNullOrWhiteSpace($commandLine)) {
        return $true
      }
      # Electron renderers/GPU helpers and the embedded DSH Node runtime use
      # the same product executable. Only the browser process can own the
      # single-instance shutdown handshake and write a receipt for its PID.
      return $commandLine -notmatch '(?i)(?:^|\s)--type=' -and $commandLine -notmatch '(?i)(?:^|\s)--expose-internals(?:\s|$)'
    } catch {
      # Same-user installs expose the command line. If an elevated process
      # hides it, let the receipt attempt fail into the permission/fallback
      # diagnostics instead of silently skipping a potentially valid host.
      return $true
    }
  }

  # A fresh or already-removed installation has no executable mapping to stop.
  # Do not enumerate unrelated system processes in that case: some hardened CI
  # hosts expose pseudo executable paths that Win32 rejects during
  # canonicalization. The transaction helper still retires any stale registry
  # identity before the new files are written.
  if ($existingRoots.Count -eq 0) {
    Complete-Preflight
  }

  $targets = @(Get-InstallProcesses)
  if ($targets.Count -eq 0) {
    Complete-Preflight
  }

  # Receipt v2 is the deterministic path for 2.4+ applications. The installer
  # supplies only a high-entropy token; the old application derives the fixed
  # TEMP path itself, so no command line can redirect a privileged write.
  $receiptAttempted = $false
  foreach ($root in $existingRoots) {
    $mainExecutable = Join-Path $root $mainExecutableName
    $marker = Join-Path $root $shutdownReceiptMarker
    $runningMains = @($targets | Where-Object {
      $_.Kind -eq 'main' -and $_.ExecutablePath.Equals($mainExecutable, $comparison)
    } | Where-Object { Test-IsDesktopBrowserProcess $_ } | Sort-Object ProcessId | Select-Object -First 1)
    if ($runningMains.Count -eq 0 -or -not (Test-ShutdownReceiptMarker $marker)) {
      continue
    }
    foreach ($runningMain in $runningMains) {
      $receiptAttempted = $true
      $token = New-ShutdownToken
      $receiptPath = Get-ShutdownReceiptPath $token
      try {
        [void] (Start-Process -FilePath $mainExecutable -ArgumentList @(
          '--shutdown-for-update',
          "--shutdown-token=$token"
        ) -WindowStyle Hidden -PassThru)
      } catch {
        $script:receiptProtocolFailed = $true
        if ($_.Exception.Message -match '(?i)access.*denied|permission|\u62D2\u7EDD\u8BBF\u95EE') {
          $script:permissionDenied = $true
        }
        Write-Output "receipt-launch-error pid=$($runningMain.ProcessId): $($_.Exception.Message)"
        continue
      }

      $receiptWait = [System.Diagnostics.Stopwatch]::StartNew()
      $validated = $null
      do {
        if (Test-Path -LiteralPath $receiptPath -PathType Leaf) {
          $validated = Read-ValidatedShutdownReceipt $receiptPath $token $runningMain.ProcessId
          break
        }
        if (Wait-ForProcessExit $runningMain.ProcessId 0) {
          $currentTargets = @(Get-InstallProcesses)
          if ($currentTargets.Count -eq 0) {
            Write-Output "receipt-early-exit pid=$($runningMain.ProcessId)"
            Remove-Item -LiteralPath $receiptPath -Force -ErrorAction SilentlyContinue
            Complete-Preflight
          }
        }
        Start-Sleep -Milliseconds 100
      } while ($receiptWait.ElapsedMilliseconds -lt $receiptShutdownTimeoutMs)

      if ($null -eq $validated) {
        $script:receiptProtocolFailed = $true
        $kind = if (Test-Path -LiteralPath $receiptPath -PathType Leaf) { 'invalid' } else { 'timeout' }
        Write-Output "receipt-$kind pid=$($runningMain.ProcessId)"
      } elseif (Wait-ForProcessExit $runningMain.ProcessId $receiptProcessExitTimeoutMs) {
        Write-Output "receipt-ok pid=$($runningMain.ProcessId)"
      } else {
        $script:receiptProtocolFailed = $true
        Write-Output "receipt-pid-timeout pid=$($runningMain.ProcessId)"
      }
      Remove-Item -LiteralPath $receiptPath -Force -ErrorAction SilentlyContinue
    }
  }

  if ($receiptAttempted) {
    $targets = @(Get-InstallProcesses)
    if ($targets.Count -eq 0) {
      Complete-Preflight
    }
    Write-Output 'receipt-fallback: attributed legacy cleanup required'
  }

  $requestedGracefulShutdown = $false
  foreach ($root in $existingRoots) {
    $mainExecutable = Join-Path $root $mainExecutableName
    $marker = Join-Path $root $shutdownProtocolMarker
    $hasRunningMain = $targets | Where-Object {
      $_.Kind -eq 'main' -and $_.ExecutablePath.Equals($mainExecutable, $comparison)
    } | Select-Object -First 1
    if (-not $hasRunningMain -or -not (Test-Path -LiteralPath $marker -PathType Leaf)) {
      continue
    }
    try {
      [void] (Start-Process -FilePath $mainExecutable -ArgumentList '--shutdown-for-update' -WindowStyle Hidden -PassThru)
      $requestedGracefulShutdown = $true
    } catch {
      # The exact-path force fallback below remains available for legacy or damaged installs.
    }
  }

  if ($requestedGracefulShutdown) {
    $gracefulWait = [System.Diagnostics.Stopwatch]::StartNew()
    do {
      Start-Sleep -Milliseconds $retryDelayMs
      $targets = @(Get-InstallProcesses)
      if ($targets.Count -eq 0) {
        Complete-Preflight
      }
    } while ($gracefulWait.ElapsedMilliseconds -lt $gracefulShutdownTimeoutMs)
  }

  for ($attempt = 0; $attempt -lt $forceAttempts; $attempt += 1) {
    $targets = @(Get-InstallProcesses)
    if ($targets.Count -eq 0) {
      Complete-Preflight
    }

    # Stop the Desktop host first so it cannot recreate a runtime while cleanup is in progress.
    foreach ($target in ($targets | Sort-Object @{ Expression = { $_.Kind -eq 'main' }; Descending = $true })) {
      try {
        Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop
      } catch {
        if ($_.Exception.Message -match '(?i)access.*denied|permission|\u62D2\u7EDD\u8BBF\u95EE') {
          $script:permissionDenied = $true
        }
        Write-Output "stop-error pid=$($target.ProcessId): $($_.Exception.Message)"
      }
    }
    foreach ($target in $targets) {
      Wait-Process -Id $target.ProcessId -Timeout 1 -ErrorAction SilentlyContinue
    }
    if ($attempt + 1 -lt $forceAttempts) {
      Start-Sleep -Milliseconds $retryDelayMs
    }
  }

  $remaining = @(Get-InstallProcesses)
  foreach ($target in $remaining) {
    Write-Output "busy pid=$($target.ProcessId) path=$($target.ExecutablePath)"
  }
  if ($script:permissionDenied) {
    exit 34
  }
  if ($script:receiptProtocolFailed) {
    exit 35
  }
  exit 32
} catch {
  Write-Output "preflight-error: $($_.Exception.Message)"
  Write-Output "preflight-error-type: $($_.Exception.GetType().FullName)"
  Write-Output "preflight-error-id: $($_.FullyQualifiedErrorId)"
  Write-Output "preflight-error-stack: $($_.ScriptStackTrace -replace '[\r\n]+', ' | ')"
  exit 33
}
