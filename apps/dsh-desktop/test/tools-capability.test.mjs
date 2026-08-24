import assert from 'node:assert/strict'
import test from 'node:test'

import {
  configuredToolsCapability,
  prepareToolsRequest,
  repairToolsCapability,
  UnsupportedToolsError,
} from '../src/tools-capability.mjs'

const TOOL = Object.freeze({
  name: 'read',
  description: 'Read a file',
  parameters: { type: 'object', properties: {} },
})

function request(messages = [{ role: 'user', content: 'hello' }]) {
  return {
    provider: 'company-gateway',
    model: 'gateway-model',
    messages,
    tools: [TOOL],
    temperature: 0.2,
  }
}

test('auto and native preserve the request-side tools shape', () => {
  const options = request()

  for (const capability of ['auto', 'native']) {
    const prepared = prepareToolsRequest(options, {
      capability,
      provider: options.provider,
      model: options.model,
    })
    assert.strictEqual(prepared.options, options)
    assert.equal(prepared.diagnostics.stream, true)
    assert.equal(prepared.diagnostics.toolsRequested, 1)
    assert.equal(prepared.diagnostics.toolsSent, 1)
    assert.equal(prepared.diagnostics.toolsCapability, capability)
    assert.equal(prepared.diagnostics.operation, 'chat')
    assert.equal(prepared.diagnostics.messageCount, 1)
    assert.deepEqual(options.tools, [TOOL])
  }
})

test('none omits tools for ordinary chat without mutating GenerateOptions', () => {
  const options = request()
  const prepared = prepareToolsRequest(options, {
    capability: 'none',
    provider: options.provider,
    model: options.model,
  })

  assert.notStrictEqual(prepared.options, options)
  assert.equal(Object.hasOwn(prepared.options, 'tools'), false)
  assert.deepEqual(options.tools, [TOOL])
  assert.equal(prepared.diagnostics.toolsRequested, 1)
  assert.equal(prepared.diagnostics.toolsSent, 0)
  assert.equal(prepared.diagnostics.toolHistory, false)
})

test('tools:none omits an empty tools array rather than sending an empty array', () => {
  const prepared = prepareToolsRequest({ messages: request().messages, tools: [] }, {
    capability: 'none',
    operation: 'chat',
  })

  assert.equal(Object.hasOwn(prepared.options, 'tools'), false)
  assert.equal(prepared.diagnostics.toolsRequested, 0)
  assert.equal(prepared.diagnostics.toolsSent, 0)
})

test('none rejects tool history with a stable provider-independent code', () => {
  assert.throws(
    () => prepareToolsRequest(request([{
      role: 'assistant',
      content: [{ type: 'tool-call', id: 'call-1', name: 'read', arguments: '{}' }],
    }]), { capability: 'none' }),
    (error) => error instanceof UnsupportedToolsError && error.code === 'UNSUPPORTED_TOOLS',
  )
})

test('capability is selected by route, not by model name or endpoint', () => {
  const settings = {
    'llm-pi-ai': {
      providers: {
        'company-gateway': {
          baseURL: 'https://gateway.example/v1',
          toolsCapability: 'none',
          models: [{ id: 'any-model' }],
        },
      },
    },
  }

  assert.equal(configuredToolsCapability(settings, {
    provider: 'company-gateway',
    model: 'first-model',
  }), 'none')
  assert.equal(configuredToolsCapability(settings, {
    provider: 'company-gateway',
    model: 'different-model',
  }), 'none')
})

test('tools:none is not eligible for model repair', () => {
  assert.deepEqual(repairToolsCapability('none'), {
    compatible: false,
    reason: 'unsupported-tools',
    toolsCapability: 'none',
  })
  assert.equal(repairToolsCapability('auto').compatible, true)
})
