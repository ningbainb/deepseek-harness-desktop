import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')
const websiteRoot = path.join(root, 'website')
const htmlPath = path.join(websiteRoot, 'index.html')
const privacyPath = path.join(websiteRoot, 'privacy.html')
const siteScriptPath = path.join(websiteRoot, 'script.js')
const sitemapPath = path.join(websiteRoot, 'sitemap.xml')
const robotsPath = path.join(websiteRoot, 'robots.txt')
const llmsPath = path.join(websiteRoot, 'llms.txt')
const indexNowKey = 'f99946a1f6864579a8d2f96040502784'
const indexNowKeyPath = path.join(websiteRoot, `${indexNowKey}.txt`)
const desktopPackagePath = path.join(root, 'apps', 'dsh-desktop', 'package.json')
const canonicalUrl = 'https://ningbainb.github.io/deepseek-harness-desktop/'

function collectAttributeValues(html, attribute) {
  const pattern = new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, 'gi')
  return [...html.matchAll(pattern)].map(match => match[1])
}

function isLocalAsset(value) {
  return !value.startsWith('#')
    && !value.startsWith('http://')
    && !value.startsWith('https://')
    && !value.startsWith('mailto:')
    && !value.startsWith('data:')
}

export async function collectWebsiteErrors(html, expectedVersion) {
  const errors = []
  const requiredMarkers = [
    ['main landmark', /\bid=["']main["']/i],
    ['release section', /\bid=["']release["']/i],
    ['release card', /\bdata-release-card\b/i],
    ['download link', /\bclass=["'][^"']*\bdownload-link\b[^"']*["']/i],
    ['release page link', /\bclass=["'][^"']*\brelease-page-link\b[^"']*["']/i],
    ['checksum link', /\bclass=["'][^"']*\bchecksum-link\b[^"']*["']/i],
    ['canonical URL', /<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']https:\/\/ningbainb\.github\.io\/deepseek-harness-desktop\/["']/i],
    ['robots index directive', /<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["'][^"']*\bindex\b/i],
    ['Google site verification', /<meta\b[^>]*\bname=["']google-site-verification["'][^>]*\bcontent=["']QMzFv4LC5XXFJJf5L3_yoCaHIr2MVIxUm9S5qG9MiwE["']/i],
    ['Open Graph URL', /<meta\b[^>]*\bproperty=["']og:url["'][^>]*\bcontent=["']https:\/\/ningbainb\.github\.io\/deepseek-harness-desktop\/["']/i],
    ['Twitter summary card', /<meta\b[^>]*\bname=["']twitter:card["'][^>]*\bcontent=["']summary_large_image["']/i],
    ['structured data', /<script\b[^>]*\btype=["']application\/ld\+json["']/i],
    ['FAQ section', /\bid=["']faq["']/i],
    ['latest features section', /\bid=["']latest-features["']/i],
    ['GitHub Star CTA', /\bdata-star-cta\b/i],
    ['GitHub Star count', /\bdata-star-count\b/i],
    ['release download count', /\bdata-download-count\b/i],
    ['cumulative download label', /累计安装包下载/],
    ['navigation download source', /\bdata-download-source=["']nav["']/i],
    ['hero download source', /\bdata-download-source=["']hero["']/i],
    ['terminal download source', /\bdata-download-source=["']terminal["']/i],
    ['install download source', /\bdata-download-source=["']install["']/i],
  ]

  for (const [label, pattern] of requiredMarkers) {
    if (!pattern.test(html)) errors.push(`missing required marker: ${label}`)
  }

  if (/\b(?:href|src)\s*=\s*["']javascript:/i.test(html)) {
    errors.push('javascript: URLs are not allowed')
  }

  if (/\b(?:noindex|nofollow)\b/i.test(html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i)?.[0] || '')) {
    errors.push('robots meta must not block indexing or following')
  }

  const structuredDataMatch = html.match(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)
  if (structuredDataMatch) {
    try {
      const structuredData = JSON.parse(structuredDataMatch[1])
      const graph = structuredData['@graph'] || []
      const types = graph.map(item => item['@type'])
      for (const type of ['WebSite', 'SoftwareApplication', 'FAQPage']) {
        if (!types.includes(type)) errors.push(`structured data is missing ${type}`)
      }
      const software = graph.find(item => item['@type'] === 'SoftwareApplication')
      if (expectedVersion && software?.softwareVersion !== expectedVersion) {
        errors.push(`structured data softwareVersion must be ${expectedVersion}`)
      }
      const faq = graph.find(item => item['@type'] === 'FAQPage')
      for (const entity of faq?.mainEntity || []) {
        if (typeof entity?.name === 'string' && !html.includes(`<h3>${entity.name}</h3>`)) {
          errors.push(`structured FAQ question is not visible: ${entity.name}`)
        }
      }
    } catch {
      errors.push('structured data must contain valid JSON')
    }
  }

  if (expectedVersion) {
    const expectedArtifact = `DeepSeek-Harness-Desktop-Setup-${expectedVersion}-x64.exe`
    const artifactVersions = [...html.matchAll(/DeepSeek-Harness-Desktop-Setup-(\d+\.\d+\.\d+)-x64\.exe/g)]
      .map(match => match[1])
    if (!html.includes(expectedArtifact)) errors.push(`website fallback installer must target ${expectedArtifact}`)
    for (const version of new Set(artifactVersions)) {
      if (version !== expectedVersion) errors.push(`website contains stale installer version ${version}; expected ${expectedVersion}`)
    }
    if (!html.includes(`v${expectedVersion}`)) errors.push(`website fallback label must include v${expectedVersion}`)
    const escapedVersion = expectedVersion.replaceAll('.', '\\.')
    const presentationMarkers = [
      ['page title', new RegExp(`<title>[^<]*${escapedVersion}[^<]*<\\/title>`, 'i')],
      ['meta description', new RegExp(`<meta\\b[^>]*name=["']description["'][^>]*content=["'][^"']*${escapedVersion}`, 'i')],
      ['page heading', new RegExp(`<h1\\b[^>]*>[\\s\\S]*?${escapedVersion}[\\s\\S]*?<\\/h1>`, 'i')],
      ['versioned interface screenshot', /assets\/desktop-\d+\.\d+\.\d+-[^"']+\.webp/i],
    ]
    for (const [label, pattern] of presentationMarkers) {
      if (!pattern.test(html)) errors.push(`${label} must identify ${expectedVersion}`)
    }
  }

  for (const image of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt=["'][^"']*["']/i.test(image[0])) errors.push(`image is missing alt text: ${image[0]}`)
  }

  for (const match of html.matchAll(/<a\b[^>]*\bdata-download-source=["'][^"']+["'][^>]*>/gi)) {
    if (!/\bhref=["']https:\/\/github\.com\/ningbainb\/deepseek-harness-desktop\/releases\/(?:latest\/)?download\//i.test(match[0])) {
      errors.push(`tracked installer link must remain a direct GitHub download: ${match[0]}`)
    }
  }

  const blankLinks = [...html.matchAll(/<a\b[^>]*\btarget=["']_blank["'][^>]*>/gi)]
  for (const match of blankLinks) {
    if (!/\brel=["'][^"']*\bnoreferrer\b[^"']*["']/i.test(match[0])) {
      errors.push(`target=_blank link is missing rel=noreferrer: ${match[0]}`)
    }
  }

  const localAssets = [...new Set([
    ...collectAttributeValues(html, 'href'),
    ...collectAttributeValues(html, 'src'),
  ].filter(isLocalAsset).map(value => value.split(/[?#]/, 1)[0]))]

  for (const relativePath of localAssets) {
    const candidate = path.resolve(websiteRoot, relativePath)
    if (!candidate.startsWith(`${websiteRoot}${path.sep}`)) {
      errors.push(`local asset escapes website directory: ${relativePath}`)
      continue
    }
    try {
      await access(candidate)
    } catch {
      errors.push(`missing local asset: ${relativePath}`)
    }
  }

  return errors
}

export function collectPrivacyErrors(html) {
  const errors = []
  const requiredMarkers = [
    ['privacy canonical URL', /<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']https:\/\/ningbainb\.github\.io\/deepseek-harness-desktop\/privacy\.html["']/i],
    ['official anonymous analytics disclosure', /官方包默认进行匿名产品分析/u],
    ['anonymous retention actor disclosure', /稳定匿名安装哈希/u],
    ['country-only and no-IP boundary', /国家级代码，不保存 IP/u],
    ['user-confirmed export', /仅在用户主动确认后导出/u],
    ['user-selected destination', /用户选择的位置/u],
    ['diagnostic archive format', /JSON\/ZIP/u],
    ['diagnostic manifest and hashes', /清单和哈希/u],
    ['conversation exclusion', /对话、提示词、AI 回复/u],
    ['credential exclusion', /API Key、Token、Cookie/u],
    ['user-content exclusion', /完整 Prompt、完整 Session History、Tool Result/u],
    ['SSH private-key exclusion', /SSH 私钥/u],
    ['website no-upload disclosure', /官网不自动上报安装包点击/u],
  ]
  for (const [label, pattern] of requiredMarkers) {
    if (!pattern.test(html)) errors.push(`privacy page is missing required marker: ${label}`)
  }
  if (/\b(?:href|src)\s*=\s*["']javascript:/i.test(html)) {
    errors.push('privacy page contains a javascript: URL')
  }
  for (const match of html.matchAll(/<a\b[^>]*\btarget=["']_blank["'][^>]*>/gi)) {
    if (!/\brel=["'][^"']*\bnoreferrer\b[^"']*["']/i.test(match[0])) {
      errors.push(`privacy target=_blank link is missing rel=noreferrer: ${match[0]}`)
    }
  }
  return errors
}

export function collectWebsiteScriptErrors(script) {
  const errors = []
  const prohibitedMarkers = [
    ['installer telemetry module', /download-telemetry\.mjs/u],
    ['installer telemetry reporter', /reportInstallerDownloadClick/u],
    ['Beacon upload', /\bsendBeacon\s*\(/u],
  ]
  for (const [label, pattern] of prohibitedMarkers) {
    if (pattern.test(script)) errors.push(`website script must not contain ${label}`)
  }
  return errors
}

export function collectDiscoveryErrors(sitemap, robots, llms, keyFile, expectedVersion) {
  const errors = []
  if (!sitemap.includes(`<loc>${canonicalUrl}</loc>`)) errors.push('sitemap must include the canonical homepage')
  if (!sitemap.includes(`<loc>${canonicalUrl}privacy.html</loc>`)) errors.push('sitemap must include the privacy policy')
  if (!sitemap.includes('<lastmod>')) errors.push('sitemap must include lastmod')
  if (!robots.includes('User-agent: OAI-SearchBot') || !robots.includes('Allow: /')) errors.push('robots.txt must allow OAI-SearchBot')
  if (!robots.includes(`Sitemap: ${canonicalUrl}sitemap.xml`)) errors.push('robots.txt must identify the sitemap')
  if (!llms.includes(canonicalUrl)) errors.push('llms.txt must include the canonical homepage')
  if (!llms.includes('https://github.com/ningbainb/deepseek-harness-desktop')) errors.push('llms.txt must include the source repository')
  if (!llms.includes(`${canonicalUrl}privacy.html`)) errors.push('llms.txt must include the privacy policy')
  if (expectedVersion && !llms.includes(`Setup-${expectedVersion}-x64.exe`)) errors.push(`llms.txt must target installer ${expectedVersion}`)
  if (keyFile.trim() !== indexNowKey) errors.push('IndexNow key file must match its filename')
  return errors
}

export async function validateWebsite() {
  const [html, privacy, siteScript, sitemap, robots, llms, keyFile, desktopPackage] = await Promise.all([
    readFile(htmlPath, 'utf8'),
    readFile(privacyPath, 'utf8'),
    readFile(siteScriptPath, 'utf8'),
    readFile(sitemapPath, 'utf8'),
    readFile(robotsPath, 'utf8'),
    readFile(llmsPath, 'utf8'),
    readFile(indexNowKeyPath, 'utf8'),
    readFile(desktopPackagePath, 'utf8'),
  ])
  const version = JSON.parse(desktopPackage).version
  const errors = [
    ...await collectWebsiteErrors(html, version),
    ...collectPrivacyErrors(privacy),
    ...collectWebsiteScriptErrors(siteScript),
    ...collectDiscoveryErrors(sitemap, robots, llms, keyFile, version),
  ]
  if (errors.length > 0) {
    throw new Error(`website validation failed:\n- ${errors.join('\n- ')}`)
  }
  return localSummary(html)
}

function localSummary(html) {
  const imageCount = collectAttributeValues(html, 'src').filter(value => /\.(?:png|jpe?g|webp|svg)(?:[?#]|$)/i.test(value)).length
  const sectionCount = (html.match(/<section\b/gi) || []).length
  return `validated website: ${sectionCount} sections, ${imageCount} images`
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  validateWebsite()
    .then(summary => console.log(summary))
    .catch(error => {
      console.error(error.message)
      process.exitCode = 1
    })
}
