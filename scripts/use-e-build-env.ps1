param(
  [ValidateSet('test', 'package')][string]$Mode = 'test'
)

$taskBuildRoot = 'E:\DeepSeekHarnessDesktop-Build'
$taskWorkspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskBuildVolume = [System.IO.Path]::GetPathRoot($taskBuildRoot)
$taskWorkspaceVolume = [System.IO.Path]::GetPathRoot($taskWorkspaceRoot)
$taskLocalNodeDirectory = Join-Path $taskBuildRoot 'tools\node-v24.19.0'

if (-not (Test-Path -LiteralPath $taskBuildVolume)) {
  throw 'E: drive is unavailable; do not fall back to the system drive for Desktop build dependencies.'
}
if (-not [string]::Equals($taskWorkspaceVolume, $taskBuildVolume, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Desktop $Mode requires an E: worktree so node_modules, tests, build cache and artifacts remain on one volume. Current worktree: $taskWorkspaceRoot"
}

if (Test-Path -LiteralPath (Join-Path $taskLocalNodeDirectory 'node.exe')) {
  $env:PATH = "$taskLocalNodeDirectory;$env:PATH"
}
$taskNodeVersion = [version](& node -p 'process.versions.node')
if (($taskNodeVersion.Major -eq 22 -and $taskNodeVersion -lt [version]'22.19.0') -or $taskNodeVersion.Major -lt 22 -or $taskNodeVersion.Major -eq 23) {
  throw "Unsupported Node.js $taskNodeVersion. Use Node 22.19+ or Node 24+ before running Desktop tests."
}

@(
  $taskBuildRoot,
  (Join-Path $taskBuildRoot 'pnpm-store'),
  (Join-Path $taskBuildRoot 'electron-builder-cache'),
  (Join-Path $taskBuildRoot 'electron-cache'),
  (Join-Path $taskBuildRoot 'npm-cache'),
  (Join-Path $taskBuildRoot 'node-gyp-cache'),
  (Join-Path $taskBuildRoot 'playwright-browsers'),
  (Join-Path $taskBuildRoot 'temp'),
  (Join-Path $taskBuildRoot 'artifacts'),
  (Join-Path $taskBuildRoot 'downloads'),
  (Join-Path $taskBuildRoot 'worktrees'),
  (Join-Path $taskBuildRoot 'tools'),
  (Join-Path $taskBuildRoot 'wsl')
) | ForEach-Object { New-Item -ItemType Directory -Path $_ -Force | Out-Null }

$env:PNPM_CONFIG_STORE_DIR = Join-Path $taskBuildRoot 'pnpm-store'
$env:ELECTRON_BUILDER_CACHE = Join-Path $taskBuildRoot 'electron-builder-cache'
$env:ELECTRON_CACHE = Join-Path $taskBuildRoot 'electron-cache'
$env:npm_config_cache = Join-Path $taskBuildRoot 'npm-cache'
$env:npm_config_devdir = Join-Path $taskBuildRoot 'node-gyp-cache'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $taskBuildRoot 'playwright-browsers'
$env:TEMP = Join-Path $taskBuildRoot 'temp'
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP

Write-Host "Desktop $Mode environment uses $taskBuildRoot; workspace $taskWorkspaceRoot"
Write-Host 'Run pnpm commands in this same PowerShell session. Dot-source this script to retain these variables.'
