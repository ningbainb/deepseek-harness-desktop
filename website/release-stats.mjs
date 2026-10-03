const installerPattern = /^DeepSeek-Harness-Desktop-Setup-[\w.-]+-x64\.exe$/

export function resolvePlatformDownloads(release) {
  const version = /^desktop-v(\d+\.\d+\.\d+)$/u.exec(release?.tag_name ?? '')?.[1]
  const names = {
    'windows-x64': `DeepSeek-Harness-Desktop-Setup-${version}-x64.exe`,
    'macos-arm64': `DeepSeek-Harness-Desktop-${version}-arm64.dmg`,
    'linux-x64': `DeepSeek-Harness-Desktop-${version}-x86_64.AppImage`,
  }
  const assets = Array.isArray(release?.assets) ? release.assets : []
  return Object.fromEntries(Object.entries(names).map(([platform, name]) => {
    const asset = version ? assets.find(candidate => candidate?.name === name) : undefined
    return [platform, asset?.browser_download_url || release?.html_url]
  }))
}

export function sumInstallerDownloads(releases) {
  if (!Array.isArray(releases)) return null

  let total = 0
  let matched = false

  for (const release of releases) {
    if (!Array.isArray(release?.assets)) continue
    for (const asset of release.assets) {
      if (!installerPattern.test(asset?.name ?? '')) continue
      const downloads = Number(asset.download_count)
      if (!Number.isFinite(downloads) || downloads < 0) continue
      total += downloads
      matched = true
    }
  }

  return matched ? total : null
}
