/** @vitest-environment jsdom */
import type { SessionFace } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConversationController } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { afterEach, expect, it, vi } from 'vitest'
import { installRelaySendGuard, RELAY_SIGN_IN_REQUIRED_EVENT } from '../src/client/relay-send-guard.ts'
import type { RelayStatusResponse } from '../src/relay-protocol.ts'

type Sender = Pick<ConversationController, 'sendSession'>
const status: RelayStatusResponse = { ok: true, configured: false, profileConfigured: false, credentialConfigured: false, writable: true, modelCount: 0, models: [], firstRun: true }
const disposers: Array<() => void> = []
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.restoreAllMocks() })

function fixture(blank = true, provider?: string, defaultProvider?: string) {
  const state = { blank, next: provider ? { provider, model: 'fixture-model' } : null, default: defaultProvider ? { provider: defaultProvider, model: 'default-model' } : null }
  const session = { getSnapshot: () => state, projections: { faceOf: () => ({ getSnapshot: () => state }) } } as unknown as SessionFace
  const original = vi.fn<Sender['sendSession']>(async () => ({ kind: 'success' }))
  const conversation: Sender = { sendSession: original }
  const readStatus = vi.fn(async () => status)
  const required = vi.fn()
  document.addEventListener(RELAY_SIGN_IN_REQUIRED_EVENT, required)
  disposers.push(() => document.removeEventListener(RELAY_SIGN_IN_REQUIRED_EVENT, required))
  const readSelection = vi.fn(async () => state.next ?? state.default)
  const dispose = installRelaySendGuard(conversation, document, () => '暂未登录', readStatus, readSelection)
  disposers.push(dispose)
  const send = (signal?: AbortSignal) => conversation.sendSession(session, 'fixture prompt', [], 'queue', signal)
  return { state, session, original, conversation, readStatus, readSelection, required, dispose, send }
}

it('does not promote bai or probe authorization on an untouched first send without a bai selection', async () => {
  const test = fixture()
  expect(await test.send()).toEqual({ kind: 'success' })
  expect(test.original).toHaveBeenCalledTimes(1)
  expect(test.readStatus).not.toHaveBeenCalled()
  expect(test.required).not.toHaveBeenCalled()
  expect(test.state.blank).toBe(true)
})

it('guides an unauthenticated default bai without explicit session selection and retains attachments', async () => {
  const test = fixture(true, undefined, 'project-relay')
  const attachments = ['retained-file'] as unknown as Parameters<Sender['sendSession']>[2]
  expect(await test.conversation.sendSession(test.session, 'retained draft', attachments, 'queue')).toEqual({ kind: 'error', text: '暂未登录' })
  expect(test.state.next).toBeNull()
  expect(attachments).toEqual(['retained-file'])
  expect(test.original).not.toHaveBeenCalled()
  expect(test.required).toHaveBeenCalledTimes(1)
})

it.each(['official', 'custom-provider'])('does not probe or block default %s without explicit session selection', async provider => {
  const test = fixture(true, undefined, provider)
  expect(await test.send()).toEqual({ kind: 'success' })
  expect(test.readStatus).not.toHaveBeenCalled()
  expect(test.required).not.toHaveBeenCalled()
})

it('passes through an authenticated default bai without explicit session selection', async () => {
  const test = fixture(true, undefined, 'project-relay')
  test.readStatus.mockResolvedValue({ ...status, configured: true })
  expect(await test.send()).toEqual({ kind: 'success' })
  expect(test.original).toHaveBeenCalledTimes(1)
  expect(test.required).not.toHaveBeenCalled()
})

it('preserves sends when the official directory is unavailable', async () => {
  const test = fixture()
  test.readSelection.mockRejectedValue(new Error('directory unavailable'))
  expect(await test.send()).toEqual({ kind: 'success' })
  expect(test.readStatus).not.toHaveBeenCalled()
})

it.each(['official', 'openai-codex', 'custom-provider'])('does not probe or block an explicit %s selection', async provider => {
  const test = fixture(true, provider)
  expect(await test.send()).toEqual({ kind: 'success' })
  expect(test.original).toHaveBeenCalledTimes(1)
  expect(test.readStatus).not.toHaveBeenCalled()
  expect(test.required).not.toHaveBeenCalled()
})

