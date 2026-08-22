/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ChatGptAuthState } from '../src/chatgpt-auth-protocol.ts'
import { chatGptAuthZh, type ChatGptAuthKey } from '../src/client/locales.ts'

const api = vi.hoisted(() => ({
  state: vi.fn(),
  begin: vi.fn(),
  answer: vi.fn(),
  cancel: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('../src/client/chatgpt-auth-client.ts', () => ({
  chatGptAuthClient: api,
  ChatGptAuthClientError: class ChatGptAuthClientError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
}))

import { ChatGptAuthSection } from '../src/client/ChatGptAuthSection.tsx'

const signedOut: ChatGptAuthState = {
  available: true,
  configured: false,
  writable: true,
  inFlight: false,
  methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
  phase: 'idle',
}

function t(key: ChatGptAuthKey): string {
  return chatGptAuthZh[key]
}

function renderSection(): void {
  const props = { close: () => {}, t } as Parameters<typeof ChatGptAuthSection>[0]
  render(<ChatGptAuthSection {...props} />)
}

beforeEach(() => {
  api.state.mockResolvedValue(signedOut)
  api.begin.mockResolvedValue(signedOut)
  api.answer.mockResolvedValue(signedOut)
  api.cancel.mockResolvedValue(signedOut)
  api.logout.mockResolvedValue(signedOut)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('ChatGPT authorization settings section', () => {
  it('starts the official flow with one visible sign-in click', async () => {
    renderSection()
    const button = await screen.findByRole('button', { name: '使用 ChatGPT 登录' })

    fireEvent.click(button)

    await waitFor(() => expect(api.begin).toHaveBeenCalledWith())
  })

  it('opens an authorization notice through the Desktop popup policy', async () => {
    const authorizationUrl = 'https://auth.openai.com/oauth/authorize?state=opaque'
    api.state.mockResolvedValue({
      ...signedOut,
      inFlight: true,
      phase: 'awaiting-user',
      notice: { message: 'Continue in your browser', url: authorizationUrl },
    })
    const popup = { location: { href: '' } }
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    renderSection()

    fireEvent.click(await screen.findByRole('button', { name: '在浏览器继续' }))

    expect(open).toHaveBeenCalledWith('about:blank', '_blank')
    expect(popup.location.href).toBe(authorizationUrl)
  })

  it('shows sign-out for a configured local record', async () => {
    const configured = { ...signedOut, configured: true, phase: 'authorized' as const }
    api.state.mockResolvedValue(configured)
    api.logout.mockResolvedValue(signedOut)
    renderSection()

    fireEvent.click(await screen.findByRole('button', { name: '退出登录' }))

    await waitFor(() => expect(api.logout).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('尚未登录')).toBeTruthy()
  })

  it('explains a missing flow and disables sign-in', async () => {
    api.state.mockResolvedValue({ ...signedOut, available: false })
    renderSection()

    expect(await screen.findByText(/当前运行环境没有提供 ChatGPT 授权能力/)).toBeTruthy()
    expect((screen.getByRole('button', { name: '使用 ChatGPT 登录' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
