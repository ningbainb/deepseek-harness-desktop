// @vitest-environment jsdom
/** ChatView: collapsible message folds, toolbar chips, and the bottom sheets. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionModels } from '../../mobile-contract.ts'
import { ChatView, MAX_TAIL_BUFFER_EVENTS } from './ChatView.tsx'
import { type SessionView } from './App.tsx'
import type { HistoryPage } from '../api.ts'
import type { WireEvent } from '../messages.ts'

// The api module is fully mocked; App.tsx's history wrapper is overridden to
// feed fixed history pages, its pure helpers (errorText / formatTime) stay real.
vi.mock('../api.ts', () => ({
  fetchMobilePreferences: vi.fn(),
  models: vi.fn(),
  selectModel: vi.fn(),
  sendCommand: vi.fn(),
}))
vi.mock('./App.tsx', async importOriginal => {
  const actual = await importOriginal<typeof import('./App.tsx')>()
  return {
    ...actual,
    loadHistory: vi.fn(),
    prompt: vi.fn(async () => {}),
  }
})
import { fetchMobilePreferences, models, selectModel, sendCommand } from '../api.ts'
import { loadHistory, prompt } from './App.tsx'

const session: SessionView = {
  sessionId: 's-1',
  title: '测试会话',
  updatedAt: 1_700_000_000_000,
  running: false,
  blank: false,
}

/** Assemble one history entry wrapping a WireEvent (host history-page shape). */
function makeEntry(type: string, data: unknown, seq: number): { event: WireEvent } {
  return { event: { type, seq, time: seq * 1_000, data } }
}

/** Build a history page from loose wire events (the host union is strict). */
function historyPage(events: Array<{ event: WireEvent }>, extra: Record<string, unknown> = {}): HistoryPage {
  return { events: events as never, hasMore: false, ...extra } as HistoryPage
}

