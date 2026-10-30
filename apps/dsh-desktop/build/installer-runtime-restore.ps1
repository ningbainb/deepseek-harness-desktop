param(
  [Parameter(Mandatory = $true)]
  [string] $InstallDirectory,
  [string] $ExpectedManifestSHA256 = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\', '/')
$electronPrefix = 'resources/app.asar.unpacked/node_modules/electron/dist/'
$metadata = 'resources/runtime-reconstruction/'
$shared = @(
  'chrome_100_percent.pak', 'chrome_200_percent.pak', 'icudtl.dat',
  'LICENSES.chromium.html', 'locales/en-US.pak', 'locales/zh-CN.pak', 'locales/zh-TW.pak',
  'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin',
  'vk_swiftshader_icd.json', 'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll',
  'ffmpeg.dll', 'vk_swiftshader.dll', 'vulkan-1.dll'
)

function Assert-PlainPath([string] $Path, [bool] $AllowMissing = $false) {
  $full = [IO.Path]::GetFullPath($Path)
  $drive = [IO.Path]::GetPathRoot($full)
  $current = $drive
  foreach ($part in $full.Substring($drive.Length).Split([char[]] '\/', [StringSplitOptions]::RemoveEmptyEntries)) {
    $current = Join-Path $current $part
    if (-not (Test-Path -LiteralPath $current)) {
      if ($AllowMissing) { return }
      throw "invalid runtime path, file missing: $current"
    }
    $item = Get-Item -LiteralPath $current -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "runtime path contains a link/reparse point: $current"
    }
  }
}

function Resolve-RuntimePath([string] $Relative) {
  if ([string]::IsNullOrWhiteSpace($Relative) -or $Relative.Contains('\') -or
    [IO.Path]::IsPathRooted($Relative) -or $Relative.Contains(':') -or
    @($Relative.Split('/') | Where-Object { $_ -eq '' -or $_ -eq '.' -or $_ -eq '..' }).Count -ne 0) {
    throw 'invalid runtime relative path'
  }
  $full = [IO.Path]::GetFullPath((Join-Path $root $Relative))
  if (-not $full.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'invalid runtime path outside installation'
  }
  Assert-PlainPath $full $true
  return $full
}

function Assert-Number($Value, [bool] $Positive = $false) {
  if (-not ($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal]) -or
    [double]::IsNaN([double] $Value) -or [double]::IsInfinity([double] $Value) -or
    [math]::Floor([double] $Value) -ne [double] $Value -or $Value -lt 0 -or $Value -gt 1073741824 -or
    ($Positive -and $Value -eq 0)) { throw 'invalid runtime numeric range' }
}

function Assert-Hash([string] $Value) {
  if ($Value -cnotmatch '^[a-f0-9]{64}$') { throw 'invalid runtime hash' }
}

function Get-StreamHash([IO.Stream] $Stream) {
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { $result = ([BitConverter]::ToString($hasher.ComputeHash($Stream))).Replace('-', '').ToLowerInvariant() }
  finally { $hasher.Dispose() }
  [void] $Stream.Seek(0, [IO.SeekOrigin]::Begin)
  return $result
}

Assert-PlainPath $root
$manifestPath = Resolve-RuntimePath ($metadata + 'manifest.json')
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  # Old installer fixtures contain no Electron package. A compacted real install
  # must never silently commit when its restoration metadata is missing.
  if (-not [string]::IsNullOrWhiteSpace($ExpectedManifestSHA256) -or
    (Test-Path -LiteralPath (Join-Path $root 'resources/app.asar.unpacked/node_modules/electron'))) {
    throw 'runtime reconstruction manifest is missing'
  }
  Write-Output 'runtime-reconstruction-not-required'
  return
}
Assert-Hash $ExpectedManifestSHA256
$manifestStream = [IO.File]::Open($manifestPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
try {
  if ($manifestStream.Length -gt 262144) { throw 'invalid runtime manifest size' }
  if ((Get-StreamHash $manifestStream) -cne $ExpectedManifestSHA256) { throw 'runtime manifest integrity mismatch' }
  $reader = [IO.StreamReader]::new($manifestStream, [Text.Encoding]::UTF8)
  try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json }
  finally { $reader.Dispose() }
} finally { $manifestStream.Dispose() }
if ($manifest.schemaVersion -ne 1 -or $manifest.electronVersion -notmatch '^\d+\.\d+\.\d+$' -or
  $manifest.literal.path -cne ($metadata + 'electron-literal.bin')) { throw 'unsupported runtime manifest' }
