import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

import { collectDiscoveryErrors, collectWebsiteErrors } from './validate-website.mjs'
import { sumInstallerDownloads } from '../website/release-stats.mjs'

const websitePath = resolve(import.meta.dirname, '..', 'website', 'index.html')

test('website fallback installer matches the desktop release version', async () => {
  const html = await readFile(websitePath, 'utf8')
  assert.deepEqual(await collectWebsiteErrors(html, '2.2.0'), [])
})

test('website validation rejects stale fallback installers', async () => {
  const html = (await readFile(websitePath, 'utf8')).replaceAll('2.2.0', '0.1.9')
  const errors = await collectWebsiteErrors(html, '2.2.0')
  assert.ok(errors.some(error => error.includes('stale installer version 0.1.9')))
  assert.ok(errors.some(error => error.includes('fallback label')))
})

test('website exposes canonical SEO and structured data markers', async () => {
  const html = await readFile(websitePath, 'utf8')
  const errors = await collectWebsiteErrors(html, '2.2.0')
  assert.deepEqual(errors, [])
})

test('website validation rejects missing GitHub Star guidance', async () => {
  const html = (await readFile(websitePath, 'utf8'))
    .replaceAll('data-star-cta', 'data-removed-star-cta')
    .replaceAll('data-star-count', 'data-removed-star-count')
  const errors = await collectWebsiteErrors(html, '2.2.0')
  assert.ok(errors.some(error => error.includes('GitHub Star CTA')))
  assert.ok(errors.some(error => error.includes('GitHub Star count')))
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
  const sitemap = '<url><loc>https://ningbainb.github.io/deepseek-harness-desktop/</loc><lastmod>2026-08-16</lastmod></url>'
  const robots = 'User-agent: OAI-SearchBot\nAllow: /\nSitemap: https://ningbainb.github.io/deepseek-harness-desktop/sitemap.xml'
  const llms = 'https://ningbainb.github.io/deepseek-harness-desktop/ https://github.com/ningbainb/deepseek-harness-desktop Setup-0.1.8-x64.exe'
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