/** A full turn: user message, reasoning + text chunks, tool calls, final message. */
function turnEvents(): Array<{ event: WireEvent }> {
  return [
    makeEntry('user/message', { id: 'u-1', role: 'user', content: [{ type: 'text', text: '改一下代码' }] }, 0),
    makeEntry('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'reasoning-delta', index: 0, text: '先看结构' } }, 1),
    makeEntry('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'reasoning-delta', index: 0, text: '\n再看细节' } }, 2),
    makeEntry('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'text-delta', index: 1, text: '正在处理' } }, 3),
    makeEntry('tool/call', { turn: 0, step: 0, callId: 'c1', name: 'bash', arguments: '{"cmd":"ls"}' }, 4),
    makeEntry('assistant/message', {
      turn: 0,
      step: 0,
      message: {
        id: 'a-1',
        role: 'assistant',
        content: [
          { type: 'reasoning', text: '先看结构\n再看细节' },
          { type: 'text', text: '已完成修改' },
        ],
      },
    }, 5),
  ]
}

const fetchMobilePreferencesMock = vi.mocked(fetchMobilePreferences)
const modelsMock = vi.mocked(models)
const selectModelMock = vi.mocked(selectModel)
const sendCommandMock = vi.mocked(sendCommand)
const loadHistoryMock = vi.mocked(loadHistory)
const promptMock = vi.mocked(prompt)

beforeEach(() => {
  fetchMobilePreferencesMock.mockResolvedValue({ mobileEnterToSend: true })
  promptMock.mockResolvedValue(undefined)
  modelsMock.mockResolvedValue({
    current: { provider: 'fx', model: 'fx-1' },
    routable: true,
    groups: [
      {
        id: 'fx',
        name: 'FX',
        models: [
          { id: 'fx-1', name: 'FX 标准' },
          { id: 'fx-2', name: 'FX 深度', reasoning: { efforts: [{ id: 'high', name: '高' }], defaultEffort: 'high' } },
        ],
      },
    ],
    failures: [],
  } satisfies SessionModels)
  selectModelMock.mockResolvedValue({ selected: { provider: 'fx', model: 'fx-2', reasoningEffort: 'high' } })
  sendCommandMock.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('ChatView message folds', () => {
  it('hides reasoning behind a collapsed disclosure and expands on tap', async () => {
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents()))
    render(<ChatView session={session} onBack={() => {}} />)

    // The folded turn renders: user bubble, assistant text, disclosures.
    expect(await screen.findByText('改一下代码')).toBeTruthy()
    expect(await screen.findByText('已完成修改')).toBeTruthy()
    const head = await screen.findByRole('button', { name: /深度思考/ })
    expect(head.getAttribute('aria-expanded')).toBe('false')
    // Only the one-line summary shows while collapsed; the body stays hidden.
    expect(await screen.findByText('先看结构')).toBeTruthy()
    expect(screen.queryByText(/再看细节/)).toBeNull()

    fireEvent.click(head)
    expect(head.getAttribute('aria-expanded')).toBe('true')
    expect(await screen.findByText(/再看细节/)).toBeTruthy()
  })

  it('keeps the tool disclosure collapsed with a summary, then reveals arguments', async () => {
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents()))
    render(<ChatView session={session} onBack={() => {}} />)

    const head = await screen.findByRole('button', { name: /工具/ })
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('{"cmd":"ls"}')).toBeNull()

    fireEvent.click(head)
    expect(head.getAttribute('aria-expanded')).toBe('true')
    expect(await screen.findByText('{"cmd":"ls"}')).toBeTruthy()
    expect(screen.getByText('bash')).toBeTruthy()
  })

  it('shows the permission chip from the history-tail projection and applies via /permission', async () => {
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents(), {
      projections: {
        asOfSeq: 4,
        values: {
          permissions: {
            options: [
              { value: 'read-only', name: '只读' },
              { value: 'workspace-write', name: '读写工作区' },
            ],
            currentValue: 'read-only',
          },  
        } as Record<string, unknown>,
      },
    }))
    render(<ChatView session={session} onBack={() => {}} />)

    const chip = await screen.findByRole('button', { name: /只读/ })
    fireEvent.click(chip)
    // The sheet lists the presets; picking one dispatches the slash command.
    const writeOption = await screen.findByRole('button', { name: /读写工作区/ })
    fireEvent.click(writeOption)
    await waitFor(() => {
      expect(sendCommandMock).toHaveBeenCalledWith('s-1', '/permission workspace-write')
    })
  })

  it('requires an explicit confirm before enabling full access', async () => {
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents(), {
      projections: {
        asOfSeq: 4,
        values: {
          permissions: {
            options: [{ value: 'danger-full-access', name: '完全权限' }],
            currentValue: 'workspace-write',
          },  
        } as Record<string, unknown>,
      },
    }))
    render(<ChatView session={session} onBack={() => {}} />)

    // The chip shows the derived label for the unmatched current value.
    fireEvent.click(await screen.findByRole('button', { name: /Workspace Write/ }))
    // Picking full access opens the confirmation sheet instead of submitting.
    fireEvent.click(await screen.findByRole('button', { name: /完全权限/ }))
    expect(await screen.findByText(/确认完全权限/)).toBeTruthy()
    expect(sendCommandMock).not.toHaveBeenCalled()
    // Cancelling dispatches nothing; opening again and confirming submits.
    fireEvent.click(screen.getByRole('button', { name: /取消/ }))
    fireEvent.click(screen.getByRole('button', { name: /完全权限/ }))
    fireEvent.click(await screen.findByRole('button', { name: /确认开启/ }))
    await waitFor(() => {
      expect(sendCommandMock).toHaveBeenCalledWith('s-1', '/permission danger-full-access')
    })
  })
})

