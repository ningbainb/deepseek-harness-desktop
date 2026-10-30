import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { FULL_USER_RUNTIME_OVERLAY } from '../src/primary-full-user-overlay.mjs'

const require = createRequire(new URL('../package.json', import.meta.url))
const { parse } = require('yaml')
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
const { ApprovalService, setApprovalPolicy } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-user-approval')).href)
const { Session, SessionId } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-session')).href)

async function exercise({ answer = 'allowed-once', override, aborted = false } = {}) {
  const rows = parse(FULL_USER_RUNTIME_OVERLAY)
  assert.equal(rows.find(row => row.id === 'sandbox-policy').config.mode, 'danger-full-access')
  const ctx = new Context()
  const prompts = []
  ctx.on('approval/request', async request => {
    prompts.push(request.toolName)
    return answer
  })
  const approval = new ApprovalService(ctx, rows.find(row => row.id === 'approval').config)
  const session = Session.create(SessionId('desktop-browser-approval'))
  session.append('turn/start', { turn: 1 })
  if (override) setApprovalPolicy(session, override)
  const controller = new AbortController()
  if (aborted) controller.abort()
  try {
    const outcome = await approval.request({ agent: { session },
      toolName: 'mcp__playwright-mcp__browser_navigate', signal: controller.signal })
    const events = session.snapshotEvents().filter(event => event.type.startsWith('approval/'))
    return { outcome, prompts, events }
  } finally {
    await ctx.fiber.dispose()
  }
}

test('full filesystem permission still presents one-shot browser approval', async () => {
  const result = await exercise()
  assert.equal(result.outcome, 'allowed-once')
  assert.deepEqual(result.prompts, ['mcp__playwright-mcp__browser_navigate'])
  assert.deepEqual(result.events.map(event => event.type), ['approval/asked', 'approval/decided'])
  assert.equal(result.events.at(-1).data.outcome, 'allowed-once')
})

test('full filesystem permission records a real rejected browser prompt', async () => {
  const result = await exercise({ answer: 'rejected' })
  assert.equal(result.outcome, 'rejected')
  assert.equal(result.prompts.length, 1)
  assert.equal(result.events.at(-1).data.outcome, 'rejected')
})

test('explicit session never policy still rejects browser approval without a prompt', async () => {
  const result = await exercise({ override: 'never' })
  assert.equal(result.outcome, 'rejected')
  assert.deepEqual(result.prompts, [])
})

test('cancelled browser approval is never granted', async () => {
  const result = await exercise({ aborted: true })
  assert.equal(result.outcome, 'cancelled')
  assert.deepEqual(result.prompts, [])
})
