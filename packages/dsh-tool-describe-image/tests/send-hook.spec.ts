/**
 * Send-interception tests: the hook rewrites image-bearing sends into
 * describe-image reference text, falls back to the original send when the
 * upload cannot complete, and stays idempotent. FileReader is stubbed; fetch
 * is stubbed for the attach route.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { installSendHook, sessionAcceptsImages } from '../src/client/send-hook.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Minimal FileReader stub: resolves every read to a fixed base64 payload. */
function stubFileReader(payload: string): void {
  vi.stubGlobal('FileReader', class {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    result: string | null = null
    readAsDataURL(_file: File): void {
      this.result = `data:image/png;base64,${payload}`
      queueMicrotask(() => this.onload?.())
    }
  })
}

/** One fake conversation surface recording what the hook did with it. */
function makeConversation() {
  const original = vi.fn(async (session: unknown, text: string, ids: readonly string[], mode: string) => {
    log.push('original')
    if (ids.length === 0) await (session as { prompt(content: unknown, mode: string): Promise<unknown> }).prompt([{ type: 'text', text }], mode)
  })
  const log: string[] = []
  const face = {
    send: vi.fn(async () => { log.push('send') }),
    sendSession: original,
    draftImages: vi.fn((ids: readonly string[]) => ids.map(id => ({

      id,

      file: new File([new Uint8Array(3)], 'x.png', { type: 'image/png' }),

    }))),
    releaseDraftImage: vi.fn(() => { log.push('release') }),
  }
  return { face, log }
}

describe('installSendHook', () => {
  it('delegates image-free sends to the original method', async () => {
    const { face, log } = makeConversation()
    installSendHook(face)
    await face.sendSession({ prompt: vi.fn() } as never, 'hello', [], 'queue')
    expect(log).toEqual(['original'])
  })

  it('rewrites an image-bearing send into a text prompt carrying the reference', async () => {
    stubFileReader('QUJD')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, value: { note: 'N', markdown: '![图片](/describe-image/raw/sha256:x)' } }), { status: 200 })))
    const { face, log } = makeConversation()
    const prompt = vi.fn(async () => ({ ok: true }))
    installSendHook(face)
    await face.sendSession({ prompt } as never, 'look', ['id1'], 'queue')
    expect(log).toEqual(['original', 'release'])
    expect(prompt).toHaveBeenCalledTimes(1)
    const blocks = (prompt.mock.calls[0] as unknown as [{ type: string; text: string }[]])[0]
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('text')
    expect(blocks[0].text).toContain('look')
    expect(blocks[0].text).toContain('![图片](/describe-image/raw/sha256:x)')
  })

  it('falls back to the original send when the upload fails', async () => {
    stubFileReader('QUJD')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { message: 'boom' } }), { status: 422 })))
    const { face, log } = makeConversation()
    installSendHook(face)
    await face.sendSession({ prompt: vi.fn() } as never, 'look', ['id1'], 'queue')
    expect(log).toEqual(['original'])
  })

  it('falls back when a draft image id no longer resolves', async () => {
    const { face, log } = makeConversation()
    face.draftImages = vi.fn(() => [])
    installSendHook(face)
    await face.sendSession({ prompt: vi.fn() } as never, 'look', ['gone'], 'queue')
    expect(log).toEqual(['original'])
  })

  it('is idempotent across repeated installs', async () => {
    stubFileReader('QUJD')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, value: { note: 'N', markdown: 'R' } }), { status: 200 })))
    const { face } = makeConversation()
    const prompt = vi.fn(async () => ({ ok: true }))
    installSendHook(face)
    installSendHook(face)
    await face.sendSession({ prompt } as never, 'look', ['id1'], 'queue')
    expect(prompt).toHaveBeenCalledTimes(1)
  })
})

function modernConversation(outcome: { kind: 'success' | 'error'; text?: string } = { kind: 'success' }) {
  const sendSession = vi.fn(async (_session: unknown, _text: string, _ids: readonly string[], _mode: string, _signal?: AbortSignal) => outcome)
  const face = {
    sendSession,
    resolveDraftAttachments: vi.fn((ids: readonly string[]) => ids.map(id => ({
      id, kind: id.startsWith('file') ? 'file' as const : 'image' as const,
      file: new File(['image'], `${id}.png`, { type: 'image/png' }),
    }))),
    releaseDraftAttachment: vi.fn(),
  }
  return { face, original: sendSession, outcome }
}

