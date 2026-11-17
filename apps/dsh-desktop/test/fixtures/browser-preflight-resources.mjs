import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { prepareBrowserComponentPreflight } from '../../scripts/prepare-browser-component-preflight.mjs'
const desktop = resolve(import.meta.dirname, '../..')
const sha = value => createHash('sha256').update(value).digest('hex')
/** The lifecycle fixture isolates its unrelated tiny non-Electron payload from the new resource service. */
export async function prepareBrowserPreflightFixtureResources(root, { controlledService = false } = {}) {
  const physical = await realpath(root), rel = relative(await realpath(tmpdir()), physical)
  assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel), 'fixture resources must be inside the physical temporary root')
  const resources = join(physical, 'build-resources')
  await mkdir(resources)
  for (const item of await readdir(join(desktop, 'build'), { withFileTypes: true })) {
    if (item.isFile() && item.name !== 'browser-component-preflight.nsh') await copyFile(join(desktop, 'build', item.name), join(resources, item.name))
  }
  await prepareBrowserComponentPreflight({ outputDirectory: join(resources, 'browser-component-preflight') })
  if (controlledService) {
    const contracts = join(resources, 'preflight-contracts.json'), evidence = join(resources, 'preflight-evidence.jsonl')
    await writeFile(contracts, '[]')
    await writeFile(join(resources, 'installer-browser-preflight.ps1'), '\uFEFF' + `param([string] $InstallDirectory, [string] $PreflightEntry, [string] $ExpectedEntrySHA256, [string] $ExpectedManifestSHA256, [string] $InstallRegistryKey, [string] $UninstallRegistryKey, [int] $InstallerProcessId)
$ErrorActionPreference = 'Stop'
try {
  $root = '${physical.replaceAll("'", "''")}'
  $actual = [IO.Path]::GetFullPath($InstallDirectory)
  if (-not $actual.StartsWith($root + '\\', [StringComparison]::OrdinalIgnoreCase) -or -not $InstallRegistryKey.StartsWith(('Software' + [char]92 + 'DeepSeekHarnessDesktopTests' + [char]92), [StringComparison]::OrdinalIgnoreCase)) { throw 'fixture scope rejected' }
  $contracts = Get-Content -LiteralPath '${contracts.replaceAll("'", "''")}' -Raw -Encoding UTF8 | ConvertFrom-Json
  $contract = @($contracts | Where-Object { $_.key -ceq $InstallRegistryKey })
  if ($contract.Count -ne 1) { throw 'fixture contract missing or ambiguous' }
  foreach ($old in $contract[0].oldFiles) {
    $info = Get-Item -LiteralPath $old.path -Force
    if ($info.Length -ne $old.size -or $info.LastWriteTimeUtc.Ticks.ToString() -cne $old.ticks) { throw 'old program moved or changed before preflight' }
    if ($info.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'fixture old path contains a link' }
  }
  $originalHome = [IO.File]::ReadAllText($contract[0].homeSentinel)
  if ($originalHome -cne $contract[0].homeValue) { throw 'fixture Home changed before preflight' }
  $line = @{ key = $InstallRegistryKey; oldFilesPresent = $true; homeUnchanged = $true; controlledResourceService = $true } | ConvertTo-Json -Compress
  [IO.File]::AppendAllText('${evidence.replaceAll("'", "''")}', $line + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  Write-Output 'browser-preflight-controlled-fixture-validated'
  exit 0
} catch { Write-Output $_.Exception.Message; exit 37 }
`)
  }
  return resources
}
export async function registerBrowserPreflightFixture(resources, { key, install, directory }) {
  const homeSentinel = join(directory, 'preflight-home-sentinel.txt'), homeValue = 'unchanged isolated Home'
  await writeFile(homeSentinel, homeValue)
  const oldFiles = []
  for (const name of ['DeepSeek Harness Desktop.exe', 'resources/app.asar']) {
    const path = join(install, name)
    const info = await stat(path, { bigint: true }).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (info) oldFiles.push({ path, size: Number(info.size), ticks: (info.mtimeNs / 100n + 621355968000000000n).toString() })
  }
  const path = join(resources, 'preflight-contracts.json'), contracts = JSON.parse(await readFile(path, 'utf8'))
  contracts.push({ key: `${key}\\Install`, oldFiles, homeSentinel, homeValue })
  await writeFile(path, JSON.stringify(contracts))
}
export async function assertBrowserPreflightFixtureCalled(resources, key) {
  const text = await readFile(join(resources, 'preflight-evidence.jsonl'), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return '' })
  const rows = text.trim() ? text.trim().split('\n').map(row => JSON.parse(row)) : []
  const calls = rows.filter(row => row.key === `${key}\\Install`)
  assert.equal(calls.length, 1, 'the controlled browser resource preflight must execute exactly once before lifecycle mutation')
  assert.equal(calls[0].oldFilesPresent, true); assert.equal(calls[0].homeUnchanged, true)
}
