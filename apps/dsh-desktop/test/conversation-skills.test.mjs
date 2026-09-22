import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyConversationSkills,
  buildSkillTrigger,
  CONVERSATION_SKILLS_CSS,
  CONVERSATION_SKILLS_SCRIPT,
  filterConversationSkills,
  groupConversationSkills,
  insertSkillTrigger,
  installConversationSkills,
  normalizeConversationSkills,
  normalizeSkillDiagnostics,
} from '../src/conversation-skills.mjs'

test('skill inventory hides shadowed entries, deduplicates names, and pins recent use', () => {
  const skills = normalizeConversationSkills([
    { name: 'playwright', description: 'Browser automation', source: 'user-agents', shadowed: false },
    { name: 'code', description: 'Coding workflow', source: 'user-agents', shadowed: false },
    { name: 'playwright', description: 'Shadow copy', source: 'project-agents', shadowed: true },
    { name: '', description: 'invalid', source: 'unknown', shadowed: false },
  ], ['code'])

  assert.deepEqual(skills.map((skill) => skill.name), ['code', 'playwright'])
  assert.equal(skills[0].recent, true)
  assert.equal(skills[1].recent, false)
  assert.deepEqual(filterConversationSkills(skills, 'browser').map((skill) => skill.name), ['playwright'])
  assert.deepEqual(filterConversationSkills(skills, 'CODE').map((skill) => skill.name), ['code'])
})

test('recent skills stay duplicated in the complete skills group', () => {
  const skills = normalizeConversationSkills([
    { name: 'playwright', source: 'user-agents' },
    { name: 'code', source: 'user-dsh' },
  ], ['code'])
  const groups = groupConversationSkills(skills)
  assert.deepEqual(groups.map((group) => group.label), ['最近使用', '全部技能'])
  assert.deepEqual(groups[0].skills.map((skill) => skill.name), ['code'])
  assert.deepEqual(groups[1].skills.map((skill) => skill.name), ['code', 'playwright'])
})

test('skill trigger uses a stable natural-language invocation', () => {
  assert.equal(buildSkillTrigger('playwright'), '使用 playwright 技能：')
  assert.throws(() => buildSkillTrigger('  '), /skill name/u)
})

test('skill diagnostics are bounded, deduplicated, and renderer-safe', () => {
  assert.deepEqual(normalizeSkillDiagnostics([
    { error: 'missing SKILL.md' },
    { error: ' missing SKILL.md ' },
    { error: 'symbolic link ignored' },
    { path: 'private/path' },
  ]), ['missing SKILL.md', 'symbolic link ignored'])
  assert.equal(normalizeSkillDiagnostics(Array.from({ length: 30 }, (_, index) => ({ error: `error-${index}` }))).length, 20)
})

test('skill trigger inserts at the current selection and emits a native input event', () => {
  const events = []
  const textarea = {
    value: '先分析后执行',
    readOnly: false,
    disabled: false,
    selectionStart: 3,
    selectionEnd: 3,
    dispatchEvent: (event) => events.push(event.type),
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end },
    focus() { this.focused = true },
  }
  const result = insertSkillTrigger(textarea, 'code')
  assert.equal(result.inserted, true)
  assert.equal(textarea.value, '先分析\n使用 code 技能：\n后执行')
  assert.deepEqual(events, ['input'])
  assert.equal(textarea.focused, true)
  assert.equal(textarea.selectionStart, '先分析\n使用 code 技能：\n'.length)
})

test('skill trigger uses the native contenteditable insertion path used by DSH 4', () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const selection = { rangeCount: 1, anchorNode: {}, removeAllRanges() {}, addRange() {} }
  globalThis.window = { getSelection: () => selection }
  globalThis.document = { execCommand(command, _showUi, value) {
    assert.equal(command, 'insertText')
    editor.textContent += value
    return true
  } }
  const editor = {
    isContentEditable: true,
    textContent: '已有内容',
    contains: () => true,
    focus() { this.focused = true },
  }
  try {
    assert.deepEqual(insertSkillTrigger(editor, 'code'), {
      inserted: true,
      value: '已有内容\n使用 code 技能：',
    })
    assert.equal(editor.focused, true)
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
  }
})

test('skills surface exposes accessible menu, search, keyboard, and theme rules', () => {
  assert.match(CONVERSATION_SKILLS_CSS, /max-height: 320px/u)
  assert.match(CONVERSATION_SKILLS_CSS, /overflow-y: auto/u)
  assert.match(CONVERSATION_SKILLS_CSS, /prefers-color-scheme: dark/u)
  assert.match(CONVERSATION_SKILLS_SCRIPT, /aria-label.*技能库/u)
  assert.match(CONVERSATION_SKILLS_SCRIPT, /role.*listbox/u)
  assert.match(CONVERSATION_SKILLS_SCRIPT, /ArrowDown/u)
  assert.match(CONVERSATION_SKILLS_SCRIPT, /ArrowUp/u)
  assert.match(CONVERSATION_SKILLS_SCRIPT, /Escape/u)
  assert.match(CONVERSATION_SKILLS_SCRIPT, /MutationObserver/u)
  assert.match(CONVERSATION_SKILLS_SCRIPT, /listSkills/u)
  assert.match(CONVERSATION_SKILLS_SCRIPT, /aria-label="指令"/u)
  assert.match(CONVERSATION_SKILLS_SCRIPT, /aria-label="命令"/u)
  assert.match(CONVERSATION_SKILLS_SCRIPT, /aria-label="Commands"/u)
  assert.match(CONVERSATION_SKILLS_SCRIPT, /aria-label="添加文件或运行命令"/u)
  assert.match(CONVERSATION_SKILLS_SCRIPT, /aria-label="Add files or run commands"/u)
  assert.doesNotMatch(CONVERSATION_SKILLS_SCRIPT, /innerHTML\s*=/u)
})

test('conversation skills injects author CSS and an idempotent page controller after navigation', async () => {
  const calls = []
  const listeners = new Map()
  const webContents = {
    isDestroyed: () => false,
    insertCSS: async (css, options) => calls.push(['css', css, options]),
    executeJavaScript: async (script) => calls.push(['script', script]),
    on: (name, listener) => listeners.set(name, listener),
    removeListener: (name, listener) => {
      if (listeners.get(name) === listener) listeners.delete(name)
    },
  }

  assert.equal(await applyConversationSkills(webContents), true)
  assert.deepEqual(calls, [
    ['css', CONVERSATION_SKILLS_CSS, { cssOrigin: 'author' }],
    ['script', CONVERSATION_SKILLS_SCRIPT],
  ])

  const dispose = installConversationSkills({ browserWindow: { webContents } })
  assert.equal(typeof listeners.get('did-finish-load'), 'function')
  dispose()
  assert.equal(listeners.has('did-finish-load'), false)
})
