param(
  [Parameter(Mandatory = $true)]
  [string] $InstallDirectory
)

$ErrorActionPreference = 'Stop'

try {
  $installRoot = [System.IO.Path]::GetFullPath($InstallDirectory).TrimEnd([char[]]@('\', '/'))
  $volumeRoot = [System.IO.Path]::GetPathRoot($installRoot).TrimEnd([char[]]@('\', '/'))
  if ([string]::IsNullOrWhiteSpace($installRoot) -or $installRoot -eq $volumeRoot) {
    exit 0
  }

  $mainExecutable = Join-Path $installRoot 'DeepSeek Harness Desktop.exe'
  $resourceRoot = Join-Path $installRoot 'resources'
  if (-not (Test-Path -LiteralPath $mainExecutable -PathType Leaf)) {
    exit 0
  }

  $resourcePrefix = "$resourceRoot\"
  $comparison = [System.StringComparison]::OrdinalIgnoreCase
  $targets = Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | Where-Object {
    $path = $_.ExecutablePath
    $path -and (
      $path.Equals($mainExecutable, $comparison) -or
      $path.StartsWith($resourcePrefix, $comparison)
    )
  }

  foreach ($target in $targets) {
    Stop-Process -Id $target.ProcessId -Force -ErrorAction SilentlyContinue
  }
} catch {
  exit 0
}
