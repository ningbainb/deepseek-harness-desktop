param(
  [Parameter(Mandatory = $true)]
  [string] $InstallDirectory,

  [string] $InstallRegistryKey = '',

  [string] $UninstallRegistryKey = '',

  [Alias('PrepareLegacyUpgrade')]
  [switch] $PrepareExistingUpgrade
)

$ErrorActionPreference = 'Stop'
$mainExecutableName = 'DeepSeek Harness Desktop.exe'
$shutdownProtocolMarker = 'resources\update-shutdown-v1'
$shutdownReceiptMarker = 'resources\update-shutdown-v2'
$shutdownReceiptMarkerValue = 'dsh-desktop-update-shutdown-receipt=2'
$gracefulShutdownTimeoutMs = 7000
$receiptShutdownTimeoutMs = 15000
$receiptProcessExitTimeoutMs = 5000
$forceAttempts = 12
$retryDelayMs = 400
$script:receiptProtocolFailed = $false
$script:permissionDenied = $false

try {
  if (-not ('DshInstaller.ProcessPath' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

namespace DshInstaller
{
    public static class ProcessPath
    {
        private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(
            uint processAccess,
            bool inheritHandle,
            uint processId);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool QueryFullProcessImageName(
            IntPtr process,
            uint flags,
            StringBuilder executablePath,
            ref uint size);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CloseHandle(IntPtr handle);

        [DllImport("kernel32.dll", EntryPoint = "GetLongPathNameW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern uint GetLongPathName(
            string shortPath,
            StringBuilder longPath,
            uint bufferLength);

        public static string Canonicalize(string path)
        {
            if (String.IsNullOrWhiteSpace(path))
            {
                return path;
            }

            string fullPath;
            try
            {
                fullPath = System.IO.Path.GetFullPath(path);
            }
            catch
            {
                return path;
            }

            StringBuilder longPath = new StringBuilder(32768);
            uint size = GetLongPathName(fullPath, longPath, (uint) longPath.Capacity);
            if (size == 0 || size >= longPath.Capacity)
            {
                return fullPath;
            }
            return longPath.ToString();
        }

        public static string TryGet(uint processId)
        {
            IntPtr process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, processId);
            if (process == IntPtr.Zero)
            {
                return null;
            }

            try
            {
                StringBuilder executablePath = new StringBuilder(32768);
                uint size = (uint) executablePath.Capacity;
                if (!QueryFullProcessImageName(process, 0, executablePath, ref size))
                {
                    return null;
                }
                return executablePath.ToString();
            }
            finally
            {
                CloseHandle(process);
            }
        }
    }
}
'@
  }

  $comparison = [System.StringComparison]::OrdinalIgnoreCase
  $installRoots = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  $installRootReferences = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  $registryPaths = [System.Collections.Generic.HashSet[string]]::new(
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
      $canonicalPath = [DshInstaller.ProcessPath]::Canonicalize($fullPath).TrimEnd([char[]]@('\', '/'))
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
      if ($null -ne $installState) {
        [void] $registryPaths.Add($installRegistryPath)
      }
      Add-InstallRoot $installState.InstallLocation
    }
    if (-not [string]::IsNullOrWhiteSpace($UninstallRegistryKey)) {
      $uninstallRegistryPath = "Registry::$hive\$UninstallRegistryKey"
      $uninstallState = Get-ItemProperty -LiteralPath $uninstallRegistryPath -ErrorAction SilentlyContinue
      if ($null -ne $uninstallState) {
        [void] $registryPaths.Add($uninstallRegistryPath)
      }
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
      [DshInstaller.ProcessPath]::Canonicalize($root),
      [DshInstaller.ProcessPath]::Canonicalize($installItem.FullName)
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
    $pathVariants = @($path, [DshInstaller.ProcessPath]::Canonicalize($path))
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
    @(foreach ($process in Get-Process -ErrorAction SilentlyContinue) {
      $processId = [uint32] $process.Id
      if ($excludedProcessIds.Contains($processId)) {
        continue
      }
      $path = [DshInstaller.ProcessPath]::TryGet($processId)
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

  # Old runtimes may host descendants (hidden PowerShell/CMD/Node) outside the install
  # directory. They still block file replacement through working-directory handles or
  # loaded modules, so attribute them by an install-root reference on the command line.
  # 2.2 hosts its runtime through powershell -EncodedCommand, where the install path
  # only exists inside the Base64 payload, so decode those payloads before matching.
  # Path-only attribution keeps unrelated same-host processes (an official web runtime
  # using ~/.dsh, same-name apps elsewhere, this script) untouched.
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

  function Get-CommandLineVariants([string] $commandLine) {
    $variants = [System.Collections.Generic.List[string]]::new()
    if ([string]::IsNullOrWhiteSpace($commandLine)) {
      return , $variants
    }
    $variants.Add($commandLine)
    foreach ($match in [System.Text.RegularExpressions.Regex]::Matches(
      $commandLine,
      '(?i)-e(?:c|nc(?:odedcommand)?)?\s+"?([A-Za-z0-9+/=]{16,})"?'
    )) {
      try {
        $decoded = [System.Text.Encoding]::Unicode.GetString(
          [System.Convert]::FromBase64String($match.Groups[1].Value)
        )
        if (-not [string]::IsNullOrWhiteSpace($decoded)) {
          $variants.Add($decoded)
        }
      } catch {
        # Not a Base64 encoded command; the plaintext variant already covers it.
      }
    }
    return , $variants
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
      # TryGet can fail on elevated processes; the WMI executable path is a fallback
      # so such processes are still reported instead of failing the file copy later.
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
      foreach ($variant in (Get-CommandLineVariants $cim.CommandLine)) {
        $matchedRoot = $null
        foreach ($root in $rootVariants) {
          if ($variant.IndexOf($root, $comparison) -ge 0) {
            $matchedRoot = $root
            break
          }
        }
        if ($null -ne $matchedRoot) {
          [pscustomobject]@{
            ProcessId = $processId
            ExecutablePath = if ($cim.ExecutablePath) { $cim.ExecutablePath } else { $cim.Name }
            Kind = 'attributed'
            Root = $matchedRoot
          }
          break
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

  function Test-UpgradeInstallRoot([string] $root) {
    (Test-Path -LiteralPath (Join-Path $root $mainExecutableName) -PathType Leaf) -and
      (Test-Path -LiteralPath (Join-Path $root 'resources\app.asar') -PathType Leaf)
  }

  function Move-UpgradeInstallRoot([string] $root, [string] $quarantine) {
    $moveError = $null
    for ($attempt = 0; $attempt -lt 5; $attempt += 1) {
      try {
        [System.IO.Directory]::Move($root, $quarantine)
        return
      } catch [System.UnauthorizedAccessException] {
        $moveError = $_.Exception
      } catch [System.IO.IOException] {
        $moveError = $_.Exception
      }
      if ($attempt -lt 4) {
        Start-Sleep -Milliseconds 250
      }
    }
    throw $moveError
  }

  function Stage-UpgradeInstalls {
    $upgradeRoots = @($existingRoots | Where-Object { Test-UpgradeInstallRoot $_ })
    if ($upgradeRoots.Count -eq 0 -and $registryPaths.Count -eq 0) {
      return
    }

    $staged = [System.Collections.Generic.List[object]]::new()
    try {
      foreach ($root in $upgradeRoots) {
        $parent = [System.IO.Path]::GetDirectoryName($root)
        if ([string]::IsNullOrWhiteSpace($parent)) {
          throw "unsafe upgrade install root: $root"
        }
        $quarantine = Join-Path $parent ".dsh-desktop-update-old-$([System.Guid]::NewGuid().ToString('N'))"
        Move-UpgradeInstallRoot $root $quarantine
        $staged.Add([pscustomobject]@{ Root = $root; Quarantine = $quarantine })
      }

      foreach ($registryPath in $registryPaths) {
        if (Test-Path -LiteralPath $registryPath) {
          Remove-Item -LiteralPath $registryPath -Recurse -Force -ErrorAction Stop
        }
      }
    } catch {
      for ($index = $staged.Count - 1; $index -ge 0; $index -= 1) {
        $entry = $staged[$index]
        if ((Test-Path -LiteralPath $entry.Quarantine) -and -not (Test-Path -LiteralPath $entry.Root)) {
          try {
            [System.IO.Directory]::Move($entry.Quarantine, $entry.Root)
          } catch {
            Write-Output "upgrade-install-restore-error root=$($entry.Root): $($_.Exception.Message)"
          }
        }
      }
      Write-Output "upgrade-install-error: $($_.Exception.Message)"
      exit 34
    }

    foreach ($entry in $staged) {
      $removeError = $null
      for ($attempt = 0; $attempt -lt 3; $attempt += 1) {
        try {
          Remove-Item -LiteralPath $entry.Quarantine -Recurse -Force -ErrorAction Stop
          break
        } catch {
          $removeError = $_.Exception.Message
          if ($attempt -lt 2) {
            Start-Sleep -Milliseconds 250
          }
        }
      }
      if (Test-Path -LiteralPath $entry.Quarantine) {
        try {
          Add-Type -AssemblyName Microsoft.VisualBasic
          [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
            $entry.Quarantine,
            [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
            [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
          )
          Write-Output "upgrade-install-quarantine-recycled path=$($entry.Quarantine)"
        } catch {
          Write-Output "upgrade-install-quarantine-retained path=$($entry.Quarantine): $removeError; $($_.Exception.Message)"
        }
      }
      Write-Output "upgrade-install-staged root=$($entry.Root)"
    }
  }

  function Complete-Preflight {
    $blockers = @()
    for ($attempt = 0; $attempt -lt 10; $attempt += 1) {
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
      if ($attempt + 1 -lt 10) {
        Start-Sleep -Milliseconds 200
      }
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
  exit 33
}
