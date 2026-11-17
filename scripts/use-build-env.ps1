param(
  [ValidateSet('test', 'package')][string]$Mode = 'test',
  [string]$BuildRoot = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) '.desktop-build')
)

$taskBuildRoot = [System.IO.Path]::GetFullPath($BuildRoot)
$taskWorkspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskBuildVolume = [System.IO.Path]::GetPathRoot($taskBuildRoot)
$taskWorkspaceVolume = [System.IO.Path]::GetPathRoot($taskWorkspaceRoot)
$taskLocalNodeDirectory = Join-Path $taskBuildRoot 'tools\node-v24.19.0'
$taskLocalPnpmDirectory = Join-Path $taskBuildRoot 'tools\pnpm-11.22.0\node_modules\.bin'

if (-not (Test-Path -LiteralPath $taskBuildVolume)) {
  throw 'Configured build drive is unavailable. Choose a build root on the workspace volume.'
}
if (-not [string]::Equals($taskWorkspaceVolume, $taskBuildVolume, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Desktop $Mode requires the workspace and build root on one volume for dependency hardlinks and native packaging. Current worktree: $taskWorkspaceRoot"
}

if (Test-Path -LiteralPath (Join-Path $taskLocalNodeDirectory 'node.exe')) {
  $env:PATH = "$taskLocalNodeDirectory;$env:PATH"
}
if (Test-Path -LiteralPath (Join-Path $taskLocalPnpmDirectory 'pnpm.cmd')) {
  $env:PATH = "$taskLocalPnpmDirectory;$env:PATH"
}
$taskNodeVersion = [version](& node -p 'process.versions.node')
if (($taskNodeVersion.Major -eq 22 -and $taskNodeVersion -lt [version]'22.19.0') -or $taskNodeVersion.Major -lt 22 -or $taskNodeVersion.Major -eq 23) {
  throw "Unsupported Node.js $taskNodeVersion. Use Node 22.19+ or Node 24+ before running Desktop tests."
}

@(
  $taskBuildRoot,
  (Join-Path $taskBuildRoot 'pnpm-store'),
  (Join-Path $taskBuildRoot 'pnpm-cache'),
  (Join-Path $taskBuildRoot 'electron-builder-cache'),
  (Join-Path $taskBuildRoot 'electron-cache'),
  (Join-Path $taskBuildRoot 'npm-cache'),
  (Join-Path $taskBuildRoot 'node-gyp-cache'),
  (Join-Path $taskBuildRoot 'playwright-browsers'),
  (Join-Path $taskBuildRoot 'temp'),
  (Join-Path $taskBuildRoot 'artifacts'),
  (Join-Path $taskBuildRoot 'downloads'),
  (Join-Path $taskBuildRoot 'tools')
) | ForEach-Object { New-Item -ItemType Directory -Path $_ -Force | Out-Null }

$env:PNPM_CONFIG_STORE_DIR = Join-Path $taskBuildRoot 'pnpm-store'
$env:PNPM_CONFIG_CACHE_DIR = Join-Path $taskBuildRoot 'pnpm-cache'
$env:ELECTRON_BUILDER_CACHE = Join-Path $taskBuildRoot 'electron-builder-cache'
$env:ELECTRON_CACHE = Join-Path $taskBuildRoot 'electron-cache'
$env:electron_config_cache = $env:ELECTRON_CACHE
$env:npm_config_cache = Join-Path $taskBuildRoot 'npm-cache'
$env:npm_config_devdir = Join-Path $taskBuildRoot 'node-gyp-cache'
$env:npm_package_config_node_gyp_devdir = $env:npm_config_devdir
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $taskBuildRoot 'playwright-browsers'
$env:TEMP = Join-Path $taskBuildRoot 'temp'
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP

Write-Host "Desktop $Mode environment uses $taskBuildRoot; workspace $taskWorkspaceRoot"
Write-Host 'Run pnpm commands in this same PowerShell session. Dot-source this script to retain these variables.'
