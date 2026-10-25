import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const require = createRequire(import.meta.url)
const marketRoot = dirname(require.resolve('dsh-agent-plugins-market/package.json'))
const loadMarket = path => import(pathToFileURL(join(marketRoot, path)).href)

test('actual market translation reads send no HTTP while disabled and reach a controlled endpoint only after explicit enablement', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-market-translation-safety-'))
  const requests = []
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk.toString()
    requests.push({ method: request.method, path: request.url, body: JSON.parse(body) })
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(requests.at(-1).body.texts.map(() => '这是本地测试译文。')))
  })
  let service
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const endpoint = `http://127.0.0.1:${server.address().port}/translate`
    const { TranslationService } = await loadMarket('lib/packages/market-translation/src/application/translation/service.js')
    let enabled = false
    service = new TranslationService({
      dataRoot: home, enabled: () => enabled, providerIdentity: () => 'desktop-loopback-control',
      providers: [{
        id: 'llm', available: () => true,
        async translate({ texts, locale, signal }) {
          const response = await fetch(endpoint, { method: 'POST', signal,
            headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texts, locale }) })
          assert.equal(response.ok, true)
          return response.json()
        },
      }],
    })
    await service.load()
    const fields = { name: 'fixture-skill', description: 'The suite description must stay local.' }
    const document = '# Fixture\n\nThe suite document must stay local.\n\n```js\nrun()\n```\n'
    assert.deepEqual(service.translateFields('skills', 'fixture', fields, 'zh'), { fields: {}, pending: 0 })
    assert.equal(service.translateDocument('skills', 'fixture', document, 'zh').text, document)
    assert.equal(await service.settle(5_000), true)
    assert.deepEqual(requests, [])
    enabled = true
    service.onEnabledChanged()
    assert.equal(service.translateFields('skills', 'fixture', fields, 'zh').pending, 1)
    assert.equal(await service.settle(5_000), true)
    assert.equal(requests.length, 1, 'positive control must observe a real loopback HTTP request')
    assert.equal(requests[0].method, 'POST')
    assert.equal(requests[0].path, '/translate')
    assert.deepEqual(requests[0].body.texts, [fields.description])
    assert.equal(service.translateFields('skills', 'fixture', fields, 'zh').fields.translatedDescription, '这是本地测试译文。')
    enabled = false
    service.onEnabledChanged()
    assert.deepEqual(service.translateFields('skills', 'fixture', fields, 'zh'), { fields: {}, pending: 0 })
    assert.equal(service.translateFields('skills', 'second', { description: 'A second uncached description stays local.' }, 'zh').pending, 0)
    assert.equal(await service.settle(5_000), true)
    assert.equal(requests.length, 1, 'disabling again must stop uncached provider work')
  } finally {
    service?.dispose()
    await new Promise(resolve => server.close(resolve))
    await rm(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
})

test('actual SDK tool registry exposes public feedback only after opt-in and revokes it on disable and disposal', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-market-feedback-safety-'))
  const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
  const toolsRequire = createRequire(require.resolve('@deepseek-ai/dsh-tools/package.json'))
  const { default: SystemPrompt } = await import(pathToFileURL(toolsRequire.resolve('@deepseek-ai/dsh-system-prompt')).href)
  const { default: ToolRuntime } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-tools')).href)
  const { MarketSettingsNamespace } = await loadMarket('lib/packages/market-bundle/src/platform/settings-namespace.js')
  const context = new Context()
  let namespace
  try {
    await context.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false })
    await context.plugin(ToolRuntime, { mode: 'native' })
    const stored = {}
    const refs = Object.fromEntries(['mcpEnhanced', 'scanProjectLayouts', 'downloadRegion', 'feedbackEnabled',
      'autoUpdateSources', 'translationEnabled', 'agentPresetsEnabled'].map(key => [key, { get: () => stored[key] }]))
    namespace = new MarketSettingsNamespace(context, refs, home, { t: key => key }, {
      setScanProjectLayouts: async () => {}, setAutoUpdateSources() {}, refreshMcpMounts() {}, syncTranslationEnabled() {},
    })
    namespace.mount()
    assert.equal(context.tools.get('report_market_issue'), undefined)
    assert.equal(context.tools.schemas().some(tool => tool.name === 'report_market_issue'), false)
    stored.feedbackEnabled = true
    context.emit('loader/volatile-update', [])
    assert.equal(context.tools.get('report_market_issue')?.name, 'report_market_issue', 'positive control uses the real SDK registration')
    stored.feedbackEnabled = false
    context.emit('loader/volatile-update', [])
    assert.equal(context.tools.get('report_market_issue'), undefined)
    assert.equal(context.tools.schemas().some(tool => tool.name === 'report_market_issue'), false)
    stored.feedbackEnabled = true
    context.emit('loader/volatile-update', [])
    assert.ok(context.tools.get('report_market_issue'))
    namespace.dispose()
    assert.equal(context.tools.get('report_market_issue'), undefined)
  } finally {
    namespace?.dispose()
    await context.fiber.dispose()
    await rm(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
})