describe('ChatView initial-load race', () => {
  /** Minimal mux stand-in: captures the ChatView's frame listener for hand-off. */
  class FakeMux {
    listeners = new Set<(frame: unknown) => void>()
    onFrame(listener: (frame: unknown) => void): () => void {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    }
    emit(frame: unknown): void {
      for (const listener of this.listeners) listener(frame)
    }
  }

  it('keeps live events that arrive while the tail page is still loading', async () => {
    let resolveHistory: (page: HistoryPage) => void = () => {}
    loadHistoryMock.mockReturnValue(new Promise<HistoryPage>((resolve) => { resolveHistory = resolve }))
    const mux = new FakeMux()
    render(<ChatView session={session} mux={mux as never} onBack={() => {}} />)

    // A live turn starts before the snapshot resolves: chunk, tool call, final.
    await act(async () => {
      mux.emit({ type: 'session/event', sessionId: 's-1', event: makeEntry('assistant/chunk', { turn: 1, step: 0, chunk: { type: 'text-delta', text: '正在' } }, 6).event })
      mux.emit({ type: 'session/event', sessionId: 's-1', event: makeEntry('tool/call', { turn: 1, step: 0, callId: 'c9', name: 'bash', arguments: '{"cmd":"ls"}' }, 7).event })
      mux.emit({ type: 'session/event', sessionId: 's-1', event: makeEntry('assistant/message', { turn: 1, step: 0, message: { id: 'a-9', role: 'assistant', content: [{ type: 'text', text: '实时新消息' }] } }, 8).event })
    })
    // The snapshot predates those events; resolving it must not drop them.
    await act(async () => { resolveHistory(historyPage(turnEvents())) })

    expect(await screen.findByText('实时新消息')).toBeTruthy()
    // The history turn's tool disclosure plus the live one both render.
    expect((await screen.findAllByRole('button', { name: /工具/ })).length).toBe(2)
  })

  it('caps the tail-load live buffer and re-pulls the history tail after an overflow', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let resolveHistory: (page: HistoryPage) => void = () => {}
    loadHistoryMock
      .mockReturnValueOnce(new Promise<HistoryPage>((resolve) => { resolveHistory = resolve }))
      // The overflow follow-up load resolves a page newer than the buffered burst.
      .mockResolvedValueOnce(historyPage([
        makeEntry('assistant/message', {
          id: 'a-refetch',
          role: 'assistant',
          content: [{ type: 'text', text: '补拉恢复' }],
        }, 700),
      ]))
    const mux = new FakeMux()
    render(<ChatView session={session} mux={mux as never} onBack={() => {}} />)

    // 501 live final messages arrive before the snapshot resolves: the first one
    // is dropped by the 500-event cap, the remaining 500 stay buffered.
    await act(async () => {
      for (let index = 0; index <= MAX_TAIL_BUFFER_EVENTS; index++) {
        mux.emit({
          type: 'session/event',
          sessionId: 's-1',
          event: makeEntry('assistant/message', {
            id: `a-burst-${index}`,
            role: 'assistant',
            content: [{ type: 'text', text: `突发消息 ${index}` }],
          }, 100 + index).event,
        })
      }
    })

    // The overflow is logged exactly once, and the cap mentions the limit.
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain(String(MAX_TAIL_BUFFER_EVENTS))

    await act(async () => { resolveHistory(historyPage(turnEvents())) })

    // The capped buffer keeps the render bounded: the dropped oldest burst
    // message is gone, while the newest buffered one survives the snapshot fold.
    expect(await screen.findByText('突发消息 500')).toBeTruthy()
    expect(screen.queryByText('突发消息 0')).toBeNull()

    // The overflow triggered exactly one follow-up tail load, still carrying the
    // same abort signal as the initial load.
    await waitFor(() => { expect(loadHistoryMock).toHaveBeenCalledTimes(2) })
    expect(loadHistoryMock.mock.calls[1]?.[0]).toBe('s-1')
    expect(loadHistoryMock.mock.calls[1]?.[1]).toBeUndefined()
    expect(loadHistoryMock.mock.calls[1]?.[2]).toBeInstanceOf(AbortSignal)
    expect(loadHistoryMock.mock.calls[1]?.[2]).toBe(loadHistoryMock.mock.calls[0]?.[2])

    // The re-pulled page folds into the already-rendered messages.
    expect(await screen.findByText('补拉恢复')).toBeTruthy()
  })

  it('passes an AbortSignal to loadHistory and aborts it on unmount', async () => {
    let capturedSignal: AbortSignal | undefined
    loadHistoryMock.mockImplementation((_sessionId, _beforeSeq, signal) => {
      capturedSignal = signal
      return Promise.resolve(historyPage(turnEvents()))
    })
    const view = render(<ChatView session={session} onBack={() => {}} />)

    expect(await screen.findByText('已完成修改')).toBeTruthy()
    expect(loadHistoryMock).toHaveBeenCalledTimes(1)
    expect(loadHistoryMock.mock.calls[0]?.[0]).toBe('s-1')
    expect(loadHistoryMock.mock.calls[0]?.[1]).toBeUndefined()
    expect(loadHistoryMock.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal)
    expect(capturedSignal).toBeInstanceOf(AbortSignal)
    expect(capturedSignal?.aborted).toBe(false)

    view.unmount()
    expect(capturedSignal?.aborted).toBe(true)
  })
})

