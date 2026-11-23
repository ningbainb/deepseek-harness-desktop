import assert from 'node:assert/strict'
import { DesktopPipeWebServer } from '@linxin666/dsh-desktop-pipe-webserver'
import { createDesktopPipeSessionCookie, installLegacyConnectionAdmission } from '../../src/runtime-cookie.mjs'
import { join } from 'node:path'
import { hostFixture, load, modelText, occurrences } from './context-suite-host.mjs'

// SQLite connections are owned by upstream module caches. Keep this probe in
// its own process; the calling test removes the Home after all handles close.
const { ctx, directory, projectA, request } = await hostFixture({ after() {} })
console.log(`CONTEXT_PROBE_ROOT=${directory}`)
process.env.DSH_AGENTS_HOME = join(directory, 'agents')
const web = new DesktopPipeWebServer(ctx)
installLegacyConnectionAdmission(ctx)
await ctx.plugin((await load('@deepseek-ai/dsh-credentials-local')).default)
await ctx.plugin(await load('@deepseek-ai/dsh-client-connection'))
await ctx.plugin(await load('@deepseek-ai/dsh-host-authentication-token'))
const cookie = await createDesktopPipeSessionCookie(ctx)()
const fiber = await ctx.plugin(await load('dsh-prompt-customizer'), { dataDir: join(directory, 'p2') })

async function call(path, body) {
  assert.ok(web.match(path.split('?')[0]), `${path}: route must exist`)
  const response = await web.fetch(new Request(new URL(path, 'http://127.0.0.1/'), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  }))
  return { status: response.status, body: await response.json() }
}

const backup = await call('/api/prompt-customizer/backup')
const save = await call('/api/prompt-customizer/config/apply', { target: 'suite', patch: {
  inject: [{ name: 'suite-p2', order: 60, text: 'SUITE_P2_TEXT', phase: 'always', custom: true }],
} })
const handle = await ctx.agents.create({ sessionId: 'suite-local-a', meta: { cwd: projectA, agentPreset: 'suite' }, agentOptions: { provider: 'suite-capture', model: 'fixture' } })
await ctx.userScope.registerSession({ sessionId: handle.agent.id, workspaceId: 'suite-project-a' })
const input = modelText(await request(handle.agent))
const preview = await call('/api/prompt-customizer/preview?scope=suite&phase=active')
const restore = await call('/api/prompt-customizer/restore', backup.body)
const after = await ctx.agents.create({ sessionId: 'suite-restored', meta: { cwd: projectA, agentPreset: 'suite' }, agentOptions: { provider: 'suite-capture', model: 'fixture' } })
await ctx.userScope.registerSession({ sessionId: after.agent.id })
const restoredInput = modelText(await request(after.agent))
const report = { version: '2.2.0', node: process.versions.node, state: fiber.state,
  backup: backup.status, save: save.status, preview: preview.status, restore: restore.status,
  previewIncludesP2: JSON.stringify(preview.body).includes('SUITE_P2_TEXT'), restoredWithoutP2: !restoredInput.includes('SUITE_P2_TEXT'),
  counts: Object.fromEntries(['SUITE_CONTEXT_PREFIX', 'SUITE_NATIVE_PREFIX', 'SUITE_M1_GLOBAL', 'SUITE_P1_PROJECT_A', 'SUITE_P2_TEXT', 'SUITE_NATIVE_SUFFIX', 'SUITE_CONTEXT_SUFFIX'].map(marker => [marker, occurrences(input, marker)])),
  // Upstream P2 custom injections follow its ordered base sections, so the
  // observed custom section follows the context plugin's suffix.
  order: ['SUITE_CONTEXT_PREFIX', 'SUITE_NATIVE_PREFIX', 'SUITE_M1_GLOBAL', 'SUITE_P1_PROJECT_A', 'SUITE_NATIVE_SUFFIX', 'SUITE_CONTEXT_SUFFIX', 'SUITE_P2_TEXT'].map(marker => input.indexOf(marker)),
}
await ctx.fiber.dispose()
console.log(`CONTEXT_P2_PROBE=${JSON.stringify(report)}`)
process.exit(0)
