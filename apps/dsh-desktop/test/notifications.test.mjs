import assert from 'node:assert/strict'
import test from 'node:test'

import {
  builtinsFallbackNotification,
  DesktopNotificationService,
  normalizeDesktopNotification,
} from '../src/notifications.mjs'

test('builtins fallback notification is informational and asks for no recovery decision', () => {
  const notification = builtinsFallbackNotification('a'.repeat(64))
  assert.deepEqual(notification, {
    category: 'plugin-recovery',
    id: `plugin-recovery:builtins:${'a'.repeat(16)}`,
    title: '已使用内置插件启动',
    body: '原有对话和设置仍在；应用已跳过本次未能自动修复的插件。',
  })
  assert.equal(Object.hasOwn(notification, 'deepLink'), false)
  assert.doesNotMatch(JSON.stringify(notification), /点击|选择|迁移|隔离|安全模式/u)
})

test('missing credentials notification explains that no model call was made', () => {
  const notification = builtinsFallbackNotification('b'.repeat(64), 'missing-credentials')
  assert.equal(notification.title, '自动修复未启用')
  assert.match(notification.body, /模型 Key/u)
  assert.match(notification.body, /填写 Key/u)
  assert.doesNotMatch(JSON.stringify(notification), /secret|api.?key=/iu)
})
test('structured notifications validate category, id, bounded text, and allowlisted deep links', () => {
  assert.deepEqual(normalizeDesktopNotification({
    category: 'task',
    id: 'task:review-1:complete',
    title: 'Task complete',
    body: 'Review finished.',
    deepLink: 'dsh://task/review-1',
  }), {
    category: 'task',
    id: 'task:review-1:complete',
    title: 'Task complete',
    body: 'Review finished.',
    deepLink: { kind: 'task', id: 'review-1', href: 'dsh://task/review-1' },
  })
  for (const value of [
    { category: 'command', id: 'x', title: 'X', body: 'Y' },
    { category: 'task', id: '../x', title: 'X', body: 'Y' },
    { category: 'task', id: 'x', title: '', body: 'Y' },
    { category: 'task', id: 'x', title: 'X', body: 'Y', deepLink: 'dsh://command/run' },
    { category: 'task', id: 'x', title: 'X', body: 'Y', path: 'C:\\secret' },
  ]) {
    assert.throws(() => normalizeDesktopNotification(value), /notification|deep link/u)
  }
})

test('notification service suppresses foreground, duplicate, and rapid category notifications', async () => {
  let now = 10_000
  let foreground = true
  const shown = []
  const service = new DesktopNotificationService({
    now: () => now,
    isForeground: () => foreground,
    showNative: async (notification) => { shown.push(notification); return true },
  })
  const first = { category: 'task', id: 'task:one', title: 'Done', body: 'One done' }
  assert.deepEqual(await service.show(first), { shown: false, reason: 'foreground' })
  foreground = false
  assert.deepEqual(await service.show(first), { shown: true })
  assert.deepEqual(await service.show(first), { shown: false, reason: 'duplicate' })
  assert.deepEqual(await service.show({ ...first, id: 'task:two' }), { shown: false, reason: 'rate-limited' })
  now += 15_000
  assert.deepEqual(await service.show({ ...first, id: 'task:two' }), { shown: true })
  assert.equal(shown.length, 2)
})

test('notification clicks route only the already validated structured deep link', async () => {
  let click
  const routed = []
  const service = new DesktopNotificationService({
    showNative: async (notification) => { click = notification.onClick; return true },
    routeDeepLink: async (link) => { routed.push(link) },
  })
  await service.show({
    category: 'preset',
    id: 'preset:portable:complete',
    title: 'Preset imported',
    body: 'Portable is ready.',
    deepLink: 'dsh://extensions',
  })
  click()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(routed, [{ kind: 'extensions', href: 'dsh://extensions' }])
})

test('rollback-failed fallback notification reports the incomplete restore honestly', () => {
  const notification = builtinsFallbackNotification('c'.repeat(64), 'rollback-failed')
  assert.equal(notification.title, '插件修复已回滚')
  assert.match(notification.body, /未能完全复原/u)
  assert.match(notification.body, /内置插件启动/u)
  assert.doesNotMatch(JSON.stringify(notification), /secret|api.?key=|C:\\Users/u)
})