Assert-Number $manifest.literal.size
Assert-Hash $manifest.literal.sha256
if ($manifest.literal.size -gt 1048576) { throw 'invalid literal payload size' }
$literalPath = Resolve-RuntimePath $manifest.literal.path
$literal = [IO.File]::ReadAllBytes($literalPath)
$literalStream = [IO.MemoryStream]::new($literal, $false)
try {
  if ($literal.Length -ne $manifest.literal.size -or (Get-StreamHash $literalStream) -cne $manifest.literal.sha256) {
    throw 'literal payload integrity mismatch'
  }
} finally { $literalStream.Dispose() }
$files = @($manifest.files)
if ($files.Count -gt 18) { throw 'invalid runtime manifest file count' }
$targets = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($file in $files) {
  Assert-Number $file.size $true
  Assert-Number $file.sourceSize $true
  Assert-Hash $file.sha256
  Assert-Hash $file.sourceSHA256
  if ($file.target -isnot [string] -or -not $file.target.StartsWith($electronPrefix, [StringComparison]::Ordinal)) {
    throw 'invalid runtime target path'
  }
  $name = $file.target.Substring($electronPrefix.Length)
  if (-not $targets.Add($file.target)) { throw 'duplicate runtime target' }
  if ($name -ceq 'electron.exe') {
    if ($file.source -cne 'DeepSeek Harness Desktop.exe') { throw 'invalid executable source path' }
    $covered = 0L
    $ranges = @($file.ranges)
    if ($ranges.Count -eq 0 -or $ranges.Count -gt 256) { throw 'invalid runtime ranges' }
    foreach ($range in $ranges) {
      Assert-Number $range.targetOffset
      Assert-Number $range.offset
      Assert-Number $range.length $true
      if ($range.targetOffset -ne $covered -or $range.kind -cnotin @('source', 'literal')) { throw 'invalid runtime range coverage' }
      $limit = if ($range.kind -ceq 'source') { $file.sourceSize } else { $literal.Length }
      if ([long] $range.offset + [long] $range.length -gt $limit) { throw 'invalid runtime input range' }
      $covered += [long] $range.length
    }
    if ($covered -ne $file.size) { throw 'invalid runtime output range' }
  } elseif ($name -cnotin $shared -or $file.source -cne $name -or $file.sourceSize -ne $file.size -or
    $file.sourceSHA256 -cne $file.sha256 -or $null -ne $file.PSObject.Properties['ranges']) {
    throw 'invalid shared resource source or target path'
  }
  [void] (Resolve-RuntimePath $file.source)
  [void] (Resolve-RuntimePath $file.target)
}

$buffer = [byte[]]::new(1048576)
$restored = 0
foreach ($file in $files) {
  $sourcePath = Resolve-RuntimePath $file.source
  $targetPath = Resolve-RuntimePath $file.target
  $source = [IO.File]::Open($sourcePath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  $temporary = $null
  try {
    if ($source.Length -ne $file.sourceSize -or (Get-StreamHash $source) -cne $file.sourceSHA256) {
      throw 'runtime source integrity mismatch'
    }
    if (Test-Path -LiteralPath $targetPath -PathType Leaf) {
      $existing = [IO.File]::Open($targetPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
      try { $valid = $existing.Length -eq $file.size -and (Get-StreamHash $existing) -ceq $file.sha256 }
      finally { $existing.Dispose() }
      if ($valid) { continue }
      throw 'runtime target integrity mismatch; preserving existing file'
    }
    $parent = [IO.Path]::GetDirectoryName($targetPath)
    Assert-PlainPath $parent $true
    [void] [IO.Directory]::CreateDirectory($parent)
    Assert-PlainPath $parent
    $temporary = Join-Path $parent ('.dsh-runtime-' + [guid]::NewGuid().ToString('N') + '.tmp')
    $output = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
      if ($file.target -ceq ($electronPrefix + 'electron.exe')) {
        foreach ($range in $file.ranges) {
          if ($range.kind -ceq 'literal') {
            $output.Write($literal, [int] $range.offset, [int] $range.length)
          } else {
            [void] $source.Seek([long] $range.offset, [IO.SeekOrigin]::Begin)
            $remaining = [long] $range.length
            while ($remaining -gt 0) {
              $count = $source.Read($buffer, 0, [int] [math]::Min($buffer.Length, $remaining))
              if ($count -le 0) { throw 'runtime source range ended early' }
              $output.Write($buffer, 0, $count)
              $remaining -= $count
            }
          }
        }
      } else { $source.CopyTo($output, $buffer.Length) }
      $output.Flush($true)
      [void] $output.Seek(0, [IO.SeekOrigin]::Begin)
      if ($output.Length -ne $file.size -or (Get-StreamHash $output) -cne $file.sha256) { throw 'runtime reconstructed file integrity mismatch' }
    } finally { $output.Dispose() }
    Assert-PlainPath $targetPath $true
    # Move refuses a concurrent replacement; never overwrite an unknown target.
    [IO.File]::Move($temporary, $targetPath)
    $temporary = $null
    $restored++
  } finally {
    $source.Dispose()
    if ($null -ne $temporary -and (Test-Path -LiteralPath $temporary)) { [IO.File]::Delete($temporary) }
  }
}
Write-Output "runtime-reconstruction-complete files=$restored validated=$($files.Count)"
