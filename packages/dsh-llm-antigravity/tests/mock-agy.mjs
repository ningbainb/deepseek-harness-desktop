import { createInterface } from 'node:readline'
const args = process.argv.slice(2)
const write = value => process.stdout.write(JSON.stringify(value) + '\n')
const lines = createInterface({ input: process.stdin })
if (args[0] === 'signed-out') {
  console.error('Please sign in')
  process.exitCode = 1
} else if (args[0] === 'wait') {
  setInterval(() => {}, 1000)
} else if (args[0] === 'models') {
  console.log('gemini-test\tGemini Test')
} else if (args.includes('acp')) {
  for await (const { method, id, params } of (async function* () {
    for await (const line of lines) yield JSON.parse(line)
  })()) {
    let result = {}
    if (method === 'initialize') result = { protocolVersion: 1 }
    if (method === 'session/new') result = { sessionId: 'session', models: { currentModelId: 'gemini-test' } }
    if (method === 'session/prompt') {
      if (params.prompt[0].text.includes('attempt-native-tool')) {
        write({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: params.sessionId,
          update: { sessionUpdate: 'tool_call', title: 'Native tool' },
        } })
        continue
      }
      for (const [sessionUpdate, text] of [['agent_thought_chunk', 'thinking'], ['agent_message_chunk', 'hello back']]) {
        write({ jsonrpc: '2.0', method: 'session/update', params: {
          sessionId: params.sessionId, update: { sessionUpdate, content: { type: 'text', text } },
        } })
      }
      result = { stopReason: 'end_turn' }
    }
    write({ jsonrpc: '2.0', id, result })
  }
} else {
  for await (const line of lines) {
    const content = JSON.parse(line).message.content
    if (content.includes('attempt-native-tool')) {
      write({ event: 'init', init: { tools: ['run_command'] } })
      write({ event: 'step_update', step_update: { step_type: 'run_command' } })
      continue
    }
    const text = content.includes('"name":"lookup"')
      ? '<dsh-tool-call>{"name":"lookup","arguments":{"key":"value"}}</dsh-tool-call>'
      : 'hello back'
    for (const [step_type, text_delta] of [['thinking', 'thinking'], ['agent_response', text]]) {
      write({ event: 'step_update', step_update: { step_type, text_delta } })
    }
    write({ event: 'result', result: { status: 'SUCCESS', usage: { input_tokens: 15, output_tokens: 3 } } })
  }
}
lines.close()
