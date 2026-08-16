const installerPattern = /^DeepSeek-Harness-Desktop-Setup-[\w.-]+-x64\.exe$/

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
