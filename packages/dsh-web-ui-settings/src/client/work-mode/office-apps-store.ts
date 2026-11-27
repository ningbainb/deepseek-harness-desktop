import type { ConnectorWizardItem, InstallResultState, LoginSessionState } from './ConnectorWizardDialog.tsx'

export type ExperienceMode = 'dev' | 'office'

export interface WorkModeSnapshot {
  catalogVersion: string
  workOfficePresetId: string
  connectedCount: number
  items: Array<ConnectorWizardItem & {
    entry: ConnectorWizardItem['entry'] & {
      category: string
      examples: Array<{ title: { zh: string; en: string }; prompt: { zh: string; en: string } }>
    }
  }>
}

export interface OfficeAppsStoreState {
  experienceMode: ExperienceMode
  snapshot?: WorkModeSnapshot
  catalogOpen: boolean
  activeConnectorId?: string
  busy: boolean
  error: boolean
  envResult?: { installed: boolean; binaryPath?: string; version?: string; note?: string }
  installResult?: InstallResultState
  loginSession?: LoginSessionState
}

const API_PREFIX = '/api/dsh-connectors'
export const EXPERIENCE_MODE_STORAGE_KEY = 'dsh-desktop-experience-mode-v1'

function readStoredMode(): ExperienceMode {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY) === 'office'
      ? 'office'
      : 'dev'
  } catch {
    return 'dev'
  }
}

function applyDomExperienceMode(mode: ExperienceMode): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.dshExperienceMode = mode
  }
}

export class OfficeAppsStore {
  private state: OfficeAppsStoreState = {
    experienceMode: readStoredMode(),
    catalogOpen: false,
    busy: false,
    error: false,
  }
  private listeners = new Set<() => void>()
  private inflightFetch?: Promise<void>
  private openedLoginUrls = new Set<string>()

