/**
 * Send interception: text-only models reject image blocks at submit, so a
 * send that carries draft images is rewritten into a plain-text prompt that
 * carries describe-image references instead. The images are uploaded through
 * the host attach route (so bytes stay out of the conversation log), the
 * draft images are released, and the model analyzes them through the
 * describe_image tool rather than receiving the bytes it cannot read.
 *
 * The hook wraps the conversation service's sendSession method in place. It
 * is structural (no dependency on the conversation package's internal
 * types) and idempotent (a module marker guards against double install).
 * @module @linxin666/dsh-tool-describe-image/client/send-hook
 */

import { readFileAsBase64, uploadImageForDescribe } from './attach.ts'

/** One browser-owned attachment from the current or legacy conversation service. */
interface DraftAttachmentFace {
  readonly id: string
  readonly file: File
  readonly kind?: 'image' | 'file'
}

/** Current admission result; legacy shells complete with no return value. */
interface SubmitOutcome { readonly kind: 'success' | 'error'; readonly text?: string }

/** The conversation-service surface this hook wraps. */
interface ConversationSendFace {
  sendSession(session: unknown, text: string, attachmentIds: readonly string[], mode: string, signal?: AbortSignal): Promise<SubmitOutcome | void>
  resolveDraftAttachments?(ids: readonly string[]): readonly DraftAttachmentFace[]
  releaseDraftAttachment?(id: string): void
  draftImages?(ids: readonly string[]): readonly DraftAttachmentFace[]
  releaseDraftImage?(id: string): void
}

/** Installed-marker key on the wrapped service instance. */
const HOOK_MARKER = '__dshDescribeImageSendHooked'

/**
 * Wrap the conversation service so image-bearing sends route through the
 * describe-image attach seam. No-op when the service surface is unavailable
 * (older shell) or already wrapped.
 * @param conversation - the `conversation` service instance.
 * @param isEnabled - live interception switch, read on every send.
 * @param acceptsImages - live session capability check; native vision keeps raw images.
 */
export function installSendHook(
  conversation: unknown,
  isEnabled?: () => boolean,
  acceptsImages?: (session: unknown, signal?: AbortSignal) => boolean | Promise<boolean>,
): void {
  const face = conversation as ConversationSendFace
  if (face === null || typeof face !== 'object') return
  if (typeof face.sendSession !== 'function') return
  const current = typeof face.resolveDraftAttachments === 'function' && typeof face.releaseDraftAttachment === 'function'
  const resolve = current ? face.resolveDraftAttachments : face.draftImages
  const release = current ? face.releaseDraftAttachment : face.releaseDraftImage
  if (typeof resolve !== 'function' || typeof release !== 'function') return
  if ((face as unknown as Record<string, unknown>)[HOOK_MARKER] === true) return

  const original = face.sendSession
  face.sendSession = async (session, text, attachmentIds, mode, signal): Promise<SubmitOutcome | void> => {
    if (isEnabled?.() === false || attachmentIds.length === 0) {
      return original.call(face, session, text, attachmentIds, mode, signal)
    }
    signal?.throwIfAborted()
    const attachments = resolve.call(face, attachmentIds)
    if (attachments.length !== attachmentIds.length) {
      return original.call(face, session, text, attachmentIds, mode, signal)
    }
    const images = attachments.filter(attachment => current ? attachment.kind === 'image' : attachment.kind !== 'file')
    if (images.length === 0) return original.call(face, session, text, attachmentIds, mode, signal)
    if (acceptsImages !== undefined) {
      let native = false
      try {
        native = await acceptsImages(session, signal)
      } catch {
        // Keep the text-model attachment path when capability discovery fails.
      }
      signal?.throwIfAborted()
      if (native) return original.call(face, session, text, attachmentIds, mode, signal)
    }
    const refs: string[] = []
    for (const attachment of images) {
      signal?.throwIfAborted()
      const read = await readFileAsBase64(attachment.file)
      signal?.throwIfAborted()
      if (!read.ok) break
      const upload = await uploadImageForDescribe(read.base64, attachment.file.type, attachment.file.name)
      signal?.throwIfAborted()
      if (!upload.ok) break
      refs.push(upload.markdown)
    }
    if (refs.length !== images.length) {
      // Upload fell short: keep the shell's original behavior (which will
      // reject the image block for a text-only model).
      return original.call(face, session, text, attachmentIds, mode, signal)
    }
    const fullText = [text.trim(), ...refs].filter(part => part !== '').join('\n')
    const imageIds = new Set(images.map(attachment => attachment.id))
    const retainedIds = attachmentIds.filter(id => !imageIds.has(id))
    // Keep the shell's admission, cancellation, optimistic echo and failure
    // handling. Generic files still use its existing upload receipts.
    const outcome = await original.call(face, session, fullText, retainedIds, mode, signal)
    if (outcome === undefined || outcome.kind === 'success') {
      for (const attachment of images) release.call(face, attachment.id)
    }
    return outcome
  }
  ;(face as unknown as Record<string, unknown>)[HOOK_MARKER] = true
}

/** Probe the live Host selection, including a model switch before its first request. */
export async function sessionAcceptsImages(session: unknown, signal?: AbortSignal): Promise<boolean> {
  const sessionId = (session as { sessionId?: unknown } | null)?.sessionId
  if (typeof sessionId !== 'string' || sessionId === '') return false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1800)
  try {
    const response = await fetch(`/describe-image/capability?session=${encodeURIComponent(sessionId)}`, {
      signal: signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal]),
    })
    if (!response.ok) return false
    const envelope = await response.json() as { ok?: unknown; value?: { acceptsImages?: unknown } } | null
    return envelope?.ok === true && envelope.value?.acceptsImages === true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
