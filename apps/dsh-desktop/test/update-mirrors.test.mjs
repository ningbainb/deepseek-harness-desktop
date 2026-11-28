import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import {
  DEFAULT_UPDATE_DOWNLOAD_ROUTE,
  DEFAULT_UPDATE_MIRRORS,
  UpdateDownloadRouter,
  assertUpdateDownloadRoute,
  detectChinaRegion,
  normalizeUpdateDownloadRoute,
  parseUpdateMirrors,
  probeUpdateSource,
  rankUpdateSources,
  rewriteGitHubReleaseUrl,
} from '../src/update-mirrors.mjs'

const OFFICIAL_ASSET = 'https://github.com/ningbainb/deepseek-harness-desktop/releases/download/v2.1.0/DeepSeek-Harness-Desktop-Setup-2.1.0-x64.exe'

test('mirror configuration includes default CDN route, stays HTTPS-only, and can be disabled', () => {
  assert.deepEqual(DEFAULT_UPDATE_MIRRORS, [{
    id: 'download.1521003.xyz',
    label: 'CDN 加速 download.1521003.xyz',
    prefix: 'https://download.1521003.xyz/releases/',
    mode: 'release-path',
  }])
  assert.deepEqual(parseUpdateMirrors(undefined), DEFAULT_UPDATE_MIRRORS)
  assert.deepEqual(parseUpdateMirrors(''), DEFAULT_UPDATE_MIRRORS)
  assert.deepEqual(parseUpdateMirrors('official'), [])
  assert.deepEqual(parseUpdateMirrors('off'), [])
  assert.deepEqual(parseUpdateMirrors('none'), [])
  assert.equal(
    rewriteGitHubReleaseUrl(
      'https://github.com/ningbainb/deepseek-harness-desktop/releases/download/desktop-v5.6.0/DeepSeek-Harness-Desktop-Setup-5.6.0-x64.exe',
      DEFAULT_UPDATE_MIRRORS[0],
    ).href,
    'https://download.1521003.xyz/releases/desktop-v5.6.0/DeepSeek-Harness-Desktop-Setup-5.6.0-x64.exe',
  )
  assert.deepEqual(
    parseUpdateMirrors('https://mirror.example/;http://unsafe.example/;https://user:secret@private.example/'),
    [{ id: 'mirror.example', label: '备用线路 mirror.example', prefix: 'https://mirror.example/' }],
  )
})

test('only public GitHub Release asset URLs are rewritten', () => {
  const mirror = { id: 'ghproxy', label: '国内镜像 ghproxy.net', prefix: 'https://ghproxy.net/' }
  assert.equal(
    rewriteGitHubReleaseUrl(OFFICIAL_ASSET, mirror).href,
    `https://ghproxy.net/${OFFICIAL_ASSET}`,
  )
  assert.equal(
    rewriteGitHubReleaseUrl('https://github.com/ningbainb/deepseek-harness-desktop/archive/main.zip', mirror).href,
    'https://github.com/ningbainb/deepseek-harness-desktop/archive/main.zip',
  )
  assert.equal(
    rewriteGitHubReleaseUrl('https://example.com/releases/download/v2.1.0/app.exe', mirror).href,
    'https://example.com/releases/download/v2.1.0/app.exe',
  )
})

test('source probe reads only a bounded range and rejects HTML responses', async () => {
  const requests = []
  let cancelled = false
  const fetchFn = async (url, options) => {
    requests.push({ url, options })
    return {
      ok: true,
      status: 206,
      headers: { get: (name) => name === 'content-type' ? 'application/octet-stream' : null },
      body: {
        getReader: () => ({
          read: async () => ({ done: false, value: new Uint8Array(64 * 1024) }),
          cancel: async () => { cancelled = true },
        }),
      },
    }
  }
  const result = await probeUpdateSource(OFFICIAL_ASSET, { fetchFn, timeoutMs: 500 })
  assert.equal(result.ok, true)
  assert.equal(requests[0].options.headers.Range, 'bytes=0-65535')
  assert.equal(cancelled, true)

  const html = await probeUpdateSource(OFFICIAL_ASSET, {
    fetchFn: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html; charset=utf-8' },
      body: null,
    }),
  })
  assert.equal(html.ok, false)
})

test('GitHub official stays first while opt-in fallback sources are ranked by availability', async () => {
  const mirrors = [
    { id: 'slow', label: '国内镜像 slow.example', prefix: 'https://slow.example/' },
    { id: 'fast', label: '国内镜像 fast.example', prefix: 'https://fast.example/' },
  ]
  const ranked = await rankUpdateSources({
    officialUrl: OFFICIAL_ASSET,
    mirrors,
    probe: async (_url, source) => ({
      ok: source.id !== 'slow',
      elapsedMs: source.id === 'fast' ? 20 : source.id === 'github' ? 80 : 5,
    }),
  })
  assert.deepEqual(ranked.map((source) => source.id), ['github', 'fast', 'slow'])
})

