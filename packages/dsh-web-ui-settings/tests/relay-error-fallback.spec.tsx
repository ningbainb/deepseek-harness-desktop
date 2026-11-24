/** @vitest-environment jsdom */
import type { ISessions, SessionBinding, SessionEventSource } from '@deepseek-ai/dsh-api-session-controller/client'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { relayZh, type RelayLocaleKey } from '../src/client/locales.ts'
import { classifyFallbackError, installRelayErrorFallback } from '../src/client/relay-error-fallback.tsx'
import { RELAY_SIGN_IN_REQUIRED_EVENT } from '../src/client/relay-send-guard.ts'
import type { RelayStatusResponse } from '../src/relay-protocol.ts'

const translate = (key: RelayLocaleKey) => relayZh[key]
const disposers: Array<() => void> = []

afterEach(() => {
  act(() => { disposers.splice(0).forEach(dispose => dispose()) })
  cleanup()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function setupSessions(provider = 'deepseek-official') {
  const entries: unknown[] = [{ type: 'event', event: { seq: 0, type: 'request/context', data: { provider, model: 'deepseek-chat' } } }]
  let listener: (() => void) | undefined
  const binding = {
    sessionId: 'session-1',
    eventSource: {
      getSnapshot: () => ({ entries }),
      subscribe: (next: () => void) => {
        listener = next
        return () => { listener = undefined }
      },
    } as unknown as SessionEventSource,
  } as unknown as SessionBinding
  const sessions = {
    list: { getSnapshot: () => ({ byId: { 'session-1': { id: 'session-1' } } }), subscribe: () => () => {} },
    binding: () => binding,
  } as unknown as ISessions
  const select = vi.fn(async () => ({ ok: true }))
  const modelDirectories = { directoryFor: () => ({ select }) }
  return {
    sessions,
    modelDirectories,
    select,
    emitError(seq: number, error: { code?: string; status?: number; message?: string }) {
      entries.push({ type: 'event', event: { seq, type: 'turn/end', data: { turn: seq, reason: { kind: 'error', error } } } })
      act(() => { listener?.() })
    },
  }
}

describe('relay error fallback', () => {
  it('classifies rate limit, quota, and timeout errors accurately', () => {
    expect(classifyFallbackError({ status: 429 })).toBe('rate-limit')
    expect(classifyFallbackError({ code: 'RATE_LIMIT' })).toBe('rate-limit')
    expect(classifyFallbackError({ status: 402 })).toBe('quota')
    expect(classifyFallbackError({ message: 'Insufficient balance in account' })).toBe('quota')
    expect(classifyFallbackError({ code: 'TIMEOUT' })).toBe('timeout')
    expect(classifyFallbackError({ status: 503 })).toBe('timeout')
    expect(classifyFallbackError({ code: 'AUTH', status: 401 })).toBeNull()
  })

  it('ignores non-matching or historical errors before mount', () => {
    const setup = setupSessions('deepseek-official')
    const entries = (setup.sessions.binding('session-1' as never) as SessionBinding).eventSource.getSnapshot().entries as unknown[]
    entries.push({ type: 'event', event: { seq: 1, type: 'turn/end', data: { turn: 1, reason: { kind: 'error', error: { status: 429 } } } } })
    act(() => {
      disposers.push(installRelayErrorFallback(setup.sessions, setup.modelDirectories, document, translate))
    })
    expect(document.querySelector('[data-dsh-relay-fallback]')).toBeNull()
    setup.emitError(2, { code: 'AUTH', status: 401 })
    expect(document.querySelector('[data-dsh-relay-fallback]')).toBeNull()
  })

  it('switches directly to bai when already configured and hides on dismiss', async () => {
    const setup = setupSessions('deepseek-official')
    const signInEvents = vi.fn()
    document.addEventListener(RELAY_SIGN_IN_REQUIRED_EVENT, signInEvents)
    disposers.push(() => document.removeEventListener(RELAY_SIGN_IN_REQUIRED_EVENT, signInEvents))

    const readStatus = vi.fn(async (): Promise<RelayStatusResponse> => ({
      ok: true,
      configured: true,
      profileConfigured: true,
      credentialConfigured: true,
      writable: true,
      modelCount: 1,
      models: [{ id: 'deepseek-flash', name: 'DeepSeek Flash' }],
    }))
    act(() => {
      disposers.push(installRelayErrorFallback(setup.sessions, setup.modelDirectories, document, translate, readStatus))
    })

    setup.emitError(1, { status: 429 })
    expect(await screen.findByText(translate('fallbackRateLimit'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: translate('fallbackAction') }))
    await waitFor(() => expect(setup.select).toHaveBeenCalledWith({ provider: 'project-relay', model: 'deepseek-flash' }))
    expect(await screen.findByText(translate('fallbackSwitched'))).toBeTruthy()
    expect(signInEvents).not.toHaveBeenCalled()

    // Dismissing silences subsequent errors in the same session.
    fireEvent.click(screen.getByRole('button', { name: translate('fallbackDismiss') }))
    expect(document.querySelector('[data-dsh-relay-fallback]')).toBeNull()
    setup.emitError(2, { code: 'TIMEOUT' })
    expect(document.querySelector('[data-dsh-relay-fallback]')).toBeNull()
  })

  it('dispatches sign-in prompt when unconfigured and ignores project-relay errors', async () => {
    const nonRelay = setupSessions('openai-codex')
    const signInEvents = vi.fn()
    document.addEventListener(RELAY_SIGN_IN_REQUIRED_EVENT, signInEvents)
    disposers.push(() => document.removeEventListener(RELAY_SIGN_IN_REQUIRED_EVENT, signInEvents))

    const readStatus = vi.fn(async (): Promise<RelayStatusResponse> => ({
      ok: true, configured: false, profileConfigured: false, credentialConfigured: false, writable: true, modelCount: 0, models: [],
    }))
    act(() => {
      disposers.push(installRelayErrorFallback(nonRelay.sessions, nonRelay.modelDirectories, document, translate, readStatus))
    })

    nonRelay.emitError(1, { message: 'insufficient quota' })
    expect(await screen.findByText(translate('fallbackQuota'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: translate('fallbackAction') }))
    await waitFor(() => expect(signInEvents).toHaveBeenCalledTimes(1))
    expect(document.querySelector('[data-dsh-relay-fallback]')).toBeNull()

    const relay = setupSessions('project-relay')
    act(() => {
      disposers.push(installRelayErrorFallback(relay.sessions, relay.modelDirectories, document, translate, readStatus))
    })
    relay.emitError(1, { status: 429 })
    expect(document.querySelector('[data-dsh-relay-fallback]')).toBeNull()
  })
})
