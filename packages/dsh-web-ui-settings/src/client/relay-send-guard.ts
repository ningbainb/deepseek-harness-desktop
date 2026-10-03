import type { SessionFace } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ModelSelection, ModelSelectionProjection } from '@deepseek-ai/dsh-api-session-controller/types'
import type { ConversationController } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { RELAY_PROVIDER_ID, RELAY_STATUS_PATH, type RelayStatusResponse } from '../relay-protocol.ts'
import { postRelay } from './relay-client.ts'

export const RELAY_SIGN_IN_REQUIRED_EVENT = 'dsh-relay-sign-in-required'

type ConversationSender = Pick<ConversationController, 'sendSession'>

function selectionOf(session: SessionFace) {
  return (session.projections.faceOf('modelSelection').getSnapshot() as ModelSelectionProjection | undefined)?.next
}

export function installRelaySendGuard(
  service: unknown,
  doc: Document,
  notSignedIn: () => string,
  readStatus: () => Promise<RelayStatusResponse> = () => postRelay<RelayStatusResponse>(RELAY_STATUS_PATH),
  readSelection: (session: SessionFace) => ModelSelection | null | undefined | Promise<ModelSelection | null | undefined> = selectionOf,
): () => void {
  if (service === null || typeof service !== 'object' || !('sendSession' in service) || typeof service.sendSession !== 'function') return () => {}
  const conversation = service as ConversationSender
  const original = conversation.sendSession
  let active = true
  const guarded: ConversationSender['sendSession'] = async function (this: ConversationSender, session, text, attachmentIds, mode, signal) {
    signal?.throwIfAborted()
    let selection: ModelSelection | null | undefined
    if (active) {
      try { selection = await readSelection(session) } catch {}
    }
    signal?.throwIfAborted()
    if (active && selection?.provider === RELAY_PROVIDER_ID) {
      let status: RelayStatusResponse | undefined
      try { status = await readStatus() } catch {}
      try { selection = await readSelection(session) } catch { selection = undefined }
      signal?.throwIfAborted()
      if (active && status && selection?.provider === RELAY_PROVIDER_ID && (!status.configured || status.sync?.error === 'relay-auth')) {
        doc.dispatchEvent(new Event(RELAY_SIGN_IN_REQUIRED_EVENT))
        return { kind: 'error', text: notSignedIn() }
      }
    }
    return original.call(this, session, text, attachmentIds, mode, signal)
  }
  conversation.sendSession = guarded
  return () => {
    active = false
    if (conversation.sendSession === guarded) conversation.sendSession = original
  }
}