test('download router preserves checksums, tries GitHub before opt-in mirrors, and restores the provider', async () => {
  const info = {
    tag: 'v2.1.0',
    version: '2.1.0',
    files: [{ url: 'DeepSeek-Harness-Desktop-Setup-2.1.0-x64.exe', sha512: 'trusted-checksum' }],
  }
  const provider = {
    resolveFiles(updateInfo) {
      return [{ url: new URL(OFFICIAL_ASSET), info: updateInfo.files[0] }]
    },
  }
  const originalResolveFiles = provider.resolveFiles
  class RouterUpdater extends EventEmitter {
    updateInfoAndProvider = { info, provider }
    attempts = []

    async downloadUpdate() {
      const resolved = provider.resolveFiles(info)[0]
      this.attempts.push(resolved)
      if (resolved.url.hostname === 'github.com') {
        const error = new Error('GitHub unavailable')
        this.emit('error', error)
        throw error
      }
      return ['downloaded.exe']
    }
  }
  const updater = new RouterUpdater()
  const retryableErrors = []
  const sources = []
  const router = new UpdateDownloadRouter({
    updater,
    mirrors: [{ id: 'fast', label: '国内镜像 fast.example', prefix: 'https://fast.example/' }],
    probe: async () => ({ ok: true, elapsedMs: 10 }),
  })
  updater.on('error', (error) => retryableErrors.push(router.shouldDeferError(error)))

  const result = await router.downloadUpdate(info, {
    onSource: (source) => sources.push(source.id),
  })

  assert.deepEqual(result, ['downloaded.exe'])
  assert.deepEqual(sources, ['github', 'fast'])
  assert.deepEqual(retryableErrors, [true])
  assert.equal(updater.attempts[0].info.sha512, 'trusted-checksum')
  assert.equal(updater.attempts[0].url.href, OFFICIAL_ASSET)
  assert.equal(updater.attempts[1].url.hostname, 'fast.example')
  assert.equal(provider.resolveFiles, originalResolveFiles)
})

test('supports Cloudflare R2 direct /releases/ URLs and region-aware CDN vs GitHub ordering', async () => {
  const r2Mirrors = parseUpdateMirrors('https://cdn.example.com/releases/')
  assert.deepEqual(r2Mirrors, [{
    id: 'cdn.example.com',
    label: 'CDN 加速 cdn.example.com',
    prefix: 'https://cdn.example.com/releases/',
    mode: 'release-path',
  }])
  assert.equal(
    rewriteGitHubReleaseUrl(OFFICIAL_ASSET, r2Mirrors[0]).href,
    'https://cdn.example.com/releases/v2.1.0/DeepSeek-Harness-Desktop-Setup-2.1.0-x64.exe',
  )

  assert.equal(DEFAULT_UPDATE_DOWNLOAD_ROUTE, 'auto')
  assert.equal(normalizeUpdateDownloadRoute('CDN'), 'cdn')
  assert.equal(normalizeUpdateDownloadRoute('invalid'), 'auto')
  assert.equal(assertUpdateDownloadRoute(' github '), 'github')
  assert.throws(() => assertUpdateDownloadRoute('mirror'), /download route/u)
  assert.equal(detectChinaRegion({ timeZone: 'Asia/Shanghai', locale: 'en-US' }), true)
  assert.equal(detectChinaRegion({ timeZone: 'America/New_York', locale: 'zh-CN' }), true)
  assert.equal(detectChinaRegion({ timeZone: 'America/New_York', locale: 'en-US' }), false)

  // In China region (`preferCdn: true`) when CDN probe is faster than GitHub, CDN ranks first.
  const cnRanked = await rankUpdateSources({
    officialUrl: OFFICIAL_ASSET,
    mirrors: r2Mirrors,
    route: 'auto',
    preferCdn: true,
    probe: async (_url, source) => ({ ok: true, elapsedMs: source.id === 'github' ? 320 : 45 }),
  })
  assert.deepEqual(cnRanked.map(s => s.id), ['cdn.example.com', 'github'])

  // Forced `github` ignores CDN mirrors cleanly.
  const ghOnly = await rankUpdateSources({
    officialUrl: OFFICIAL_ASSET,
    mirrors: r2Mirrors,
    route: 'github',
    preferCdn: true,
    probe: async () => ({ ok: true, elapsedMs: 25 }),
  })
  assert.deepEqual(ghOnly.map(s => s.id), ['github'])

  // End-to-end UpdateDownloadRouter picks faster R2 CDN directly when preferCdn is true.
  const selected = []
  const provider = {
    resolveFiles(updateInfo) {
      return [{ url: new URL(OFFICIAL_ASSET), info: updateInfo.files[0] }]
    },
  }
  const router = new UpdateDownloadRouter({
    updater: {
      updateInfoAndProvider: { info: { tag: 'v2.1.0', version: '2.1.0', files: [{ sha512: 'abc' }] }, provider },
      async downloadUpdate() {
        return [provider.resolveFiles({ files: [{ sha512: 'abc' }] })[0].url.href]
      },
    },
    mirrors: r2Mirrors,
    preferCdn: () => true,
    probe: async (_url, source) => ({ ok: true, elapsedMs: source.id === 'github' ? 400 : 30 }),
  })
  const downloaded = await router.downloadUpdate(
    { tag: 'v2.1.0', version: '2.1.0', files: [{ sha512: 'abc' }] },
    { onSource: (s) => selected.push(s.id) },
  )
  assert.deepEqual(selected, ['cdn.example.com'])
  assert.deepEqual(downloaded, ['https://cdn.example.com/releases/v2.1.0/DeepSeek-Harness-Desktop-Setup-2.1.0-x64.exe'])
})