describe('ChatView model sheet', () => {
  it('labels the toolbar chip with the current model and selects a new one', async () => {
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents()))
    render(<ChatView session={session} onBack={() => {}} />)

    const chip = await screen.findByRole('button', { name: /模型/ })
    expect(chip.textContent).toContain('fx-1')

    fireEvent.click(chip)
    const deep = await screen.findByRole('button', { name: /FX 深度/ })
    fireEvent.click(deep)
    await waitFor(() => {
      expect(selectModelMock).toHaveBeenCalledWith('s-1', { provider: 'fx', model: 'fx-2', reasoningEffort: 'high' })
    })
  })

  it('offers effort choices for the current model and submits the picked effort', async () => {
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents()))
    // The current model already is the effort-capable one.
    modelsMock.mockResolvedValue({
      current: { provider: 'fx', model: 'fx-2', reasoningEffort: 'high' },
      routable: true,
      groups: [
        {
          id: 'fx',
          name: 'FX',
          models: [
            { id: 'fx-1', name: 'FX 标准' },
            { id: 'fx-2', name: 'FX 深度', reasoning: { efforts: [{ id: 'high', name: '高' }], defaultEffort: 'high' } },
          ],
        },
      ],
      failures: [],
    } satisfies SessionModels)
    render(<ChatView session={session} onBack={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: /模型/ }))
    const effort = await screen.findByRole('button', { name: /^高/ })
    fireEvent.click(effort)
    await waitFor(() => {
      expect(selectModelMock).toHaveBeenCalledWith('s-1', { provider: 'fx', model: 'fx-2', reasoningEffort: 'high' })
    })
  })
  it('explains a transport 403 on the model channel as a stale host', async () => {
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents()))
    modelsMock.mockRejectedValue(new Error('HTTP 403'))
    render(<ChatView session={session} onBack={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: /模型/ }))
    expect(await screen.findByText(/HTTP 403/)).toBeTruthy()
    expect(await screen.findByText(/重启 dsh web/)).toBeTruthy()
  })
})

describe('ChatView composer', () => {
  const inputBox = (): HTMLTextAreaElement => screen.getByRole('textbox') as HTMLTextAreaElement

  /** Dispatch one keydown through the React tree and return the real event. */
  const pressEnter = (input: HTMLTextAreaElement, shiftKey = false): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, shiftKey })
    input.dispatchEvent(event)
    return event
  }

  it('sends on Enter by default and keeps Shift+Enter inserting a newline', async () => {
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents()))
    render(<ChatView session={session} onBack={() => {}} />)
    await screen.findByText('已完成修改')

    const input = inputBox()
    expect(input.getAttribute('enterKeyHint')).toBe('send')
    expect(input.getAttribute('placeholder')).toContain('Enter 发送')

    fireEvent.change(input, { target: { value: '第一行' } })
    const enter = pressEnter(input)
    expect(enter.defaultPrevented).toBe(true)
    await waitFor(() => {
      expect(promptMock).toHaveBeenCalledWith('s-1', '第一行')
    })

    // Shift+Enter stays a newline gesture and never sends.
    promptMock.mockClear()
    const shifted = pressEnter(input, true)
    expect(shifted.defaultPrevented).toBe(false)
    expect(promptMock).not.toHaveBeenCalled()
  })

  it('inserts a newline on Enter and sends only from the button when the preference is false', async () => {
    fetchMobilePreferencesMock.mockResolvedValue({ mobileEnterToSend: false })
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents()))
    render(<ChatView session={session} onBack={() => {}} />)
    await screen.findByText('已完成修改')

    const input = inputBox()
    await waitFor(() => { expect(input.getAttribute('enterKeyHint')).toBe('enter') })
    expect(input.getAttribute('placeholder')).not.toContain('Enter 发送')

    // The handler no longer prevents Enter, so the browser's default inserts
    // a newline (emulated here through the controlled value) and no send fires.
    fireEvent.change(input, { target: { value: '第一行' } })
    const enter = pressEnter(input)
    expect(enter.defaultPrevented).toBe(false)
    fireEvent.change(input, { target: { value: '第一行\n' } })
    expect(input.value).toBe('第一行\n')
    expect(promptMock).not.toHaveBeenCalled()

    // The send button still sends the full multi-line draft.
    fireEvent.change(input, { target: { value: '第一行\n第二行' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => {
      expect(promptMock).toHaveBeenCalledWith('s-1', '第一行\n第二行')
    })

    // Shift+Enter keeps inserting a newline in either mode.
    promptMock.mockClear()
    const shifted = pressEnter(input, true)
    expect(shifted.defaultPrevented).toBe(false)
    expect(promptMock).not.toHaveBeenCalled()
  })
})

