param(
  [Parameter(Mandatory = $true)][string] $InstallDirectory,
  [Parameter(Mandatory = $true)][string] $OutputPath,
  [string] $UserData = '',
  [string] $DefaultHome = '',
  [string] $LegacyHome = ''
)
# Display only. Never create, adopt, repair, relocate or remove a Home/profile.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
function Read-Json([string] $path) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
}
function Assert-DirectoryIdentity([string] $path) {
  if (-not [IO.Path]::IsPathRooted($path)) { throw 'relative Home requires its launch context' }
  # Preserve existing identity, including a legitimate junction. Do not realpath.
  if ((Test-Path -LiteralPath $path) -and -not (Get-Item -LiteralPath $path -Force).PSIsContainer) { throw 'Home is not an accessible directory' }
}
function Assert-CommunityOwnership([string] $desktopHome) {
  $marker = Read-Json (Join-Path $desktopHome 'community-home.json')
  if ($marker.owner -ceq 'deepseek-harness-community') { return }
  if ($marker.owner -ceq 'deepseek-harness-official') { throw 'official Home requires confirmation' }
  $manifest = Read-Json (Join-Path $desktopHome 'profiles\desktop\package.json')
  $dependencies = @($manifest.dependencies.PSObject.Properties.Name | Where-Object { $_ -match '^@(linxin666|ningbainb)/' })
  $community = $dependencies.Count -ge 2
  if (-not $community -and @($dependencies | Where-Object { $_ -match 'dsh-web-ui-all' }).Count) {
    $patch = Join-Path $desktopHome 'profiles\desktop\cordis.patch.yml'
    if (Test-Path -LiteralPath $patch) { $community = (Get-Content -LiteralPath $patch -Raw -Encoding UTF8) -match '@(linxin666|ningbainb)/' }
  }
  $official = Test-Path -LiteralPath (Join-Path $desktopHome '.official-install')
  if ($community -and -not $official) { return }
  if ($official -or (Test-Path -LiteralPath (Join-Path $desktopHome 'profiles\web'))) { throw 'foreign or mixed Home requires confirmation' }
  # Existing unknown default/saved paths remain launch-compatible, as in the
  # Desktop resolver. No new selection or ownership claim is made here.
}
$facts = [ordered]@{ schemaVersion = 1; program = $InstallDirectory; source = 'confirmation-required'; home = $null; caches = @(); warning = $null }
try {
  if (-not $UserData) { $UserData = if ($env:DSH_DESKTOP_USER_DATA) { $env:DSH_DESKTOP_USER_DATA } else { Join-Path $env:APPDATA 'DeepSeek Harness Desktop' } }
  Assert-DirectoryIdentity $UserData
  $facts.caches += Join-Path $UserData 'Cache'
  if (-not $DefaultHome) { $DefaultHome = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dsh-community' }
  if (-not $LegacyHome) { $LegacyHome = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dsh' }
  if ($env:DSH_HOME) {
    Assert-DirectoryIdentity $env:DSH_HOME
    $facts.home = $env:DSH_HOME; $facts.source = 'environment'
  } else {
    $selection = Join-Path $UserData 'desktop-data-location.json'
    if (Test-Path -LiteralPath $selection) {
      $item = Get-Item -LiteralPath $selection -Force
      if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'invalid location metadata type' }
      $saved = Read-Json $selection
      if ($saved.schemaVersion -ne 1 -or $saved.owner -cne 'deepseek-harness-community-desktop' -or $saved.home -isnot [string]) { throw 'invalid location metadata' }
      Assert-DirectoryIdentity $saved.home
      Assert-CommunityOwnership $saved.home
      $facts.home = $saved.home; $facts.source = 'persisted'
    } elseif (Test-Path -LiteralPath $DefaultHome) {
      Assert-DirectoryIdentity $DefaultHome
      Assert-CommunityOwnership $DefaultHome
      $facts.home = $DefaultHome; $facts.source = 'existing-default'
    } elseif (Test-Path -LiteralPath $LegacyHome) {
      $facts.source = 'legacy-confirmation'
    } else { $facts.source = 'first-launch-choice' }
  }
} catch { $facts.home = $null; $facts.source = 'confirmation-required'; $facts.warning = $_.Exception.Message }
if ($facts.home) { $facts.caches += Join-Path $facts.home 'cache' }
if ($env:DSH_DESKTOP_BROWSER_COMPONENT_CACHE) { $facts.caches += $env:DSH_DESKTOP_BROWSER_COMPONENT_CACHE }
$lines = @('程序目录：', $InstallDirectory, '')
if ($facts.home) {
  $qualifier = if ($facts.source -eq 'environment') { '本次启动环境指定；启动环境改变时可能不同' } else { '沿用已发现的目录；首次启动仍会校验' }
  $lines += @("数据目录（$qualifier）：", $facts.home)
} elseif ($facts.source -eq 'first-launch-choice') { $lines += '数据目录：首次启动时选择（尚未确定）' }
elseif ($facts.source -eq 'legacy-confirmation') { $lines += '数据目录：首次启动确认旧数据归属与迁移（尚未确定）' }
else { $lines += '数据目录：无法确认；请在首次启动时确认，未更改任何数据' }
$lines += @('', '缓存目录：') + $facts.caches
if (-not $facts.home) { $lines += '数据缓存：随首次启动确认的数据目录，位于其 cache 子目录' }
$lines += @('', '完整路径可选中复制；滚动查看全部内容。', '卸载程序保留已有聊天数据；本页不会移动或创建数据。')
# The caller supplies its private installer scratch file; this is the only write.
[IO.File]::WriteAllText($OutputPath, ($lines -join "`r`n"), [Text.UnicodeEncoding]::new($false, $true))
$facts | ConvertTo-Json -Depth 4 -Compress
