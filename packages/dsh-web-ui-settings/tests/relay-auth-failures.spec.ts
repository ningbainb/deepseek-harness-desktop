/** @vitest-environment jsdom */
import type { ISessions, SessionBinding, SessionEventSource } from '@deepseek-ai/dsh-api-session-controller/client'
import { afterEach, expect, it, vi } from 'vitest'
import { installRelayAuthFailures, watchRelayAuthFailures } from '../src/client/relay-auth-failures.ts'
import { RELAY_SIGN_IN_REQUIRED_EVENT } from '../src/client/relay-send-guard.ts'

const disposers: Array<() => void> = []
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()) })

function fixture(provider = 'project-relay', historicAuth = false) {
  const entries: unknown[] = [{ type: 'event', event: { seq: 0, type: 'request/context', data: { provider, model: 'deepseek-flash' } } }]
  const failure = (seq: number, code = 'AUTH', status?: number) => ({ type: 'event', event: { seq, type: 'turn/end', data: { turn: seq, reason: { kind: 'error', error: { code, status, message: 'private server details' } } } } })
  if (historicAuth) entries.push(failure(1))
  let changed = () => {}
  const unsubscribe = vi.fn()
  const source = { getSnapshot: () => ({ entries }), subscribe: (listener: () => void) => { changed = listener; return unsubscribe } } as unknown as SessionEventSource
  const required = vi.fn()
  document.addEventListener(RELAY_SIGN_IN_REQUIRED_EVENT, required)
  disposers.push(() => document.removeEventListener(RELAY_SIGN_IN_REQUIRED_EVENT, required))
  disposers.push(watchRelayAuthFailures(source, document))
  return { entries, failure, changed: () => changed(), required, unsubscribe }
}

it('opens bai reauthorization for a newly returned AUTH and exposes no server message', () => {
  const test = fixture()
  test.entries.push(test.failure(1))
  test.changed()
  test.changed()
  expect(test.required).toHaveBeenCalledTimes(1)
  expect((test.required.mock.calls[0]![0] as CustomEvent).detail).toEqual({ reason: 'relay-auth' })
})

it('does not replay historical authentication failures on startup or history replacement', () => {
  const test = fixture('project-relay', true)
  test.changed()
  expect(test.required).not.toHaveBeenCalled()
  test.entries.push(test.failure(2))
  test.changed()
  expect(test.required).toHaveBeenCalledTimes(1)
})

it.each(['deepseek-official', 'custom-provider'])('does not promote bai on %s authentication failure', provider => {
  const test = fixture(provider)
  test.entries.push(test.failure(1))
  test.changed()
  expect(test.required).not.toHaveBeenCalled()
})

it.each(['RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'UNKNOWN'])('does not misclassify %s as a login failure', code => {
  const test = fixture()
  test.entries.push(test.failure(1, code))
  test.changed()
  expect(test.required).not.toHaveBeenCalled()
})

it('recognizes HTTP 401 and follows the actual request provider after a model change', () => {
  const test = fixture()
  test.entries.push({ type: 'event', event: { seq: 1, type: 'request/header', data: { header: { config: { provider: 'custom-provider', model: 'other' } } } } }, test.failure(2))
  test.changed()
  expect(test.required).not.toHaveBeenCalled()
  test.entries.push({ type: 'event', event: { seq: 3, type: 'request/context', data: { provider: 'project-relay', model: 'deepseek-flash' } } }, test.failure(4, 'UNKNOWN', 401))
  test.changed()
  expect(test.required).toHaveBeenCalledTimes(1)
})

it('unsubscribes on teardown', () => {
  const test = fixture()
  disposers.splice(0).forEach(dispose => dispose())
  expect(test.unsubscribe).toHaveBeenCalledTimes(1)
})

it('borrows retained bindings, replaces generations and disposes removed sessions without retaining history', () => {
  const required = vi.fn()
  document.addEventListener(RELAY_SIGN_IN_REQUIRED_EVENT, required)
  disposers.push(() => document.removeEventListener(RELAY_SIGN_IN_REQUIRED_EVENT, required))
  const makeBinding = () => {
    const entries: unknown[] = [{ type: 'event', event: { seq: 0, type: 'request/context', data: { provider: 'project-relay' } } }]
    let listener: (() => void) | undefined
    const unsubscribe = vi.fn(() => { listener = undefined })
    const binding = {
      sessionId: 'session-a',
      eventSource: { getSnapshot: () => ({ entries }), subscribe: (next: () => void) => { listener = next; return unsubscribe } },
    } as unknown as SessionBinding
    return { binding, unsubscribe, fail: () => {
      entries.push({ type: 'event', event: { seq: 1, type: 'turn/end', data: { reason: { kind: 'error', error: { code: 'AUTH' } } } } })
      listener?.()
    } }
  }
  const first = makeBinding()
  const second = makeBinding()
  let current: SessionBinding | undefined
  let present = true
  let changed = () => {}
  const unsubscribe = vi.fn()
  const retain = vi.fn()
  const sessions = {
    list: { getSnapshot: () => ({ byId: present ? { 'session-a': { id: 'session-a' } } : {} }), subscribe: (next: () => void) => { changed = next; return unsubscribe } },
    binding: () => current,
    retain,
  } as unknown as ISessions
  const dispose = installRelayAuthFailures(sessions, document)
  disposers.push(dispose)
  first.fail()
  expect(required).not.toHaveBeenCalled()
  current = first.binding
  changed()
  first.fail()
  expect(required).not.toHaveBeenCalled()
  current = second.binding
  changed()
  expect(first.unsubscribe).toHaveBeenCalledOnce()
  second.fail()
  expect(required).toHaveBeenCalledOnce()
  present = false
  changed()
  expect(second.unsubscribe).toHaveBeenCalledOnce()
  second.fail()
  expect(required).toHaveBeenCalledOnce()
  expect(retain).not.toHaveBeenCalled()
  dispose()
  expect(unsubscribe).toHaveBeenCalledOnce()
  disposers.pop()
})

it('unsubscribes active session bindings when the client is unloaded', () => {
  const unsubscribeSource = vi.fn()
  const unsubscribeList = vi.fn()
  const binding = { sessionId: 'session-a', eventSource: { getSnapshot: () => ({ entries: [] }), subscribe: () => unsubscribeSource } } as unknown as SessionBinding
  const sessions = {
    binding: () => binding,
    list: { getSnapshot: () => ({ byId: { 'session-a': { id: 'session-a' } } }), subscribe: () => unsubscribeList },
  } as unknown as ISessions
  installRelayAuthFailures(sessions, document)()
  expect(unsubscribeSource).toHaveBeenCalledOnce()
  expect(unsubscribeList).toHaveBeenCalledOnce()
})
