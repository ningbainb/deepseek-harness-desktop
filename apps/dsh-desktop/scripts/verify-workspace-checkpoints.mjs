import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { createFixtureWorkspace, createSessionInWorkspace } from './agent-workspace-navigation-fixture.mjs'
import { closeIsolatedElectron } from './electron-cleanup-fixture.mjs'
import { dismissRuntimeOnboarding } from './dismiss-onboarding-fixture.mjs'
import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'

const runFile = promisify(execFile)
const appDir = fileURLToPath(new URL('..', import.meta.url))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-workspace-checkpoints-e2e-'))
const workspace = join(temporary, 'workspace')
const home = join(temporary, 'dsh-home')
const userData = join(temporary, 'user-data')
const filename = 'fixture-note.txt'
const note = join(workspace, filename)
const revisions = ['original lunar sample\n', 'first lunar sample\n', 'second lunar sample\n']
const fixtureProvider = 'checkpoints-fixture'
const credential = 'synthetic-checkpoint-model-key'
const turns = [
  { input: 'Checkpoint fixture edit one.', output: 'First workspace edit applied.', id: 'checkpoint_edit_one' },
  { input: 'Checkpoint fixture edit two.', output: 'Second workspace edit applied.', id: 'checkpoint_edit_two' },
]
const timeout = 60_000
const launchTimeout = 600_000
const modelErrors = []
const completedWrites = new Set()
let app, page

function completion(response, deltas) {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  for (const [delta, finish_reason = null] of deltas) {
    const frame = { id: 'checkpoint-fixture', object: 'chat.completion.chunk', created: 0, model: fixtureProvider,
      choices: [{ index: 0, delta, finish_reason }] }
    response.write(`data: ${JSON.stringify(frame)}\n\n`)
  }
  response.end('data: [DONE]\n\n')
}

const model = createServer(async (request, response) => {
  try {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') return response.writeHead(404).end()
    assert.equal(request.headers.authorization, `Bearer ${credential}`)
    const parts = []
    for await (const part of request) parts.push(part)
    const body = JSON.parse(Buffer.concat(parts).toString('utf8'))
    const latestFixturePrompt = body.messages.findLast(message => message.role === 'user'
      && turns.some(turn => JSON.stringify(message.content).includes(turn.input)))
    const index = body.tools?.length ? turns.findIndex(turn => JSON.stringify(latestFixturePrompt?.content ?? '').includes(turn.input)) : -1
    if (index < 0) return completion(response, [[{ role: 'assistant', content: 'Workspace checkpoint fixture' }], [{}, 'stop']])
    const turn = turns[index]
    const write = body.messages.find(message => message.role === 'tool' && message.tool_call_id === turn.id)
    if (write) {
      assert.equal(await readFile(note, 'utf8'), revisions[index + 1], 'the real nbfast tool performed the edit')
      completedWrites.add(turn.id)
      return completion(response, [[{ role: 'assistant', content: turn.output }], [{}, 'stop']])
    }
    assert.ok(body.tools.some(tool => tool.function?.name === 'fast_edit_batch'), 'the workspace provides the normal nbfast write tool')
    return completion(response, [[{ role: 'assistant', tool_calls: [{ index: 0, id: turn.id, type: 'function', function: {
      name: 'fast_edit_batch', arguments: JSON.stringify({
        path: filename, expectedRevision: createHash('sha256').update(revisions[index]).digest('hex'),
        edits: [{ oldText: revisions[index], newText: revisions[index + 1] }],
      }),
    } }] }], [{}, 'tool_calls']])
  } catch (error) {
    modelErrors.push(error.message)
    if (!response.headersSent) response.writeHead(500)
    response.end()
  }
})

const cleanGitEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_/iu.test(name)))
const git = (...args) => runFile('git', ['-C', workspace, ...args], { cwd: temporary, env: cleanGitEnv, windowsHide: true })

async function decideNativeRestore(confirm, response, expectedCount, expectedContent) {
  await confirm.click({ timeout })
  const prompts = await app.evaluate(async () => {
    const fixture = globalThis.checkpointApprovalFixture
    const deadline = Date.now() + 10_000
    while (!fixture.finish && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25))
    return fixture.prompts
  })
  assert.equal(prompts.length, expectedCount, 'restore asks once at the native dialog boundary')
  assert.equal(prompts.at(-1).defaultId, 0)
  assert.equal(prompts.at(-1).cancelId, 0)
  assert.equal(await readFile(note, 'utf8'), expectedContent, 'no workspace bytes change while native approval is pending')
  await app.evaluate((_, response) => {
    const fixture = globalThis.checkpointApprovalFixture
    const finish = fixture.finish
    fixture.finish = undefined
    finish({ response, checkboxChecked: false })
  }, response)
}