function stubUpload() {
  stubFileReader('QUJD')
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, value: { note: 'N', markdown: '![图片](/describe-image/raw/sha256:x)' } })))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('current Desktop attachment protocol', () => {
  it('retains generic files, mode, signal and the exact shell outcome while rewriting only images', async () => {
    const fetch = stubUpload()
    const { face, original, outcome } = modernConversation()
    const session = { sessionId: 'one' }
    const signal = new AbortController().signal
    installSendHook(face, () => true, () => false)
    const result = await face.sendSession(session, 'look', ['file1', 'image1', 'file2'], 'steer', signal)
    expect(result).toBe(outcome)
    expect(original).toHaveBeenCalledExactlyOnceWith(session, 'look\n![图片](/describe-image/raw/sha256:x)', ['file1', 'file2'], 'steer', signal)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(face.releaseDraftAttachment).toHaveBeenCalledExactlyOnceWith('image1')
  })

  it('reads the interception switch live and does not upload while disabled', async () => {
    const fetch = stubUpload()
    const { face, original } = modernConversation()
    let enabled = false
    const capability = vi.fn(() => false)
    installSendHook(face, () => enabled, capability)
    await face.sendSession({}, 'look', ['image1'], 'queue')
    expect(fetch).not.toHaveBeenCalled()
    expect(capability).not.toHaveBeenCalled()
    expect(original.mock.calls[0]?.slice(1, 4)).toEqual(['look', ['image1'], 'queue'])
    enabled = true
    await face.sendSession({}, 'look', ['image1'], 'queue')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps native vision bytes intact and rechecks after switching models', async () => {
    const fetch = stubUpload()
    const { face, original } = modernConversation()
    let native = true
    installSendHook(face, () => true, () => native)
    await face.sendSession({}, 'look', ['image1'], 'queue')
    expect(original.mock.calls[0]?.slice(1, 4)).toEqual(['look', ['image1'], 'queue'])
    expect(fetch).not.toHaveBeenCalled()
    expect(face.releaseDraftAttachment).not.toHaveBeenCalled()
    native = false
    await face.sendSession({}, 'look', ['image1'], 'queue')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not probe or rewrite a file-only send', async () => {
    const fetch = stubUpload()
    const { face, original } = modernConversation()
    const capability = vi.fn(() => false)
    installSendHook(face, () => true, capability)
    await face.sendSession({}, 'read', ['file1'], 'queue')
    expect(original.mock.calls[0]?.slice(1, 4)).toEqual(['read', ['file1'], 'queue'])
    expect(capability).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves image drafts and the error outcome when Host rejects the rewritten send', async () => {
    stubUpload()
    const { face, outcome } = modernConversation({ kind: 'error', text: 'admission failed' })
    installSendHook(face)
    expect(await face.sendSession({}, 'look', ['image1'], 'queue')).toBe(outcome)
    expect(face.releaseDraftAttachment).not.toHaveBeenCalled()
  })

  it('preserves image drafts when the shell throws', async () => {
    stubUpload()
    const { face, original } = modernConversation()
    original.mockRejectedValueOnce(new Error('disconnected'))
    installSendHook(face)
    await expect(face.sendSession({}, 'look', ['image1'], 'queue')).rejects.toThrow('disconnected')
    expect(face.releaseDraftAttachment).not.toHaveBeenCalled()
  })

  it('keeps the text-model path when capability discovery fails', async () => {
    const fetch = stubUpload()
    const { face } = modernConversation()
    installSendHook(face, () => true, async () => { throw new Error('offline') })
    await face.sendSession({}, 'look', ['image1'], 'queue')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(face.releaseDraftAttachment).toHaveBeenCalledExactlyOnceWith('image1')
  })

  it('does not submit or release drafts when cancellation arrives during upload', async () => {
    stubFileReader('QUJD')
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async () => {
      controller.abort()
      return new Response(JSON.stringify({ ok: true, value: { note: 'N', markdown: 'R' } }))
    }))
    const { face, original } = modernConversation()
    installSendHook(face)
    await expect(face.sendSession({}, 'look', ['image1'], 'queue', controller.signal)).rejects.toThrow()
    expect(original).not.toHaveBeenCalled()
    expect(face.releaseDraftAttachment).not.toHaveBeenCalled()
  })
})

describe('session image capability client', () => {
  it('accepts only an explicit successful Host verdict and encodes the session id', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, value: { acceptsImages: true } })))
    vi.stubGlobal('fetch', fetch)
    expect(await sessionAcceptsImages({ sessionId: 'a/b?c' })).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/describe-image/capability?session=a%2Fb%3Fc', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('keeps the legacy fallback for missing ids, malformed envelopes or network failures', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, value: { acceptsImages: 'true' } })))
    vi.stubGlobal('fetch', fetch)
    expect(await sessionAcceptsImages({})).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect(await sessionAcceptsImages({ sessionId: 'one' })).toBe(false)
    fetch.mockRejectedValueOnce(new Error('offline'))
    expect(await sessionAcceptsImages({ sessionId: 'one' })).toBe(false)
  })
})
