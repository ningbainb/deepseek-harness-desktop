import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

import { collectDiscoveryErrors, collectPrivacyErrors, collectWebsiteErrors, collectWebsiteScriptErrors, resolveWebsiteVersion } from './validate-website.mjs'
import { sumInstallerDownloads } from '../website/release-stats.mjs'

const websitePath = resolve(import.meta.dirname, '..', 'website', 'index.html')
const privacyPath = resolve(import.meta.dirname, '..', 'website', 'privacy.html')
const siteScriptPath = resolve(import.meta.dirname, '..', 'website', 'script.js')
const desktopPackagePath = resolve(import.meta.dirname, '..', 'apps', 'dsh-desktop', 'package.json')
const desktopPackage = JSON.parse(await readFile(desktopPackagePath, 'utf8'))
const desktopVersion = desktopPackage.version
const websiteHtml = await readFile(websitePath, 'utf8')
const publishedVersion = /<html\b[^>]*\bdata-release-version=["'](\d+\.\d+\.\d+)["']/iu.exec(websiteHtml)?.[1]
const expectedWebsiteVersion = resolveWebsiteVersion(desktopVersion, publishedVersion)

test('unreleased desktop candidates keep the public site on the last published installer', () => {
  assert.equal(resolveWebsiteVersion('4.2.0', '4.1.0'), '4.1.0')
  assert.equal(resolveWebsiteVersion('4.2.0-rc.1', '4.1.0'), '4.1.0')
  assert.throws(() => resolveWebsiteVersion('4.1.0', '4.2.0'), /newer than desktop/u)
  assert.throws(() => resolveWebsiteVersion('4.2.0', undefined), /data-release-version/u)
})

test('privacy page states anonymous retention analytics and user-confirmed diagnostics boundaries', async () => {
  const html = await readFile(privacyPath, 'utf8')
  assert.deepEqual(collectPrivacyErrors(html), [])
})

test('public site does not upload installer-click telemetry', async () => {
  const script = await readFile(siteScriptPath, 'utf8')
  assert.deepEqual(collectWebsiteScriptErrors(script), [])
  assert.ok(collectWebsiteScriptErrors("navigator.sendBeacon('https://telemetry.example')").some(error => error.includes('Beacon upload')))
})

test('website fallback installer matches the desktop release version', async () => {
  assert.deepEqual(await collectWebsiteErrors(websiteHtml, expectedWebsiteVersion), [])
})

test('website validation rejects stale fallback installers', async () => {
  const html = websiteHtml.replaceAll(expectedWebsiteVersion, '0.1.9')
  const errors = await collectWebsiteErrors(html, expectedWebsiteVersion)
  assert.ok(errors.some(error => error.includes('stale installer version 0.1.9')))
  assert.ok(errors.some(error => error.includes('fallback label')))
})

test('website exposes canonical SEO and structured data markers', async () => {
  const errors = await collectWebsiteErrors(websiteHtml, expectedWebsiteVersion)
  assert.deepEqual(errors, [])
})

test('website validation rejects stale presentation versions', async () => {
  const html = websiteHtml
    .replace(/<title>[^<]*<\/title>/iu, '<title>DeepSeek Harness Desktop 2.2.0</title>')
    .replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/iu, '<h1>DeepSeek Harness Desktop 2.1</h1>')
  const errors = await collectWebsiteErrors(html, expectedWebsiteVersion)
  assert.ok(errors.some(error => error.includes('page title')))
  assert.ok(errors.some(error => error.includes('page heading')))
})

test('website structured FAQ questions remain visible', async () => {
  const html = websiteHtml
    .replace('<h3>桌面版能和官方 Web 端同时运行吗？</h3>', '<h3>已移除的问题</h3>')
  const errors = await collectWebsiteErrors(html, expectedWebsiteVersion)
  assert.ok(errors.some(error => error.includes('structured FAQ question is not visible')))
})

test('website validation rejects missing GitHub Star guidance', async () => {
  const html = websiteHtml
    .replaceAll('data-star-cta', 'data-removed-star-cta')
    .replaceAll('data-star-count', 'data-removed-star-count')
  const errors = await collectWebsiteErrors(html, expectedWebsiteVersion)
  assert.ok(errors.some(error => error.includes('GitHub Star CTA')))
  assert.ok(errors.some(error => error.includes('GitHub Star count')))
})

test('tracked installer links remain direct GitHub downloads', async () => {
  const html = websiteHtml.replace(
    'data-download-source="hero" href="https://github.com/',
    'data-download-source="hero" href="https://telemetry.example/',
  )
  const errors = await collectWebsiteErrors(html, expectedWebsiteVersion)
  assert.ok(errors.some(error => error.includes('must remain a direct GitHub download')))
})

test('sumInstallerDownloads totals only Windows x64 installer assets', () => {
  const releases = [
    {
      assets: [
        { name: 'DeepSeek-Harness-Desktop-Setup-0.1.8-x64.exe', download_count: 65 },
        { name: 'SHA256SUMS.txt', download_count: 10 },
      ],
    },
    {
      assets: [
        { name: 'DeepSeek-Harness-Desktop-Setup-0.1.7-x64.exe', download_count: 297 },
        { name: 'DeepSeek-Harness-Desktop-Setup-0.1.7-arm64.exe', download_count: 99 },
        { name: 'DeepSeek-Harness-Desktop-Setup-0.1.6-x64.exe', download_count: -1 },
      ],
    },
  ]

  assert.equal(sumInstallerDownloads(releases), 362)
  assert.equal(sumInstallerDownloads(null), null)
})

test('website discovery files identify the canonical release', () => {
  const sitemap = '<url><loc>https://ningbainb.github.io/deepseek-harness-desktop/</loc><loc>https://ningbainb.github.io/deepseek-harness-desktop/privacy.html</loc><lastmod>2026-08-16</lastmod></url>'
  const robots = 'User-agent: OAI-SearchBot\nAllow: /\nSitemap: https://ningbainb.github.io/deepseek-harness-desktop/sitemap.xml'
  const llms = 'https://ningbainb.github.io/deepseek-harness-desktop/ https://ningbainb.github.io/deepseek-harness-desktop/privacy.html https://github.com/ningbainb/deepseek-harness-desktop Setup-0.1.8-x64.exe'
  const key = 'f99946a1f6864579a8d2f96040502784'
  assert.deepEqual(collectDiscoveryErrors(sitemap, robots, llms, key, '0.1.8'), [])
})

test('website discovery validation rejects missing signals', () => {
  const errors = collectDiscoveryErrors('<urlset></urlset>', '', '', 'wrong-key', '0.1.8')
  assert.ok(errors.some(error => error.includes('canonical homepage')))
  assert.ok(errors.some(error => error.includes('OAI-SearchBot')))
  assert.ok(errors.some(error => error.includes('source repository')))
  assert.ok(errors.some(error => error.includes('IndexNow key')))
})