try {
  await Promise.all([home, userData, workspace].map(path => mkdir(path)))
  await mkdir(join(workspace, 'node_modules'))
  await writeFile(note, revisions[0])
  await writeFile(join(workspace, '.env'), 'SYNTHETIC_FIXTURE_ONLY=1\n')
  await writeFile(join(workspace, 'node_modules', 'keep.txt'), 'excluded dependency\n')
  await git('init', '--quiet')
  await git('add', '--', filename)
  await git('-c', 'user.name=Checkpoint Fixture', '-c', 'user.email=checkpoint-fixture@example.test',
    '-c', 'core.hooksPath=.git/no-fixture-hooks', '-c', 'commit.gpgSign=false', 'commit', '--quiet', '-m', 'Fixture baseline')
  const gitHead = await readFile(join(workspace, '.git', 'HEAD'))
  const gitIndex = await readFile(join(workspace, '.git', 'index'))
  const gitCommit = (await git('rev-parse', 'HEAD')).stdout

  await new Promise((resolve, reject) => { model.once('error', reject); model.listen(0, '127.0.0.1', resolve) })
  await seedPrimaryRuntimePermissionForTest({ userData })
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await writeFile(join(home, 'cordis.patch.yml'), '- id: ui-settings-account\n  config:\n    step: done\n    completion: skipped\n')
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({ 'llm-pi-ai': { providers: {
    [fixtureProvider]: { api: 'openai-completions', apiKeyEnv: 'DSH_CHECKPOINT_FIXTURE_KEY',
      baseURL: `http://127.0.0.1:${model.address().port}/v1`, models: [{ id: fixtureProvider, name: 'Checkpoints Fixture' }] },
  } } }))
  const env = Object.fromEntries(Object.entries(cleanGitEnv).filter(([name]) =>
    !/^(?:DSH_|DEEPSEEK|OPENAI|ANTHROPIC|BAI_|ELECTRON_|NODE_OPTIONS$|NODE_PATH$)|(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)(?:_|$)/iu.test(name)))
  app = await electron.launch({ executablePath: electronPath, args: [join(appDir, 'src/main.mjs')], cwd: appDir, timeout: launchTimeout,
    env: { ...env, DSH_HOME: home, DSH_DESKTOP_USER_DATA: userData, DSH_AGENTS_HOME: join(temporary, 'agents-home'),
      DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DSH_TELEMETRY_DISABLED: '1',
      DSH_CHECKPOINT_FIXTURE_KEY: credential } })
  await useChineseFixtureLocale(app)
  page = await app.firstWindow({ timeout: launchTimeout })
  await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: launchTimeout })
  await page.locator('[data-dsh-frame]').waitFor({ timeout: launchTimeout })
  await dismissRuntimeOnboarding(page)
  const sessionId = await createSessionInWorkspace(page, await createFixtureWorkspace(page, workspace))
  const conversation = page.locator(`[data-conversation-content][data-conversation-session="${sessionId}"]`)
  const composer = conversation.locator('[data-composer-card]')
  await composer.locator('button[data-dsh-relay-model-entry]').click({ timeout })
  await page.getByRole('menuitem', { name: /^(模型|Models)(?:\s|$)/u }).click({ timeout })
  await page.locator(`[role="menuitemradio"][data-dsh-relay-provider="${fixtureProvider}"]`).first().click({ timeout })
  await composer.getByRole('button', { name: /Checkpoints Fixture/u }).waitFor({ timeout })
  for (const turn of turns) {
    await composer.getByRole('textbox').fill(turn.input)
    await composer.locator('button[aria-busy]').click({ timeout })
    await conversation.getByText(turn.output, { exact: true }).waitFor({ timeout })
  }

  const footers = conversation.locator('[data-dsh-checkpoint]')
  await footers.nth(1).waitFor({ timeout })
  assert.equal(await footers.count(), 2, 'both writing turns have a checkpoint footer')
  assert.equal(completedWrites.size, 2)
  await footers.first().locator('[data-checkpoint-open]').click({ timeout })
  const review = page.locator('[data-checkpoint-dialog]')
  await review.waitFor({ timeout })
  await review.locator('[data-checkpoint-file]').filter({ hasText: filename }).first().click({ timeout })
  await review.locator('[data-checkpoint-diff-mode="split"]').click({ timeout })
  await review.locator('[data-checkpoint-diff-content="split"]').waitFor({ timeout })
  const rendered = review.locator('[data-checkpoint-pierre="ready"] diffs-container')
  await rendered.waitFor({ timeout })
  const splitText = await rendered.evaluate(node => node.shadowRoot.querySelector('pre').textContent)
  assert.match(splitText, /original lunar sample/u)
  assert.match(splitText, /first lunar sample/u)
  await review.locator('[data-checkpoint-diff-mode="unified"]').click({ timeout })
  await review.locator('[data-checkpoint-diff-content="unified"]').waitFor({ timeout })
  await review.locator('[data-checkpoint-compare="working"]').click({ timeout })
  const prepare = review.locator('[data-checkpoint-prepare="all"]')
  await review.locator(`[data-checkpoint-select-file="${filename}"]`).check({ timeout })
  await review.locator('[data-checkpoint-prepare="selected"]').click({ timeout })

  await app.evaluate(({ dialog }) => {
    const original = dialog.showMessageBox
    const fixture = { original, prompts: [], finish: undefined }
    globalThis.checkpointApprovalFixture = fixture
    dialog.showMessageBox = (...args) => {
      const options = args.at(-1)
      if (!['工作区检查点恢复', 'Workspace checkpoint restore'].includes(options.title)) return original.apply(dialog, args)
      fixture.prompts.push({ defaultId: options.defaultId, cancelId: options.cancelId })
      return new Promise(resolve => { fixture.finish = resolve })
    }
  })
  try {
    const confirm = review.locator('[data-checkpoint-confirm]')
    await decideNativeRestore(confirm, 0, 1, revisions[2])
    await review.locator('[data-checkpoint-feedback="dismissed"]').waitFor({ timeout })
    assert.equal(await readFile(note, 'utf8'), revisions[2])
    await prepare.click({ timeout })
    await decideNativeRestore(confirm, 1, 2, revisions[2])
    await review.locator('[data-checkpoint-feedback="restored"]').waitFor({ timeout })
    await review.locator('[data-checkpoint-undo]').click({ timeout })
    await decideNativeRestore(confirm, 1, 3, revisions[1])
    await confirm.waitFor({ state: 'hidden', timeout })
    await review.locator('[data-checkpoint-feedback="restored"]').waitFor({ timeout })
    assert.equal(await readFile(note, 'utf8'), revisions[2], 'undo restored the exact pre-restore bytes')
  } finally {
    await app.evaluate(({ dialog }) => {
      const fixture = globalThis.checkpointApprovalFixture
      fixture.finish?.({ response: 0, checkboxChecked: false })
      dialog.showMessageBox = fixture.original
      delete globalThis.checkpointApprovalFixture
    })
  }

  assert.deepEqual(await readFile(join(workspace, '.git', 'HEAD')), gitHead)
  assert.deepEqual(await readFile(join(workspace, '.git', 'index')), gitIndex)
  assert.equal((await git('rev-parse', 'HEAD')).stdout, gitCommit)
  assert.equal(await readFile(join(workspace, '.env'), 'utf8'), 'SYNTHETIC_FIXTURE_ONLY=1\n')
  assert.equal(await readFile(join(workspace, 'node_modules', 'keep.txt'), 'utf8'), 'excluded dependency\n')
  assert.deepEqual(modelErrors, [])
  console.log('PASS workspace checkpoint capture, scoped diff, native denial, restore, undo and Git isolation')
  console.log('Electron dialog response was simulated at the native dialog boundary')
} catch (error) {
  await page?.screenshot({ path: join(temporary, 'failure.png'), timeout: 5_000 }).catch(() => {})
  if (modelErrors.length) console.error('Synthetic model errors', modelErrors)
  throw error
} finally {
  console.log('Workspace checkpoint E2E evidence', temporary)
  try { if (app) await closeIsolatedElectron(app, { child: app.process() }) }
  finally {
    model.closeAllConnections()
    await new Promise(resolve => model.close(resolve))
  }
}