describe('ChatView composer request boundaries', () => {
  function deferred() {
    let resolve!: () => void
    let reject!: (reason: Error) => void
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
    return { promise, resolve, reject }
  }

  async function openChat() {
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents()))
    const view = render(<ChatView session={session} onBack={() => {}} />)
    await screen.findByText('已完成修改')
    return { ...view, input: screen.getByRole('textbox') as HTMLTextAreaElement }
  }

  it('keeps a later draft when the earlier send completes, including edits back to the same text', async () => {
    const pending = deferred()
    promptMock.mockReturnValueOnce(pending.promise)
    const { input } = await openChat()
    fireEvent.change(input, { target: { value: 'first' } })
    fireEvent.click(screen.getByRole('button', { name: /^发送$/ }))
    fireEvent.change(input, { target: { value: 'second' } })
    fireEvent.change(input, { target: { value: 'first' } })
    await act(async () => { pending.resolve() })
    expect(input.value).toBe('first')
    expect(promptMock).toHaveBeenCalledTimes(1)
    expect(promptMock).toHaveBeenCalledWith(session.sessionId, 'first')
  })

  it('clears an unchanged successful draft and preserves a failed draft for retry', async () => {
    const { input } = await openChat()
    fireEvent.change(input, { target: { value: 'accepted' } })
    fireEvent.click(screen.getByRole('button', { name: /^发送$/ }))
    await waitFor(() => expect(input.value).toBe(''))
    promptMock.mockRejectedValueOnce(new Error('request unavailable'))
    fireEvent.change(input, { target: { value: 'retry me' } })
    fireEvent.click(screen.getByRole('button', { name: /^发送$/ }))
    await screen.findByText('request unavailable')
    expect(input.value).toBe('retry me')
    fireEvent.click(screen.getByRole('button', { name: /^发送$/ }))
    await waitFor(() => expect(input.value).toBe(''))
    expect(promptMock).toHaveBeenCalledTimes(3)
  })

  it('does not send the Enter used to confirm an IME composition', async () => {
    const { input } = await openChat()
    fireEvent.change(input, { target: { value: '中文内容' } })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 })
    expect(promptMock).not.toHaveBeenCalled()
    fireEvent.compositionEnd(input)
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
    expect(promptMock).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
    await waitFor(() => expect(promptMock).toHaveBeenCalledWith(session.sessionId, '中文内容'))
  })

  it('ignores a send result from the previous session while the current send is pending', async () => {
    const oldSend = deferred()
    const newSend = deferred()
    promptMock.mockReturnValueOnce(oldSend.promise).mockReturnValueOnce(newSend.promise)
    const { input, rerender } = await openChat()
    fireEvent.change(input, { target: { value: 'old session' } })
    fireEvent.click(screen.getByRole('button', { name: /^发送$/ }))
    rerender(<ChatView session={{ ...session, sessionId: 's-2' }} onBack={() => {}} />)
    fireEvent.change(input, { target: { value: 'current session' } })
    fireEvent.click(screen.getByRole('button', { name: /^发送$/ }))
    await act(async () => { oldSend.resolve() })
    expect(input.value).toBe('current session')
    expect(screen.getByRole('button', { name: /^发送中…$/ }).hasAttribute('disabled')).toBe(true)
    await act(async () => { newSend.resolve() })
    expect(input.value).toBe('')
    expect(promptMock).toHaveBeenLastCalledWith('s-2', 'current session')
  })
})

