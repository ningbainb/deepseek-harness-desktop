const installerPattern = /^DeepSeek-Harness-Desktop-Setup-[\w.-]+-x64\.exe$/
const githubAssetBase = 'https://github.com/ningbainb/deepseek-harness-desktop/releases/download/'
const mirrorAssetBase = 'https://download.1521003.xyz/releases/'
const verifiedMirrorTags = new Set(['desktop-v5.5.0'])

export function resolveMirroredDownload(download) {
  if (typeof download !== 'string' || !download.startsWith(githubAssetBase)) return download
  const [tag, asset, extra] = download.slice(githubAssetBase.length).split('/')
  if (!verifiedMirrorTags.has(tag) || extra !== undefined || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(asset ?? '')) return download
  return `${mirrorAssetBase}${tag}/${asset}`
}

export function resolvePlatformDownloads(release) {
  const version = /^desktop-v(\d+\.\d+\.\d+)$/u.exec(release?.tag_name ?? '')?.[1]
  const names = {
    'windows-x64': [`DeepSeek-Harness-Desktop-Setup-${version}-x64.exe`],
    'macos-arm64': [`DeepSeek-Harness-Desktop-${version}-arm64.dmg`],
    'linux-x64': [`DeepSeek-Harness-Desktop-${version}-amd64.deb`, `DeepSeek-Harness-Desktop-${version}-x86_64.AppImage`],
  }
  const assets = Array.isArray(release?.assets) ? release.assets : []
  return Object.fromEntries(Object.entries(names).map(([platform, candidates]) => {
    const asset = version
      ? candidates.map(name => assets.find(candidate => candidate?.name === name)).find(candidate => candidate?.browser_download_url)
      : undefined
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
