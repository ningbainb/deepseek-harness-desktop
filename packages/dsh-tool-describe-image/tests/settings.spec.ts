/** The settings-section wiring: the Plugins card's committed changes drive the next call. */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'

import * as tool from '../src/index.ts'
import { chatReply, FakeWebServer, jsonReply, PNG_BYTES, responsesReply, startMockServer } from './mock-server.ts'
import type { MockServer, RecordedRequest } from './mock-server.ts'

type FieldRef = { get(): unknown; set(value: unknown): void }

/** Emulate Profile form commits while exercising the plugin's real volatile references. */
class MemorySettings extends Service {
  doc: Record<string, unknown>
  private readonly fields: Record<string, FieldRef>

  constructor(ctx: Context, doc: Record<string, unknown>, fields: Record<string, FieldRef>) {
    super(ctx, 'settings')
    this.doc = structuredClone(doc)
    this.fields = fields
  }

  async update(ns: string, patch: Record<string, unknown>): Promise<void> {
    const current = Object.fromEntries(Object.entries(this.fields).map(([key, field]) => [key, field.get()]))
    tool.resolveConfig({ ...current, ...patch })
    const next = { ...(this.doc[ns] as Record<string, unknown> ?? {}), ...patch }
    this.doc[ns] = structuredClone(next)
    for (const [key, value] of Object.entries(patch)) this.fields[key]?.set(value)
  }
}

const cleanup: Array<() => Promise<void>> = []

async function boot(
  doc: Record<string, unknown> = {},
  handler: (request: RecordedRequest, response: ServerResponse) => void
    = (_request, res) => { jsonReply(res, 200, chatReply('ok')) },
): Promise<{ ctx: Context; server: MockServer }> {
  const server = await startMockServer(handler)
  cleanup.push(server.close)
  const ctx = new Context()
  const entry = { baseURL: server.url, model: 'entry-model', apiKey: 'sk-entry' }
  const saved = doc['describe-image'] as Record<string, unknown> | undefined
  const initial = {
    apiStyle: tool.DEFAULT_API_STYLE,
    interceptImageSend: true,
    defaultPrompt: tool.DEFAULT_PROMPT,
    apiKeyEnv: tool.DEFAULT_API_KEY_ENV,
    maxBytes: tool.DEFAULT_MAX_BYTES,
    maxOutputTokens: tool.DEFAULT_MAX_OUTPUT_TOKENS,
    timeoutMs: tool.DEFAULT_TIMEOUT_MS,
    ...entry,
    ...saved,
  }
  const fields = Object.fromEntries(Object.entries(initial).map(([key, value]) => {
    let current: unknown = value
    return [key, { get: () => current, set: (next: unknown) => { current = next } }]
  })) as Record<string, FieldRef>
  new MemorySettings(ctx, doc, fields)
  await ctx.plugin(FakeWebServer)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  tool.apply(ctx, fields as unknown as tool.Config)
  return { ctx, server }
}

async function tempPng(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-describe-image-settings-'))
  cleanup.push(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'pixel.png')
  await writeFile(path, PNG_BYTES)
  return path
}

function callDescribe(ctx: Context, image: string) {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('settings-vision-call'),
    name: 'describe_image',
    arguments: { image },
  })
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(close => close()))
})

describe('describe-image profile form', () => {
  it('persists the image interception switch through a profile form commit', async () => {
    const { ctx } = await boot()
    await ctx.settings.update(tool.DESCRIBE_IMAGE_SETTINGS_NAMESPACE, { interceptImageSend: false })
    expect((ctx.settings as unknown as MemorySettings).doc['describe-image']).toMatchObject({ interceptImageSend: false })
    await ctx.settings.update(tool.DESCRIBE_IMAGE_SETTINGS_NAMESPACE, { interceptImageSend: true })
    expect((ctx.settings as unknown as MemorySettings).doc['describe-image']).toMatchObject({ interceptImageSend: true })
  })
  it('overlays the composition entry from the stored section', async () => {
    const { ctx, server } = await boot({ 'describe-image': { model: 'settings-model', maxOutputTokens: 7 } })
    const path = await tempPng()

    const result = await callDescribe(ctx, path)
    expect(result.isError, JSON.stringify(result.content)).toBe(false)
    if (result.isError) throw new Error('expected describe_image success')
    expect(result.value).toMatchObject({ model: 'settings-model' })
    const body = server.request(0).body as { model?: unknown; max_tokens?: unknown }
    expect(body.model).toBe('settings-model')
    expect(body.max_tokens).toBe(7)
  })

  it('reaches the next call after a committed update, without re-registration', async () => {
    const { ctx, server } = await boot()
    const path = await tempPng()

    await ctx.settings.update(tool.DESCRIBE_IMAGE_SETTINGS_NAMESPACE, { model: 'live-model' })

    const result = await callDescribe(ctx, path)
    expect(result.isError).toBe(false)
    expect((server.request(0).body as { model?: unknown }).model).toBe('live-model')
  })

  it('an apiStyle committed through the section switches the next call to /responses', async () => {
    const { ctx, server } = await boot({}, (_request, res) => { jsonReply(res, 200, responsesReply('switched')) })
    const path = await tempPng()

    await ctx.settings.update(tool.DESCRIBE_IMAGE_SETTINGS_NAMESPACE, { apiStyle: 'responses' })

    const result = await callDescribe(ctx, path)
    expect(result.isError, JSON.stringify(result.content)).toBe(false)
    if (result.isError) throw new Error('expected describe_image success')
    expect(result.value).toMatchObject({ text: 'switched' })
    expect(server.request(0).path).toBe('/responses')
  })

  it('an inline apiKey committed through the section drives the next call', async () => {
    const { ctx, server } = await boot({ 'describe-image': { apiKey: 'sk-settings' } })
    const path = await tempPng()

    await callDescribe(ctx, path)
    expect(server.request(0).authorization).toBe('Bearer sk-settings')
  })

  it('rejects an incoherent profile edit before committing its live values', async () => {
    const { ctx } = await boot()

    await expect(ctx.settings.update(tool.DESCRIBE_IMAGE_SETTINGS_NAMESPACE, { baseURL: 'ftp://example.com' }))
      .rejects.toThrow(/describe-image: baseURL must be an absolute http\(s\) URL/)
  })

  it('keeps the composition entry authoritative while the settings service is absent', async () => {
    const server = await startMockServer((_request, res) => { jsonReply(res, 200, chatReply('ok')) })
    cleanup.push(server.close)
    const ctx = new Context()
    await ctx.plugin(FakeWebServer)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(tool, { baseURL: server.url, model: 'entry-only', apiKey: 'sk-entry' })
    const path = await tempPng()

    await callDescribe(ctx, path)
    expect((server.request(0).body as { model?: unknown }).model).toBe('entry-only')
  })
})
