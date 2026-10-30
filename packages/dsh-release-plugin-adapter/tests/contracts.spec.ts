import { describe, expect, it } from 'vitest'
import { assessPlugin } from '../src/core/contracts.ts'

describe('release plugin prerequisites', () => {
  it('lists precise missing prompt services without calling model or session operations', () => {
    const services = { connection: { fetch: { register() {} } }, agents: { get() {} } }
    expect(assessPlugin('prompt-pilot', services).missing).toEqual([
      'tools.register', 'llm.resolveModelInfo', 'llm.stream', 'sessionProjections.register',
      'sessionProjections.stateOf', 'sessionController.resolveAgent', 'sessionController.modelCatalog',
    ])
  })
  it('requires the dafeiyu trust fence as well as route and credential methods', () => {
    expect(assessPlugin('dafeiyu-pet', { webServer: { register() {}, tapIndex() {} }, credentials: { resolve() {}, set() {} }, connection: {} }))
      .toMatchObject({ status: 'waiting', missing: ['connection.requestRejection'] })
  })
  it('does not infer browser availability from the existing AionUI or official browser service', () => {
    expect(assessPlugin('builtin-browser', { browserUse: {}, sidebarRightTabs: {} }).missing)
      .toContain('browser.registerBrowserProvider')
  })
  it('reports contract readiness only, never acceptance or process readiness', () => {
    const result = assessPlugin('builtin-browser', { browser: { registerBrowserProvider() {} }, tools: { register() {} }, systemPrompt: { section() {} } })
    expect(result).toMatchObject({ status: 'contracts-present', missing: [] })
    expect(result).not.toHaveProperty('accepted')
  })
})
