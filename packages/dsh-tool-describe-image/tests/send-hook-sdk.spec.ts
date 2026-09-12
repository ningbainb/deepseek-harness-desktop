/** Exercise the installed official NPM ConversationController, including its real draft registry and admission path. */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { webcrypto } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { Context } from '@deepseek-ai/cordis'
import type { ConversationController } from '../src/client/index.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installSendHook } from '../src/client/send-hook.ts'

const require = createRequire(import.meta.url)

class TestFileReader {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  result = ''
  readAsDataURL(): void {
    this.result = 'data:image/png;base64,QUJD'
    queueMicrotask(() => this.onload?.())
  }
}

function loadController(): typeof ConversationController {
  let factory: ((require: (id: string) => unknown) => { ConversationController: typeof ConversationController }) | undefined
  runInNewContext(readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-conversation/client'), 'utf8'), {
    window: { __ModuleLoader__: { load: (entry: { factory: typeof factory }) => { factory = entry.factory } } },
    URL, setTimeout, clearTimeout, crypto: webcrypto, FileReader: TestFileReader, AbortController,
  })
  if (factory === undefined) throw new Error('published SDK did not register its client factory')
  return factory(id => {
    // Rendering is outside this test; the controller, registry, Cordis and
    // snapshot store all run from the actual installed SDK.
    if (id === '@deepseek-ai/dsh-client-ui-primitives' || id === 'react-dom') return {}
    return require(id)
  }).ConversationController
}

afterEach(() => vi.unstubAllGlobals())

describe('published SDK image admission', () => {
  async function setup(native: boolean, accepted: boolean, withFile = false) {
    vi.stubGlobal('FileReader', TestFileReader)
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, value: { note: 'N', markdown: '![图片](/describe-image/raw/sha256:x)' } })))
    vi.stubGlobal('fetch', fetch)
    const Constructor = loadController()
    const ctx = new Context()
    const upload = vi.fn(async () => ({ ok: true, value: { receiptId: 'receipt', file: { attachmentId: 'file-ref', bytes: 4, name: 'notes.txt' } } }))
    ctx.provide('fileUpload', { upload })
    const controller = new Constructor(ctx, { input: {} as never, blocks: {} as never, maxConcurrentFileUploads: 1 })
    const drafts = controller.createDrafts('session' as never, [
      new File(['ABC'], 'x.png', { type: 'image/png' }),
      ...withFile ? [new File(['text'], 'notes.txt', { type: 'text/plain' })] : [],
    ])
    if (withFile) await vi.waitFor(() => expect(Object.values(controller.fileUploads.getSnapshot())).toMatchObject([{ status: 'ready' }]))
    const ids = drafts.map(draft => draft.id)
    let retire: ((settlement: { reason: string; attachments: unknown[] }) => void) | undefined
    const beginSubmission = vi.fn((options: { onRetire: typeof retire }) => {
      retire = options.onRetire
      return { requestId: 'request', abandon: vi.fn() }
    })
    const prompt = vi.fn(async () => {
      if (accepted) retire?.({ reason: 'observed', attachments: [] })
      return { ok: accepted }
    })
    const session = { sessionId: 'session', getSnapshot: () => ({ subagent: null }), beginSubmission, prompt }
    installSendHook(ctx.get('conversation'), () => true, () => native)
    const signal = new AbortController().signal
    const outcome = await controller.sendSession(session as never, 'look', ids, 'queue', signal)
    return { ctx, controller, ids, fetch, prompt, beginSubmission, signal, outcome, upload }
  }

  it('rewrites through the actual SDK admission and releases only after success', async () => {
    const result = await setup(false, true)
    expect(result.outcome).toEqual({ kind: 'success' })
    expect(result.fetch).toHaveBeenCalledTimes(1)
    expect(result.beginSubmission).toHaveBeenCalledWith(expect.objectContaining({ text: 'look\n![图片](/describe-image/raw/sha256:x)', attachments: [] }))
    expect(result.prompt).toHaveBeenCalledExactlyOnceWith([{ type: 'text', text: 'look\n![图片](/describe-image/raw/sha256:x)' }], 'queue', result.signal, 'request')
    expect(result.controller.resolveDraftAttachments(result.ids)).toEqual([])
    await result.ctx.fiber.dispose()
  })

  it('keeps the actual SDK draft registry intact on Host rejection', async () => {
    const result = await setup(false, false)
    expect(result.outcome).toEqual({ kind: 'error' })
    expect(result.controller.resolveDraftAttachments(result.ids)).toHaveLength(1)
    await result.ctx.fiber.dispose()
  })

  it('delivers native image blocks through the SDK without a describe-image upload', async () => {
    const result = await setup(true, true)
    expect(result.outcome).toEqual({ kind: 'success' })
    expect(result.fetch).not.toHaveBeenCalled()
    expect(result.prompt).toHaveBeenCalledExactlyOnceWith([
      { type: 'image', mediaType: 'image/png', data: 'QUJD', name: 'x.png' },
      { type: 'text', text: 'look' },
    ], 'queue', result.signal, 'request')
    expect(result.controller.resolveDraftAttachments(result.ids)).toEqual([])
    await result.ctx.fiber.dispose()
  })

  it('preserves the real SDK file-upload receipt beside a converted image', async () => {
    const result = await setup(false, true, true)
    expect(result.outcome).toEqual({ kind: 'success' })
    expect(result.upload).toHaveBeenCalledTimes(1)
    expect(result.fetch).toHaveBeenCalledTimes(1)
    expect(result.prompt).toHaveBeenCalledExactlyOnceWith([
      { type: 'file', receiptId: 'receipt' },
      { type: 'text', text: 'look\n![图片](/describe-image/raw/sha256:x)' },
    ], 'queue', result.signal, 'request')
    expect(result.controller.resolveDraftAttachments(result.ids)).toEqual([])
    expect(result.controller.fileUploads.getSnapshot()).toEqual({})
    await result.ctx.fiber.dispose()
  })
})
