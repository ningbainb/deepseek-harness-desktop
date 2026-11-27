import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionSeq, type Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import * as artifact from '../src/index.ts'

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(artifact)
  return ctx
}

let callNumber = 0

async function renderArtifact(ctx: Context, args: unknown, session?: Session, toolName = 'render_artifact') {
  const callId = ToolCallId('artifact-test-' + ++callNumber)
  const batch = await ctx.tools.execute({
    signal: new AbortController().signal,
    ...(session ? { agent: { id: session.id, session } as Agent, log: { turn: 1, step: 1 } } : {}),
    calls: [{
      type: 'tool-call',
      id: callId,
      name: toolName,
      arguments: JSON.stringify(args),
    }],
  })
  expect(batch.results).toHaveLength(1)
  const settled = batch.results[0]
  if (!settled) throw new Error('expected one render_artifact result')
  expect(settled.callId).toBe(callId)
  return settled.result
}

function textContent(result: { content: readonly { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text ?? '').join('')
}

describe('render_artifact registration', () => {
  it('publishes the expected schema and generic fallback intent', async () => {
    const ctx = await setup()
    const schema = ctx.tools.schemas().find(value => value.name === 'render_artifact')
    expect(schema).toBeDefined()
    const properties = (schema?.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(['description', 'height', 'html', 'kind', 'mode', 'title'])
    expect((properties.kind as { enum?: readonly string[] }).enum).toEqual([
      'architecture',
      'flow',
      'timeline',
      'comparison',
      'roadmap',
      'dashboard',
      'table',
      'wireframe',
      'report',
      'other',
    ])

    expect(artifact.renderArtifactCallView({ title: 'A', kind: 'architecture' })).toEqual({
      card: 'generic',
      title: 'Render artifact',
      kind: 'other',
      rawInput: { title: 'A', kind: 'architecture' },
    })
  })

  it('adds the automatic-use guidance to the assembled system prompt', async () => {
    const ctx = await setup()
    const assembly = await ctx.systemPrompt.assemble()
    const section = assembly.sections.find(value => value.name === 'plugin:chat-artifacts')
    expect(section?.text).toContain('render_artifact')
    expect(section?.text).toContain('Proactively call render_artifact')
    expect(section?.text).toContain('explaining a project')
    expect(section?.text).toContain('teaching a concept')
    expect(section?.text).toContain('even if the user did not explicitly ask for a diagram')
    expect(section?.text).toContain('Static mode does not run JavaScript')
    expect(section?.text).toContain('materially improves understanding')
    expect(section?.text).toContain('the latest request together with the earlier turns')
    expect(section?.text).toContain('patch_artifact')
  })

  it('exposes only recent committed diagram identifiers in their owning session context', async () => {
    const ctx = await setup()
    const original = ctx.sessions.create()
    const other = ctx.sessions.create()
    const diagram = await renderArtifact(ctx, { title: 'First diagram', kind: 'architecture', html: '<p>Details</p>' }, original)
    if (diagram.isError || !artifact.isArtifactRecord(diagram.meta)) throw new Error('expected committed diagram')
    const firstId = diagram.meta.artifactId
    const next = await renderArtifact(ctx, { title: 'Second diagram', kind: 'flow', html: '<p>Next</p>' }, original)
    if (next.isError || !artifact.isArtifactRecord(next.meta)) throw new Error('expected second diagram')
    await renderArtifact(ctx, { artifactId: firstId, edits: [{ oldString: 'Details', newString: 'Updated' }] }, original, 'patch_artifact')
    const related = (await ctx.systemPrompt.assemble({ session: original })).contexts
      .find(value => value.name === 'plugin:chat-artifacts:recent')
    expect(related?.text).toContain(firstId + ' (architecture, v2)')
    expect(related?.text.indexOf(firstId)).toBeLessThan(related?.text.indexOf(next.meta.artifactId) ?? 0)
    expect(related?.text).not.toContain('First diagram')
    expect((await ctx.systemPrompt.assemble({ session: other })).contexts
      .some(value => value.name === 'plugin:chat-artifacts:recent' && value.text.includes(firstId))).toBe(false)
  })
})

describe('patch_artifact version history', () => {
  it('applies a patch to a restored legacy snapshot and persists a full then-current version', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create()
    const prior = await renderArtifact(ctx, { title: 'Original', kind: 'flow', html: '<p>One</p>' }, session)
    expect(prior.isError).toBe(false)
    const meta: unknown = prior.meta
    if (prior.isError || !artifact.isArtifactRecord(meta)) throw new Error('expected render snapshot')
    const legacyRecord = {
      artifactId: meta.artifactId,
      title: meta.title,
      kind: meta.kind,
      html: meta.html,
      height: meta.height,
      bytes: meta.bytes,
      sha256: meta.sha256,
    }

    const restored = await setup()
    const seed: readonly SessionEvent[] = [
      { type: 'tool/call', seq: SessionSeq(0), time: 1, data: { turn: 1, step: 1, callId: ToolCallId('render-old'), name: 'render_artifact', arguments: '{}' } },
      { type: 'tool/result', seq: SessionSeq(1), time: 2, surfaceOp: 'append', data: {
        turn: 1, step: 1, message: createToolResultMessage({ callId: ToolCallId('render-old'), content: [], isError: false }), meta: legacyRecord,
      } },
    ]
    const resumed = restored.sessions.create(session.id, { seed })
    const patched = await renderArtifact(restored, {
      artifactId: legacyRecord.artifactId,
      edits: [{ oldString: 'One', newString: 'Two' }],
      title: 'Updated',
      height: 380,
      summary: 'Updated the label.',
    }, resumed, 'patch_artifact')
    expect(patched.isError).toBe(false)
    expect(patched.meta).toEqual(patched.isError ? undefined : patched.value)
    expect(patched.meta).toMatchObject({ artifactId: legacyRecord.artifactId, title: 'Updated', html: '<p>Two</p>', version: 2, height: 380 })
    expect(textContent(patched)).toContain('Updated the label.')
    expect(textContent(patched)).not.toContain('<p>')

    const patchedAgain = await renderArtifact(restored, { artifactId: legacyRecord.artifactId, edits: [{ oldString: 'Two', newString: 'Three' }] }, resumed, 'patch_artifact')
    expect(patchedAgain.isError).toBe(false)
    expect(patchedAgain.meta).toMatchObject({ artifactId: legacyRecord.artifactId, html: '<p>Three</p>', version: 3 })
  })

  it('refuses foreign artifacts and leaves the committed version intact after a rejected patch', async () => {
    const ctx = await setup()
    const owning = ctx.sessions.create()
    const other = ctx.sessions.create()
    const original = await renderArtifact(ctx, { title: 'Example', kind: 'report', html: '<p>Safe</p>' }, owning)
    if (original.isError || !artifact.isArtifactRecord(original.meta)) throw new Error('expected render snapshot')
    const artifactId = original.meta.artifactId
    const edit = { artifactId, edits: [{ oldString: 'Safe', newString: 'Updated' }] }
    const result = await renderArtifact(ctx, { ...edit, sessionId: owning.id }, other, 'patch_artifact')
    expect(result.isError).toBe(true)
    expect(textContent(result)).toMatch(/current session/)
    const invalid = await renderArtifact(ctx, { artifactId, edits: [{ oldString: 'Safe', newString: '<script>x()</script>' }] }, owning, 'patch_artifact')
    expect(textContent(invalid)).toMatch(/html \(line 1\).*not allowed/)
    expect(invalid.meta).toBeUndefined()
    const valid = await renderArtifact(ctx, edit, owning, 'patch_artifact')
    expect(valid.meta).toMatchObject({ artifactId, html: '<p>Updated</p>', version: 2 })
  })

  it('serializes competing updates against committed snapshots', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create()
    const original = await renderArtifact(ctx, { title: 'Start', kind: 'flow', html: '<p>One</p>' }, session)
    if (!artifact.isArtifactRecord(original.meta)) throw new Error('expected render snapshot')
    const artifactId = original.meta.artifactId
    const first = { artifactId, edits: [{ oldString: 'One', newString: 'Two' }] }
    const second = { artifactId, edits: [{ oldString: 'One', newString: 'Other' }] }
    const results = await Promise.all([
      renderArtifact(ctx, first, session, 'patch_artifact'),
      renderArtifact(ctx, second, session, 'patch_artifact'),
    ])
    expect(results.filter(result => !result.isError)).toHaveLength(1)
    expect(results.find(result => !result.isError)?.meta).toMatchObject({ artifactId, version: 2 })
  })
})

