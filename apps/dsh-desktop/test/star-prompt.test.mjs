import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  applyStarPromptSurface,
  createStarPromptSurfaceScript,
  installStarPromptSurface,
  STAR_PROMPT_CSS,
  STAR_PROMPT_VERSION,
  StarPromptStore,
  renderSponsorQr,
} from '../src/star-prompt.mjs'
import { AFDIAN_SPONSOR_URL } from '../src/community-links.mjs'
import QRCode from 'qrcode'

test('star prompt is accessible, animated, dependency-free, and honest about its action', () => {
  const script = createStarPromptSurfaceScript()
  assert.equal(STAR_PROMPT_VERSION, '3.5.0')
  assert.match(script, /3\.5\.0 · 社区支持/u)
  assert.match(STAR_PROMPT_CSS, /dsh-star-prompt-burst/u)
  assert.match(STAR_PROMPT_CSS, /dsh-star-prompt-orbit/u)
  assert.match(STAR_PROMPT_CSS, /cubic-bezier\(0\.22, 1, 0\.36, 1\)/u)
  assert.match(STAR_PROMPT_CSS, /prefers-reduced-motion: reduce/u)
  assert.match(STAR_PROMPT_CSS, /backdrop-filter: blur\(7px\)/u)
  assert.match(script, /role', 'dialog'/u)
  assert.match(script, /aria-modal', 'true'/u)
  assert.match(script, /claimStarPrompt/u)
  assert.match(script, /helpAction\?\.\('project'\)/u)
  assert.match(script, /helpAction\?\.\('community'\)/u)
  assert.match(script, /去 GitHub 点个 Star/u)
  assert.match(script, /加入社群，随时反馈 Bug/u)
  assert.match(script, /仓库恢复公开后，原有 Star 未能保留/u)
  assert.doesNotMatch(script, /api\.github\.com|stargazers_count|fetch\(/u)
  assert.match(script, /helpAction\?\.\('sponsor'\)/u)
  assert.match(script, /先继续使用/u)
  assert.match(script, /不赞助也没关系/u)
  assert.match(script, /\[close, sponsorButton, sponsorLink, primary, community, secondary\]/u)
  assert.equal(AFDIAN_SPONSOR_URL, 'https://afdian.com/a/ningbai')
})

test('sponsor QR encodes the exact author URL offline and rejects remote QR inputs', async () => {
  const expected = await QRCode.toDataURL('https://afdian.com/a/ningbai', { width: 288, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#10131aff', light: '#ffffffff' } })
  assert.equal(await renderSponsorQr(), expected)
  assert.match(createStarPromptSurfaceScript({ sponsorQrDataUrl: expected }), /data:image\/png;base64,/u)
  assert.doesNotMatch(createStarPromptSurfaceScript({ sponsorQrDataUrl: 'https://untrusted.invalid/qr.png' }), /untrusted\.invalid/u)
})

test('star prompt claims only version 3.5.0 once, including concurrent calls', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-star-prompt-'))
  const path = join(directory, 'state.json')
  try {
    const store = new StarPromptStore({ path })
    assert.equal(await store.claim('3.1.0'), false)
    assert.equal(await store.claim('3.2.0'), false)
    assert.equal(await store.claim('3.4.0'), false)
    assert.deepEqual(await Promise.all([store.claim('3.5.0'), store.claim('3.5.0')]), [true, false])
    assert.equal(await store.claim('3.5.0'), false)
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
      schemaVersion: 1,
      shownVersions: ['3.5.0'],
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('star prompt shows once after upgrading a profile that already saw 3.4.0', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-star-prompt-upgrade-'))
  const path = join(directory, 'state.json')
  try {
    await writeFile(path, JSON.stringify({ schemaVersion: 1, shownVersions: ['3.4.0'] }), 'utf8')
    assert.equal(await new StarPromptStore({ path }).claim('3.5.0'), true)
    assert.equal(await new StarPromptStore({ path }).claim('3.5.0'), false)
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')).shownVersions, ['3.4.0', '3.5.0'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('star prompt recovers a corrupt state file without showing future versions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-star-prompt-corrupt-'))
  const path = join(directory, 'state.json')
  try {
    await writeFile(path, '{broken', 'utf8')
    const store = new StarPromptStore({ path })
    assert.equal(await store.claim('3.6.0'), false)
    assert.equal(await store.claim('3.5.0'), true)
    assert.equal(await store.claim('3.5.0'), false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('star prompt surface injects CSS before script and follows navigation', async () => {
  const calls = []
  const listeners = new Map()
  const webContents = {
    isDestroyed: () => false,
    insertCSS: async (css, options) => calls.push(['css', css, options]),
    executeJavaScript: async (script, userGesture) => {
      calls.push(['script', script, userGesture])
      return true
    },
    on: (name, listener) => listeners.set(name, listener),
    removeListener: (name, listener) => {
      if (listeners.get(name) === listener) listeners.delete(name)
    },
  }
  assert.equal(await applyStarPromptSurface({ webContents, forceVisible: true, showDelayMs: 0 }), true)
  assert.deepEqual(calls.map((entry) => entry[0]), ['css', 'script'])
  assert.deepEqual(calls[0][2], { cssOrigin: 'author' })
  assert.match(calls[1][1], /"forceVisible":true/u)
  assert.equal(calls[1][2], true)

  const dispose = installStarPromptSurface({ browserWindow: { webContents } })
  assert.equal(typeof listeners.get('did-finish-load'), 'function')
  dispose()
  assert.equal(listeners.has('did-finish-load'), false)
})
