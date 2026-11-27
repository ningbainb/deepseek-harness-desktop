/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { installRemoteAccessHintEnhancer } from '../src/client/remote-access-hint.ts'

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.lang = ''
})

describe('installRemoteAccessHintEnhancer', () => {
  it('waits for the exact remote row configure action to become available', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <div role="dialog"><div role="alert" data-dsh-remote-lan-required><p>Local LAN access</p></div></div>
      <main data-plugin-panel aria-busy="true"></main>`
    const openPluginSettings = vi.fn(() => true)
    const configure = vi.fn()
    const toggle = vi.fn()
    const expand = vi.fn()
    const dispose = installRemoteAccessHintEnhancer(document, { openPluginSettings })
    try {
      const jump = document.querySelector<HTMLButtonElement>('[data-dsh-remote-open-settings]')
      expect(jump).not.toBeNull()
      jump?.click()
      await vi.advanceTimersByTimeAsync(800)
      expect(openPluginSettings).toHaveBeenCalledOnce()
      const panel = document.querySelector('main')!
      panel.innerHTML = '<li data-plugin-row="include:web-ui-remote-web-ui"><button role="switch">On</button></li>'
      panel.querySelector('button')!.addEventListener('click', toggle)
      const configureButton = document.createElement('button')
      configureButton.type = 'button'
      configureButton.setAttribute('aria-label', 'Configure remote access')
      configureButton.addEventListener('click', configure)
      panel.querySelector('li')!.prepend(configureButton)
      await Promise.resolve()
      expect(configure).not.toHaveBeenCalled()
      panel.removeAttribute('aria-busy')
      await Promise.resolve()
      expect(configure).toHaveBeenCalledOnce()
      expect(toggle).not.toHaveBeenCalled()
      panel.innerHTML = '<section data-plugin-row-detail="@linxin666/dsh-web-all#web-ui-remote-web-ui"><div data-plugin-config><button aria-expanded="false">Remote access settings</button></div></section>'
      panel.querySelector('button')!.addEventListener('click', expand)
      await Promise.resolve()
      expect(expand).toHaveBeenCalledOnce()
    } finally {
      dispose()
      vi.useRealTimers()
    }
  })

  it('rewrites stale 127.0.0.1 instructions and jumps to plugin settings on click', async () => {
    document.documentElement.lang = 'zh-CN'
    const openPluginSettings = vi.fn(() => true)
    const onClose = vi.fn()
    const dispose = installRemoteAccessHintEnhancer(document, { openPluginSettings })

    try {
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      const closeBtn = document.createElement('button')
      closeBtn.setAttribute('aria-label', '关闭远程访问面板')
      closeBtn.addEventListener('click', onClose)
      const alert = document.createElement('div')
      alert.setAttribute('role', 'alert')
      const title = document.createElement('p')
      title.textContent = '此功能需要局域网绑定或公网地址才能使用'
      const hint = document.createElement('p')
      hint.textContent = '当前服务仅绑定在 127.0.0.1 且未配置公网地址，手机无法访问。请在本插件的设置卡片中打开“局域网访问”（装在全家桶里时在「设置 → Web 插件 → 远程访问设置」）。'
      alert.append(title, hint)
      dialog.append(closeBtn, alert)
      document.body.append(dialog)

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hint.textContent).toContain('你可以直接前往插件设置开启「局域网访问」')
      const jumpBtn = dialog.querySelector<HTMLButtonElement>('[data-dsh-remote-open-settings="true"]')
      expect(jumpBtn).not.toBeNull()

      jumpBtn!.click()
      expect(onClose).toHaveBeenCalledTimes(1)
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(openPluginSettings).toHaveBeenCalledTimes(1)
    } finally {
      dispose()
    }
  })
})
