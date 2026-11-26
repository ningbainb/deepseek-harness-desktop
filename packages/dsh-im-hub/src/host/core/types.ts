import type { ChannelId, ChannelStatusSnapshot } from '../../core/settings.ts'

export type ChatType = 'direct' | 'group'

export interface InboundMessage {
  channel: ChannelId
  messageId: string
  conversationId: string
  chatType: ChatType
  senderId: string
  senderName?: string
  text: string
  mentioned?: boolean
  replyContext?: Record<string, unknown>
  receivedAt: number
}

export interface OutboundReply {
  text: string
  title?: string
  replyContext?: Record<string, unknown>
}

export interface WebhookHttpInput {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  rawBody: string
}

export interface WebhookHttpOutput {
  status: number
  headers?: Record<string, string>
  body: string
}

export interface ChannelAdapter {
  readonly id: ChannelId
  start(): Promise<void>
  stop(): Promise<void>
  send(conversationId: string, reply: OutboundReply): Promise<void>
  testConnection(): Promise<{ ok: boolean; detail: string }>
  getStatus(): ChannelStatusSnapshot
  handleWebhook?(req: WebhookHttpInput): Promise<WebhookHttpOutput>
}

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>

export interface WebSocketLike {
  readyState: number
  send(data: string | Uint8Array): void
  close(code?: number, reason?: string): void
  addEventListener?(type: string, listener: (event: unknown) => void): void
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onerror: ((event: unknown) => void) | null
  onclose: ((event: { code?: number; reason?: string }) => void) | null
}

export type WebSocketFactory = (url: string) => WebSocketLike
