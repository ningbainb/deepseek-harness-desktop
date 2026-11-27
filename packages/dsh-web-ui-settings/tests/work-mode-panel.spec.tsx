/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfficeAppsComposerTrigger, OfficeStarterDock } from '../src/client/work-mode/OfficeAppsComposerBar.tsx'
import { workModeEn, workModeZh, type WorkModeLocaleKey } from '../src/client/work-mode/locales.ts'
import { openExternalUrl as openDesktopExternalUrl } from '../src/client/open-external.ts'
import { EXPERIENCE_MODE_STORAGE_KEY, officeAppsStore, type WorkModeSnapshot } from '../src/client/work-mode/office-apps-store.ts'
import { installSidebarModeSwitcher } from '../src/client/work-mode/sidebar-mode-switcher.ts'

afterEach(() => {
  cleanup()
  officeAppsStore.resetModalForTests()
  officeAppsStore.seedSnapshot(undefined)
  officeAppsStore.setExperienceMode('dev')
  localStorage.clear()
  vi.unstubAllGlobals()
})

const EMOJI_PATTERN = /(?:\p{Extended_Pictographic}|\uFE0F)/u

const SAMPLE_SNAPSHOT: WorkModeSnapshot = {
  catalogVersion: '2026.11.25-1',
  workOfficePresetId: 'work-office',
  connectedCount: 1,
  items: [
    {
      entry: {
        id: 'feishu',
        name: { zh: '飞书', en: 'Feishu / Lark' },
        summary: { zh: '读写飞书文档与日程', en: 'Feishu docs and calendar' },
        category: 'office-suite',
        maintainer: 'official',
        officialUrls: { docs: 'https://open.feishu.cn/', repo: 'https://github.com/larksuite/cli' },
        drivers: [{ kind: 'cli', id: 'feishu-cli', binary: 'lark-cli' }],
        auth: {
          mode: 'cli-native',
          guideSteps: { zh: ['安装 lark-cli 并登录'], en: ['Install lark-cli and login'] },
          cliLoginCommand: ['lark-cli', 'auth', 'login'],
        },
        examples: [{ title: { zh: '整理飞书纪要', en: 'Summarize Feishu notes' }, prompt: { zh: '整理今天飞书会议纪要', en: 'Summarize today Feishu notes' } }],
      },
      config: { enabled: false, selectedDriverId: 'feishu-cli', activeProfileId: 'default', profiles: {} },
      status: 'not_installed',
      activeDriver: { kind: 'cli', id: 'feishu-cli' },
    },
    {
      entry: {
        id: 'tencent-docs',
        name: { zh: '腾讯文档', en: 'Tencent Docs' },
        summary: { zh: '远程 MCP 读写腾讯文档', en: 'Remote MCP for Tencent Docs' },
        category: 'meeting-docs',
        maintainer: 'official',
        officialUrls: { docs: 'https://docs.qq.com/open/document/mcp/' },
        drivers: [{ kind: 'mcp-remote', id: 'tencent-docs-mcp', url: 'https://mcp.docs.qq.com/mcp' }],
        auth: {
          mode: 'personal-token',
          quickAuthUrl: 'https://docs.qq.com/open/auth/mcp.html',
          guideSteps: { zh: ['打开授权页复制 Token'], en: ['Open auth page and copy token'] },
          fields: [{ key: 'token', label: { zh: '访问令牌', en: 'Token' }, fieldType: 'password', required: true, secret: true }],
        },
        examples: [{ title: { zh: '生成周报', en: 'Create weekly report' }, prompt: { zh: '新建腾讯文档周报', en: 'Create Tencent Docs weekly report' } }],
      },
      config: { enabled: true, selectedDriverId: 'tencent-docs-mcp', activeProfileId: 'default', profiles: {}, consentAccepted: true },
      status: 'connected',
      activeDriver: { kind: 'mcp-remote', id: 'tencent-docs-mcp' },
    },
  ],
}