describe('ChatView scrolling', () => {
  // Controllable scrollHeight + a write log for the chat-scroll element. The
  // accessors live on Element.prototype, so patching them here lets every
  // scrollToBottom assignment drive a deterministic assertion regardless of
  // when the effect runs relative to mount.
  let scrollHeightMock = 0
  let scrollWrites: number[] = []

  const origScrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')
  const origScrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')

  /** Minimal mux stand-in: captures the ChatView's frame listener for hand-off. */
  class FakeMux {
    listeners = new Set<(frame: unknown) => void>()
    onFrame(listener: (frame: unknown) => void): () => void {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    }
    emit(frame: unknown): void {
      for (const listener of this.listeners) listener(frame)
    }
  }

  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'scrollHeight', {
      configurable: true,
      get() { return scrollHeightMock },
    })
    Object.defineProperty(Element.prototype, 'scrollTop', {
      configurable: true,
      get(this: Element) { const stored = (this as unknown as Record<string, unknown>)['__scrollTop']; return typeof stored === 'number' ? stored : 0 },
      set(this: Element, value: number) { scrollWrites.push(value); (this as unknown as Record<string, unknown>)['__scrollTop'] = value },
    })
  })
  afterAll(() => {
    if (origScrollHeight) Object.defineProperty(Element.prototype, 'scrollHeight', origScrollHeight)
    if (origScrollTop) Object.defineProperty(Element.prototype, 'scrollTop', origScrollTop)
  })

  beforeEach(() => { scrollHeightMock = 0; scrollWrites = [] })

  /** A final assistant/message event (non-pending) appended live after the history turn. */
  const liveFinalEvent = (seq: number) => makeEntry('assistant/message', {
    turn: 1,
    step: 0,
    message: { id: 'a-2', role: 'assistant', content: [{ type: 'text', text: '实时新消息' }] },
  }, seq)

  it('positions to the latest message when a session is opened', async () => {
    scrollHeightMock = 400
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents()))
    render(<ChatView session={session} onBack={() => {}} />)
    // The tail page renders, then the commit-time effect pins scrollTop to the tail.
    expect(await screen.findByText('已完成修改')).toBeTruthy()
    expect(scrollWrites.at(-1)).toBe(400)
  })

  it('auto-scrolls to the bottom when a new live message arrives', async () => {
    scrollHeightMock = 400
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents()))
    const mux = new FakeMux()
    render(<ChatView session={session} mux={mux as never} onBack={() => {}} />)
    await screen.findByText('已完成修改')
    expect(scrollWrites.at(-1)).toBe(400)
    // A real-time message grows content; the newly appended (non-pending) last
    // message must still pull the view down to the new bottom.
    scrollHeightMock = 800
    await act(async () => {
      mux.emit({ type: 'session/event', sessionId: 's-1', event: liveFinalEvent(6).event })
    })
    expect(await screen.findByText('实时新消息')).toBeTruthy()
    expect(scrollWrites.at(-1)).toBe(800)
  })

  it('keeps the current scroll position when older messages are loaded', async () => {
    scrollHeightMock = 400
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents(), { hasMore: true }))
    const mux = new FakeMux()
    render(<ChatView session={session} mux={mux as never} onBack={() => {}} />)
    await screen.findByText('已完成修改')
    // Move to the bottom (streaming), as a stable baseline to preserve.
    scrollHeightMock = 800
    await act(async () => {
      mux.emit({ type: 'session/event', sessionId: 's-1', event: liveFinalEvent(6).event })
    })
    await screen.findByText('实时新消息')
    const writesBefore = scrollWrites.length
    expect(scrollWrites.at(-1)).toBe(800)
    // Prepend an older page; the last message is untouched, so no re-scroll fires.
    scrollHeightMock = 900
    loadHistoryMock.mockResolvedValueOnce(historyPage(turnEvents(), { hasMore: false }))
    fireEvent.click(screen.getByRole('button', { name: /加载更早的消息/ }))
    await waitFor(() => { expect(scrollWrites.length).toBe(writesBefore) })
  })
})
