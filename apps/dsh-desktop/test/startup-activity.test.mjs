import assert from 'node:assert/strict'
import test from 'node:test'
import { formatStartupActivity } from '../src/startup-activity.mjs'

test('formatStartupActivity formats recognized startup activities into clear subtitles', () => {
  assert.deepEqual(
    formatStartupActivity('stdout', '[im-qqbot] apply() called'),
    { text: '正在初始化 QQ 机器人扩展与连接服务...', category: 'qqbot', raw: '[im-qqbot] apply() called' },
  )

  assert.deepEqual(
    formatStartupActivity('stdout', '[ui-skin-center] legacy bridge: no legacy managed skin state'),
    { text: '正在载入个性化主题与皮肤中心...', category: 'skin', raw: '[ui-skin-center] legacy bridge: no legacy managed skin state' },
  )

  assert.deepEqual(
    formatStartupActivity('stdout', '[plugins] compatibility diagnostic ready=19ms incompatible=0'),
    { text: '正在校验社区扩展插件兼容性...', category: 'plugins', raw: '[plugins] compatibility diagnostic ready=19ms incompatible=0' },
  )

  assert.deepEqual(
    formatStartupActivity('stdout', 'dsh web: http://127.0.0.1:54085'),
    { text: '本地服务已就绪，正在渲染探索界面...', category: 'ready', raw: 'dsh web: http://127.0.0.1:54085' },
  )

  assert.deepEqual(
    formatStartupActivity('stdout', 'loading @liustack/modlens package'),
    { text: '正在载入扩展: @liustack/modlens', category: 'plugin', raw: 'loading @liustack/modlens package' },
  )
})

test('formatStartupActivity ignores non-string or whitespace-only lines', () => {
  assert.equal(formatStartupActivity('stdout', undefined), undefined)
  assert.equal(formatStartupActivity('stdout', '   \n  '), undefined)
})