describe('Unified Office Apps Integration & Experience Mode Switcher', () => {
  it('releases the native composer dock as soon as the first turn is admitted', () => {
    officeAppsStore.seedSnapshot(SAMPLE_SNAPSHOT)
    officeAppsStore.setExperienceMode('office')
    let awaitingFirstTurn = false
    const useSession = (select: (session: { blank: boolean; running: boolean; awaitingFirstTurn: boolean }) => boolean) =>
      select({ blank: true, running: false, awaitingFirstTurn })
    const layout = () => <div>
      <div data-composer-card><OfficeAppsComposerTrigger
        t={key => workModeZh[key]} locale="zh" useSession={useSession}
        onOpenExtensions={vi.fn()} onOpenExternalUrl={vi.fn()} onRunPrompt={vi.fn()} />
      </div>
      <div data-composer-dock><button type="button">340 tok</button></div>
    </div>
    const { container, rerender } = render(layout())
    const chips = () => container.querySelector('[data-dsh-office-starter-dock]')
    expect(chips()).not.toBeNull()
    awaitingFirstTurn = true
    rerender(layout())
    expect(chips()).toBeNull()
    expect(screen.getByRole('button', { name: '340 tok' })).toBeTruthy()
    expect(container.querySelector('[data-dsh-office-apps-trigger]')).not.toBeNull()
  })

  it('shows the composer entry only in office mode, including after switching modes', () => {
    officeAppsStore.seedSnapshot(SAMPLE_SNAPSHOT)
    const { container } = render(<OfficeAppsComposerTrigger
      t={key => workModeZh[key]} locale="zh" onOpenExtensions={vi.fn()}
      onOpenExternalUrl={vi.fn()} onRunPrompt={vi.fn()} />)
    const trigger = () => container.querySelector('[data-dsh-office-apps-trigger]')
    expect(trigger()).toBeNull()
    act(() => officeAppsStore.setExperienceMode('office'))
    expect(trigger()).not.toBeNull()
    act(() => officeAppsStore.setExperienceMode('dev'))
    expect(trigger()).toBeNull()
  })

  it('contains strictly zero emoji in bilingual dictionaries', () => {
    for (const dict of [workModeZh, workModeEn]) {
      for (const value of Object.values(dict)) {
        expect(EMOJI_PATTERN.test(value)).toBe(false)
      }
    }
  })

  it('mounts composer trigger & modal in native chat, filters services, and runs linear install + web auth', async () => {
    const runPrompt = vi.fn()
    const openExtensions = vi.fn()
    const openExternalUrl = vi.fn()
    const t = (key: WorkModeLocaleKey) => workModeZh[key]

    const fetchMock = vi.fn(async (input: string) => {
      if (input.endsWith('/detect')) {
        return { ok: true, json: async () => ({ installed: false, driverId: 'feishu-cli', driverKind: 'cli' }) }
      }
      if (input.endsWith('/install')) {
        const nextSnap: WorkModeSnapshot = {
          ...SAMPLE_SNAPSHOT,
          items: SAMPLE_SNAPSHOT.items.map(it => it.entry.id === 'feishu' ? { ...it, status: 'installed_unauthenticated' } : it),
        }
        return {
          ok: true,
          json: async () => ({
            result: { ok: true, installed: true, version: 'lark-cli 1.0.0' },
            snapshot: nextSnap,
          }),
        }
      }
      if (input.endsWith('/login')) {
        return {
          ok: true,
          json: async () => ({
            login: {
              connectorId: 'feishu',
              kind: 'cli-browser',
              state: 'pending',
              authUrl: 'https://accounts.feishu.cn/device?code=WXYZ-5678',
              deviceCode: 'WXYZ-5678',
            },
            snapshot: SAMPLE_SNAPSHOT,
          }),
        }
      }
      return { ok: true, json: async () => SAMPLE_SNAPSHOT }
    })
    vi.stubGlobal('fetch', fetchMock)

    officeAppsStore.seedSnapshot(SAMPLE_SNAPSHOT)
    officeAppsStore.setExperienceMode('office')

    const { container, rerender } = render(
      <div>
        <OfficeAppsComposerTrigger
          t={t}
          locale="zh"
          onOpenExtensions={openExtensions}
          onOpenExternalUrl={openExternalUrl}
          onRunPrompt={runPrompt}
        />
        <OfficeStarterDock
          t={t}
          locale="zh"
          isBlankSession={true}
          onRunPrompt={runPrompt}
        />
      </div>,
    )

    // Composer pill reflects connected service in normal chat
    const trigger = screen.getByRole('button', { name: '办公应用 · 已连 腾讯文档' })
    expect(trigger.textContent).toBe('')
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    expect(trigger.getAttribute('data-connected')).toBe('true')

    // Blank session in office mode renders starter chips; connected chip launches prompt directly
    fireEvent.click(screen.getByRole('button', { name: /生成周报/ }))
    expect(runPrompt).toHaveBeenCalledWith('新建腾讯文档周报')

    // Non-blank session hides starter dock cleanly
    rerender(
      <div>
        <OfficeAppsComposerTrigger
          t={t}
          locale="zh"
          onOpenExtensions={openExtensions}
          onOpenExternalUrl={openExternalUrl}
          onRunPrompt={runPrompt}
        />
        <OfficeStarterDock
          t={t}
          locale="zh"
          isBlankSession={false}
          onRunPrompt={runPrompt}
        />
      </div>,
    )
    expect(container.querySelector('[data-dsh-office-starter-dock]')).toBeNull()

    // Click composer pill -> opens Office Apps Center modal right over chat
    fireEvent.click(trigger)
    expect(screen.getByText('办公应用中心')).toBeTruthy()

    // Category filter narrows catalog cards inside modal
    fireEvent.click(screen.getByRole('button', { name: '会议与文档' }))
    expect(container.querySelectorAll('[data-connector-card]').length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(container.querySelectorAll('[data-connector-card]').length).toBe(2)

    // Uninstalled Feishu -> linear Step 1 install -> Step 2 browser auth URL
    fireEvent.click(screen.getByRole('button', { name: '去接入' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '一键安装官方组件' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '一键安装官方组件' }))

    await waitFor(() => expect(screen.getByRole('button', { name: '前往 飞书 网页授权登录' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '前往 飞书 网页授权登录' }))

    await waitFor(() => {
      expect(openExternalUrl).toHaveBeenCalledWith('https://accounts.feishu.cn/device?code=WXYZ-5678')
      expect(screen.getByText('WXYZ-5678')).toBeTruthy()
    })
  })

  it('toggles sidebar Pro/Office experience mode in place and persists without replacing main pane', () => {
    document.body.innerHTML = `
      <aside data-pane="sidebar">
        <div>
          <button type="button">新会话</button>
          <button type="button" data-dsh-tools-toggle>+ 展开工具</button>
        </div>
      </aside>
    `
    officeAppsStore.seedSnapshot({ ...SAMPLE_SNAPSHOT, connectedCount: 3 })
    const onEnterOffice = vi.fn()
    const onEnterDev = vi.fn()

    const dispose = installSidebarModeSwitcher(document, {
      locale: () => 'zh-CN',
      onEnterOfficeMode: onEnterOffice,
      onEnterDevMode: onEnterDev,
    })

    const devTab = document.querySelector('[data-mode-tab="dev"]') as HTMLButtonElement
    const officeTab = document.querySelector('[data-mode-tab="office"]') as HTMLButtonElement
    expect(devTab.getAttribute('aria-selected')).toBe('true')
    expect(document.querySelector('[data-mode-badge]')?.textContent).toBe('3')

    officeTab.click()
    expect(onEnterOffice).toHaveBeenCalledTimes(1)
    expect(officeTab.getAttribute('aria-selected')).toBe('true')
    expect(document.documentElement.dataset.dshExperienceMode).toBe('office')
    expect(localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY)).toBe('office')

    devTab.click()
    expect(onEnterDev).toHaveBeenCalledTimes(1)
    expect(devTab.getAttribute('aria-selected')).toBe('true')
    expect(document.documentElement.dataset.dshExperienceMode).toBe('dev')
    dispose()
  })

  it('ignores streamed conversation mutations and remounts after sidebar replacement', async () => {
    document.body.innerHTML = `
      <aside data-pane="sidebar"><button>New chat</button></aside>
      <main data-pane="conversation"></main>
    `
    const sidebar = document.querySelector('[data-pane="sidebar"]')!
    const conversation = document.querySelector('[data-pane="conversation"]')!
    const sidebarScan = vi.spyOn(sidebar, 'querySelectorAll')
    const dispose = installSidebarModeSwitcher(document)
    const switcher = sidebar.querySelector('[data-dsh-mode-switcher-host]')
    const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))
    try {
      expect(switcher).not.toBeNull()
      for (const packet of ['First fragment', 'Second fragment', 'Final fragment']) {
        const fragment = document.createElement('p')
        fragment.textContent = packet
        conversation.append(fragment)
        await nextFrame()
        await nextFrame()
      }
      expect(sidebarScan).toHaveBeenCalledTimes(1)

      const replacement = document.createElement('aside')
      replacement.dataset.pane = 'sidebar'
      replacement.innerHTML = '<div><button>New session</button></div>'
      sidebar.replaceWith(replacement)
      await waitFor(() => {
        expect(replacement.querySelector('button')?.nextElementSibling).toBe(switcher)
      })
    } finally {
      dispose()
      sidebarScan.mockRestore()
    }
  })

  it('routes external download links through dshDesktop.openExternalUrl and surfaces install logs on failure', async () => {
    const openExternalStub = vi.fn(async () => true)
    vi.stubGlobal('window', Object.assign(window, { dshDesktop: { openExternalUrl: openExternalStub } }))
    expect(openDesktopExternalUrl('https://github.com/larksuite/cli#readme')).toBe(true)
    expect(openExternalStub).toHaveBeenCalledWith('https://github.com/larksuite/cli#readme')

    const openExternalUrl = vi.fn((url: string) => { openDesktopExternalUrl(url) })
    const fetchMock = vi.fn(async (input: string) => {
      if (input.endsWith('/detect')) {
        return { ok: true, json: async () => ({ installed: false, driverId: 'feishu-cli', driverKind: 'cli' }) }
      }
      if (input.endsWith('/install')) {
        return {
          ok: true,
          json: async () => ({
            result: {
              ok: false,
              installed: false,
              fallbackUrl: 'https://github.com/larksuite/cli#readme',
              friendlyError: { zh: '本机缺少 npm', en: 'Missing npm' },
              rawError: '[npmmirror] ENOENT pnpm',
            },
            snapshot: SAMPLE_SNAPSHOT,
          }),
        }
      }
      return { ok: true, json: async () => SAMPLE_SNAPSHOT }
    })
    vi.stubGlobal('fetch', fetchMock)

    officeAppsStore.seedSnapshot(SAMPLE_SNAPSHOT)
    officeAppsStore.setExperienceMode('office')
    render(
      <OfficeAppsComposerTrigger
        t={key => workModeZh[key]}
        locale="zh"
        onOpenExtensions={vi.fn()}
        onOpenExternalUrl={openExternalUrl}
        onRunPrompt={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '办公应用 · 已连 腾讯文档' }))
    fireEvent.click(screen.getByRole('button', { name: '去接入' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '一键安装官方组件' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '一键安装官方组件' }))

    await waitFor(() => expect(screen.getByText('[npmmirror] ENOENT pnpm')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '前往官方页面下载' }))
    expect(openExternalStub).toHaveBeenCalledWith('https://github.com/larksuite/cli#readme')
  })

  it('opens late-arriving authUrl once during login polling and surfaces login failure logs', async () => {
    const openExternalUrl = vi.fn()
    let pollStep = 0
    const installedSnap: WorkModeSnapshot = {
      ...SAMPLE_SNAPSHOT,
      items: SAMPLE_SNAPSHOT.items.map(it => it.entry.id === 'feishu' ? { ...it, status: 'installed_unauthenticated' } : it),
    }
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (input.endsWith('/detect')) {
        return { ok: true, json: async () => ({ installed: true, driverId: 'feishu-cli', driverKind: 'cli', version: '1.0.100' }) }
      }
      if (input.endsWith('/login')) {
        return {
          ok: true,
          json: async () => ({
            login: { connectorId: 'feishu', kind: 'cli-browser', state: 'pending', message: { zh: '等待授权', en: 'Waiting' } },
            snapshot: installedSnap,
          }),
        }
      }
      if (input.includes('/login-status')) {
        pollStep += 1
        if (pollStep === 1) {
          return {
            ok: true,
            json: async () => ({
              login: {
                connectorId: 'feishu',
                kind: 'cli-browser',
                state: 'pending',
                authUrl: 'https://open.feishu.cn/page/cli?user_code=Z36U-96N7',
                deviceCode: 'Z36U-96N7',
              },
              snapshot: installedSnap,
            }),
          }
        }
        return {
          ok: true,
          json: async () => ({
            login: {
              connectorId: 'feishu',
              kind: 'cli-browser',
              state: 'failed',
              message: { zh: '登录失败', en: 'Login failed' },
              rawOutput: 'mock auth failed',
            },
            snapshot: installedSnap,
          }),
        }
      }
      return { ok: true, json: async () => installedSnap }
    }))

    officeAppsStore.seedSnapshot(installedSnap)
    officeAppsStore.setExperienceMode('office')
    render(
      <OfficeAppsComposerTrigger
        t={key => workModeZh[key]}
        locale="zh"
        onOpenExtensions={vi.fn()}
        onOpenExternalUrl={openExternalUrl}
        onRunPrompt={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '办公应用 · 已连 腾讯文档' }))
    fireEvent.click(screen.getByRole('button', { name: '去登录' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '前往 飞书 网页授权登录' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '前往 飞书 网页授权登录' }))

    await officeAppsStore.pollLoginStatus('feishu', openExternalUrl)
    await officeAppsStore.pollLoginStatus('feishu', openExternalUrl)
    await waitFor(() => {
      expect(openExternalUrl).toHaveBeenCalledTimes(1)
      expect(openExternalUrl).toHaveBeenCalledWith('https://open.feishu.cn/page/cli?user_code=Z36U-96N7')
      expect(screen.getByText('登录失败')).toBeTruthy()
      expect(screen.getByText('mock auth failed')).toBeTruthy()
    })
  })
})
