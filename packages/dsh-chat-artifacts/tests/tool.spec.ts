import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as artifact from '../src/index.ts'

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(artifact)
  return ctx
}

function renderArtifact(ctx: Context, args: unknown) {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('artifact-test'),
    name: 'render_artifact',
    arguments: args,
  })
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
    expect(Object.keys(properties).sort()).toEqual(['description', 'height', 'html', 'kind', 'title'])
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
    expect(section?.text).toContain('does not run JavaScript')
    expect(section?.text).toContain('materially improves understanding')
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