it('preserves an existing conversation without an explicit selection', async () => {
  const test = fixture(false)
  await test.send()
  expect(test.original).toHaveBeenCalledTimes(1)
  expect(test.readStatus).not.toHaveBeenCalled()
})

it('preserves existing configured users on blank conversations', async () => {
  const test = fixture()
  test.readStatus.mockResolvedValue({ ...status, firstRun: false })
  await test.send()
  expect(test.original).toHaveBeenCalledTimes(1)
  expect(test.required).not.toHaveBeenCalled()
})

it('preserves this, text, attachments, mode, signal and result for connected bai', async () => {
  const test = fixture(false, 'project-relay')
  test.readStatus.mockResolvedValue({ ...status, configured: true })
  const attachments = ['attachment-fixture'] as unknown as Parameters<Sender['sendSession']>[2]
  const signal = new AbortController().signal
  const outcome = { kind: 'success' as const, text: 'original result' }
  test.original.mockResolvedValue(outcome)
  expect(await test.conversation.sendSession(test.session, 'unchanged text', attachments, 'steer', signal)).toBe(outcome)
  expect(test.original.mock.contexts[0]).toBe(test.conversation)
  expect(test.original).toHaveBeenCalledExactlyOnceWith(test.session, 'unchanged text', attachments, 'steer', signal)
})

it.each([undefined, 'relay-auth'])('guides a selected bai route with missing access (%s)', async error => {
  const test = fixture(false, 'project-relay')
  test.readStatus.mockResolvedValue({ ...status, firstRun: false, sync: { phase: 'failed', error } })
  expect((await test.send()).kind).toBe('error')
  expect(test.required).toHaveBeenCalledTimes(1)
  expect(test.original).not.toHaveBeenCalled()
})

it('does not turn metadata failures into send failures', async () => {
  const test = fixture(false, 'project-relay')
  test.readStatus.mockRejectedValue(new Error('unavailable metadata'))
  await test.send()
  expect(test.original).toHaveBeenCalledTimes(1)
  expect(test.required).not.toHaveBeenCalled()
})

it('respects a model switch while checking access', async () => {
  const test = fixture(true, undefined, 'project-relay')
  test.readStatus.mockImplementation(async () => { test.state.next = { provider: 'custom-provider', model: 'changed' }; return status })
  await test.send()
  expect(test.original).toHaveBeenCalledTimes(1)
  expect(test.required).not.toHaveBeenCalled()
})

it('does not open login for an already cancelled send', async () => {
  const test = fixture()
  const controller = new AbortController()
  controller.abort()
  await expect(test.send(controller.signal)).rejects.toThrow()
  expect(test.readStatus).not.toHaveBeenCalled()
  expect(test.required).not.toHaveBeenCalled()
  expect(test.original).not.toHaveBeenCalled()
})

it('does not open login if cancelled during the status request', async () => {
  const test = fixture(false, 'project-relay')
  const controller = new AbortController()
  test.readStatus.mockImplementation(async () => { controller.abort(); return status })
  await expect(test.send(controller.signal)).rejects.toThrow()
  expect(test.required).not.toHaveBeenCalled()
  expect(test.original).not.toHaveBeenCalled()
})

it('unloads while awaiting metadata without capturing another plugin hook', async () => {
  const test = fixture(false, 'project-relay')
  const guarded = test.conversation.sendSession
  const later = vi.fn<Sender['sendSession']>(function (this: Sender, ...args) { return guarded.apply(this, args) })
  test.conversation.sendSession = later
  test.readStatus.mockImplementation(async () => { test.dispose(); return status })
  await test.send()
  expect(test.conversation.sendSession).toBe(later)
  expect(test.original).toHaveBeenCalledTimes(1)
  expect(test.required).not.toHaveBeenCalled()
  await test.send()
  expect(test.readStatus).toHaveBeenCalledTimes(1)
  expect(test.original).toHaveBeenCalledTimes(2)
})

it('restores the original hook when still the current owner', () => {
  const test = fixture()
  test.dispose()
  expect(test.conversation.sendSession).toBe(test.original)
})