  constructor() {
    applyDomExperienceMode(this.state.experienceMode)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot = (): OfficeAppsStoreState => this.state

  private emit(): void {
    for (const listener of this.listeners) {
      try { listener() } catch {}
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dsh-work-mode-updated', {
        detail: {
          connectedCount: this.state.snapshot?.connectedCount ?? 0,
          experienceMode: this.state.experienceMode,
        },
      }))
    }
  }

  private patch(partial: Partial<OfficeAppsStoreState>): void {
    this.state = { ...this.state, ...partial }
    this.emit()
  }

  syncExperienceModeFromStorage(): void {
    const mode = readStoredMode()
    applyDomExperienceMode(mode)
    if (mode !== this.state.experienceMode) {
      this.patch({ experienceMode: mode, catalogOpen: false, activeConnectorId: undefined })
    }
  }

  setExperienceMode(mode: ExperienceMode): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, mode)
      }
    } catch {}
    applyDomExperienceMode(mode)
    if (mode !== this.state.experienceMode) {
      this.patch({ experienceMode: mode, catalogOpen: false, activeConnectorId: undefined })
    } else {
      this.emit()
    }
  }

  seedSnapshot(snapshot: WorkModeSnapshot | undefined): void {
    this.patch({ snapshot, error: false })
  }

  resetModalForTests(): void {
    this.openedLoginUrls.clear()
    this.state = {
      ...this.state,
      catalogOpen: false,
      activeConnectorId: undefined,
      envResult: undefined,
      installResult: undefined,
      loginSession: undefined,
      busy: false,
    }
    this.emit()
  }

  ensureLoaded(): void {
    if (this.state.snapshot || this.inflightFetch) return
    void this.refresh()
  }

  async refresh(): Promise<void> {
    if (this.inflightFetch) return this.inflightFetch
    this.patch({ error: false })
    this.inflightFetch = (async () => {
      try {
        const res = await fetch(`${API_PREFIX}/state`, {
          method: 'GET',
          headers: { 'x-dsh-connectors': '1' },
        })
        if (!res.ok) throw new Error('failed')
        const snapshot = await res.json() as WorkModeSnapshot
        this.patch({ snapshot, error: false })
      } catch {
        this.patch({ error: true })
      } finally {
        this.inflightFetch = undefined
      }
    })()
    return this.inflightFetch
  }

  openCatalog(): void {
    this.ensureLoaded()
    this.patch({ catalogOpen: true, activeConnectorId: undefined })
  }

  closeCatalog(): void {
    this.patch({ catalogOpen: false, activeConnectorId: undefined })
  }

  openWizard(connectorId: string): void {
    this.ensureLoaded()
    this.openedLoginUrls.clear()
    this.patch({
      activeConnectorId: connectorId,
      envResult: undefined,
      installResult: undefined,
      loginSession: undefined,
    })
  }

  closeWizard(): void {
    this.openedLoginUrls.clear()
    this.patch({
      activeConnectorId: undefined,
      envResult: undefined,
      installResult: undefined,
      loginSession: undefined,
    })
  }

  async detectEnv(connectorId: string): Promise<void> {
    this.patch({ busy: true })
    try {
      const res = await fetch(`${API_PREFIX}/detect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dsh-connectors': '1' },
        body: JSON.stringify({ connectorId }),
      })
      if (res.ok) {
        this.patch({ envResult: await res.json() })
      }
    } finally {
      this.patch({ busy: false })
    }
  }

  async install(connectorId: string): Promise<void> {
    this.patch({ busy: true })
    const currentItem = this.state.snapshot?.items.find(item => item.entry.id === connectorId)
    const docsUrl = currentItem?.entry.officialUrls.docs
    try {
      const res = await fetch(`${API_PREFIX}/install`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dsh-connectors': '1' },
        body: JSON.stringify({ connectorId }),
      })
      if (res.ok) {
        const data = await res.json() as { result: InstallResultState; snapshot: WorkModeSnapshot }
        this.patch({
          installResult: data.result,
          snapshot: data.snapshot,
          ...(data.result.installed ? {
            envResult: { installed: true, binaryPath: data.result.binaryPath, version: data.result.version },
          } : {}),
        })
        return
      }
      let rawError = `HTTP ${res.status}`
      try {
        const errData = await res.json() as { error?: string }
        if (errData?.error) rawError = errData.error
      } catch {}
      this.patch({
        installResult: {
          ok: false,
          installed: false,
          fallbackUrl: docsUrl,
          friendlyError: {
            zh: '自动安装请求未成功，可展开下方原始日志查看详情或前往官方页面下载。',
            en: 'Install request failed. Expand diagnostic log below or open the official download page.',
          },
          rawError,
        },
      })
    } catch (error) {
      this.patch({
        installResult: {
          ok: false,
          installed: false,
          fallbackUrl: docsUrl,
          friendlyError: {
            zh: '无法连接本地安装服务，请重试或前往官方页面下载。',
            en: 'Could not reach local install endpoint. Retry or open the official download page.',
          },
          rawError: error instanceof Error ? error.message : String(error),
        },
      })
    } finally {
      this.patch({ busy: false })
    }
  }

  private openLoginUrlOnce(authUrl: string | undefined, openUrl?: (url: string) => void): void {
    if (!authUrl || !openUrl || this.openedLoginUrls.has(authUrl)) return
    this.openedLoginUrls.add(authUrl)
    openUrl(authUrl)
  }

  async startLogin(connectorId: string, openUrl: (url: string) => void): Promise<void> {
    this.patch({ busy: true })
    const currentItem = this.state.snapshot?.items.find(item => item.entry.id === connectorId)
    const docsUrl = currentItem?.entry.officialUrls.docs
    try {
      const res = await fetch(`${API_PREFIX}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dsh-connectors': '1' },
        body: JSON.stringify({ connectorId }),
      })
      if (res.ok) {
        const data = await res.json() as { login: LoginSessionState; snapshot: WorkModeSnapshot }
        this.patch({ loginSession: data.login, snapshot: data.snapshot })
        this.openLoginUrlOnce(data.login.authUrl, openUrl)
        return
      }
      let rawOutput = `HTTP ${res.status}`
      try {
        const errData = await res.json() as { error?: string }
        if (errData?.error) rawOutput = errData.error
      } catch {}
      this.patch({
        loginSession: {
          connectorId,
          kind: 'web-token',
          state: 'failed',
          fallbackUrl: docsUrl,
          message: {
            zh: '无法启动网页授权登录，请先确认官方组件已安装或查看下方日志。',
            en: 'Could not start browser login. Verify component installation or inspect logs below.',
          },
          rawOutput,
        },
      })
    } catch (error) {
      this.patch({
        loginSession: {
          connectorId,
          kind: 'web-token',
          state: 'failed',
          fallbackUrl: docsUrl,
          message: {
            zh: '无法连接本地授权服务，请重试或手动打开官方页面。',
            en: 'Could not reach local login service. Retry or open the official page.',
          },
          rawOutput: error instanceof Error ? error.message : String(error),
        },
      })
    } finally {
      this.patch({ busy: false })
    }
  }

  async pollLoginStatus(connectorId: string, openUrl?: (url: string) => void): Promise<LoginSessionState | undefined> {
    try {
      const res = await fetch(`${API_PREFIX}/login-status?connectorId=${encodeURIComponent(connectorId)}`, {
        method: 'GET',
        headers: { 'x-dsh-connectors': '1' },
      })
      if (!res.ok) return undefined
      const data = await res.json() as { login: LoginSessionState; snapshot: WorkModeSnapshot }
      this.patch({ loginSession: data.login, snapshot: data.snapshot })
      this.openLoginUrlOnce(data.login.authUrl, openUrl)
      return data.login
    } catch {
      return undefined
    }
  }

  async configureAndVerify(connectorId: string, patch: {
    enabled: boolean
    selectedDriverId: string
    customBinaryPath: string
    nonSecretFields: Record<string, string>
    secretFields: Record<string, string>
    consentAccepted: boolean
  }): Promise<void> {
    this.patch({ busy: true })
    try {
      await fetch(`${API_PREFIX}/configure`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dsh-connectors': '1' },
        body: JSON.stringify({ connectorId, ...patch }),
      })
      const verifyRes = await fetch(`${API_PREFIX}/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dsh-connectors': '1' },
        body: JSON.stringify({ connectorId }),
      })
      if (verifyRes.ok) {
        const data = await verifyRes.json() as { snapshot: WorkModeSnapshot }
        this.patch({ snapshot: data.snapshot })
      }
    } finally {
      this.patch({ busy: false })
    }
  }

  async disconnect(connectorId: string): Promise<void> {
    this.patch({ busy: true })
    try {
      const res = await fetch(`${API_PREFIX}/disconnect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dsh-connectors': '1' },
        body: JSON.stringify({ connectorId }),
      })
      if (res.ok) {
        this.patch({ snapshot: await res.json() as WorkModeSnapshot, activeConnectorId: undefined })
      }
    } finally {
      this.patch({ busy: false })
    }
  }
}

export const officeAppsStore = new OfficeAppsStore()
