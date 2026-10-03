import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import { setImmediate as tick } from 'node:timers/promises'
import vm from 'node:vm'

import { LEGACY_CONTEXT_SUMMARY_PROMPT } from '../src/ui/legacy-context-guide.mjs'

const { JSDOM } = createRequire(new URL('../../../packages/dsh-web-ui-settings/package.json', import.meta.url))('jsdom')
const html = await readFile(new URL('../src/ui/extensions.html', import.meta.url), 'utf8')
const source = await readFile(new URL('../src/ui/extensions.mjs', import.meta.url), 'utf8')
const begin = source.indexOf("const legacyContextPrompt = document.querySelector('#legacy-context-prompt')")
const end = source.indexOf("document.querySelector('#reset-profile-env')", begin)
assert.ok(begin >= 0 && end > begin)
const handler = source.slice(begin, end)

test('context summary guidance retains the existing import and requires review without uploading data', async () => {
  const dom = new JSDOM(html)
  const copied = []
  const messages = []
  try {
    assert.ok(dom.window.document.querySelector('#open-conversation-import'))
    assert.match(dom.window.document.querySelector('#legacy-context-guide').textContent, /不删除、不覆盖/u)
    assert.match(dom.window.document.querySelector('#legacy-context-guide').textContent, /不自动上传，不自动调用模型/u)
    vm.runInNewContext(handler, {
      document: dom.window.document,
      navigator: { clipboard: { writeText: async value => copied.push(value) } },
      LEGACY_CONTEXT_SUMMARY_PROMPT,
      notify: message => messages.push(message),
    })
    assert.deepEqual(copied, [])
    const textarea = dom.window.document.querySelector('#legacy-context-prompt')
    assert.equal(textarea.readOnly, true)
    assert.equal(textarea.value, LEGACY_CONTEXT_SUMMARY_PROMPT)
    dom.window.document.querySelector('#copy-legacy-context-prompt').click()
    await tick()
    assert.deepEqual(copied, [LEGACY_CONTEXT_SUMMARY_PROMPT])
    assert.match(messages[0], /先审阅并脱敏/u)
    assert.match(LEGACY_CONTEXT_SUMMARY_PROMPT, /不要执行命令、调用工具或访问链接/u)
    assert.match(LEGACY_CONTEXT_SUMMARY_PROMPT, /不声称恢复原历史/u)
  } finally {
    dom.window.close()
  }
})

test('clipboard failure selects the prompt for manual copying without claiming success', async () => {
  const dom = new JSDOM(html)
  const messages = []
  try {
    vm.runInNewContext(handler, {
      document: dom.window.document,
      navigator: { clipboard: { writeText: async () => { throw new Error('denied') } } },
      LEGACY_CONTEXT_SUMMARY_PROMPT,
      notify: (message, failure) => messages.push({ message, failure }),
    })
    dom.window.document.querySelector('#copy-legacy-context-prompt').click()
    await tick()
    const textarea = dom.window.document.querySelector('#legacy-context-prompt')
    assert.equal(dom.window.document.activeElement, textarea)
    assert.equal(textarea.selectionEnd - textarea.selectionStart, LEGACY_CONTEXT_SUMMARY_PROMPT.length)
    assert.equal(messages.length, 1)
    assert.equal(messages[0].failure, true)
    assert.match(messages[0].message, /自动复制失败/u)
  } finally {
    dom.window.close()
  }
})