describe('render_artifact execution and replay payload', () => {
  it('returns a short model result and a complete durable presentationMeta', async () => {
    const ctx = await setup()
    const html = '<style>.box{color:teal}</style><div class="box">Ready</div>'
    const result = await renderArtifact(ctx, {
      title: '  Product flow  ',
      kind: 'flow',
      html,
      height: 360,
      description: 'A small flow.',
    })

    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected render_artifact success')
    expect(result.value).toMatchObject({
      title: 'Product flow',
      kind: 'flow',
      html,
      height: 360,
      description: 'A small flow.',
      bytes: Buffer.byteLength(html, 'utf8'),
      sha256: createHash('sha256').update(html, 'utf8').digest('hex'),
    })
    expect((result.value as { artifactId: string }).artifactId).toMatch(/^artifact_[A-Za-z0-9_-]+$/)
    expect(result.meta).toEqual(result.value)
    expect(textContent(result)).toContain('Product flow')
    expect(textContent(result)).not.toContain('<style>')
  })

  it('returns an interactive snapshot when the model explicitly opts in', async () => {
    const ctx = await setup()
    const html = '<button onclick="this.textContent = String(2 + 2)">Calculate</button>'
    const result = await renderArtifact(ctx, { title: 'Calculator', kind: 'other', html, mode: 'interactive' })
    expect(result.isError).toBe(false)
    expect(result.meta).toMatchObject({ mode: 'interactive', version: 1, html })
  })

  it.each([
    ['script', '<script>alert(1)</script>'],
    ['external URL', '<img src="https://example.com/a.png">'],
  ])('contains unsafe HTML failures as tool results: %s', async (_label, html) => {
    const ctx = await setup()
    const result = await renderArtifact(ctx, { title: 'Unsafe', kind: 'report', html })
    expect(result.isError).toBe(true)
    expect(textContent(result)).toMatch(/not allowed|rejected|must not be empty/)
  })

  it('rejects invalid height without creating a presentation payload', async () => {
    const ctx = await setup()
    const result = await renderArtifact(ctx, {
      title: 'Invalid',
      kind: 'table',
      html: '<div>Table</div>',
      height: 721,
    })
    expect(result.isError).toBe(true)
    expect(result.meta).toBeUndefined()
  })
})
