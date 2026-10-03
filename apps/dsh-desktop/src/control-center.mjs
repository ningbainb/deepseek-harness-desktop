import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const CONTROL_CENTER_SCHEMA_VERSION = 1
export const CONTROL_PROVIDERS = Object.freeze({
  browser: Object.freeze(['playwright', 'chrome-devtools', 'stagehand']),
  computer: Object.freeze(['cua-native', 'cua-mcp']),
})
export const CONTROL_STATES = Object.freeze([
  'disabled', 'checking', 'ready', 'permission-required', 'unavailable', 'failed',
])

const DEFAULT_CONFIGURATION = Object.freeze({
  version: CONTROL_CENTER_SCHEMA_VERSION,
  browser: Object.freeze({ enabled: false, provider: 'playwright' }),
  computer: Object.freeze({ enabled: false, provider: 'cua-native', suspended: false, failureCount: 0 }),
})

function copyConfiguration(value = DEFAULT_CONFIGURATION) {
  return {
    version: CONTROL_CENTER_SCHEMA_VERSION,
    browser: { ...value.browser },
    computer: { ...value.computer },
  }
}

function normalizeFeature(value, kind) {
  const fallback = DEFAULT_CONFIGURATION[kind]
  const providers = CONTROL_PROVIDERS[kind]
  const normalized = {
    enabled: value?.enabled === true,
    provider: providers.includes(value?.provider) ? value.provider : fallback.provider,
  }
  if (kind === 'computer') {
    normalized.suspended = value?.suspended === true
    normalized.failureCount = Number.isInteger(value?.failureCount) && value.failureCount > 0
      ? Math.min(value.failureCount, 2)
      : 0
  }
  return normalized
}

export function normalizeControlCenterConfiguration(value) {
  return {
    version: CONTROL_CENTER_SCHEMA_VERSION,
    browser: normalizeFeature(value?.browser, 'browser'),
    computer: normalizeFeature(value?.computer, 'computer'),
  }
}

export class ControlCenterStore {
  constructor({ path, platform = process.platform, environment = process.env, browserCandidates } = {}) {
    if (typeof path !== 'string' || path.length === 0) throw new TypeError('control center path is required')
    this.path = path
    this.platform = platform
    this.environment = environment
    this.browserCandidates = browserCandidates
    this.queue = Promise.resolve()
  }

  async load() {
    try {
      return normalizeControlCenterConfiguration(JSON.parse(await readFile(this.path, 'utf8')))
    } catch (error) {
      if (error?.code === 'ENOENT' || error instanceof SyntaxError) return copyConfiguration()
      throw error
    }
  }

  async save(value) {
    const normalized = normalizeControlCenterConfiguration(value)
    const operation = this.queue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true })
      const transactionId = `${process.pid}-${Date.now()}`
      const temporary = `${this.path}.staging-${transactionId}`
      const backup = `${this.path}.backup-${transactionId}`
      await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, this.path).catch(async (error) => {
        if (this.platform !== 'win32' || error?.code !== 'EEXIST') throw error
        await rename(this.path, backup)
        try {
          await rename(temporary, this.path)
          await rm(backup, { force: true })
        } catch (replacementError) {
          await rename(backup, this.path).catch(() => {})
          throw replacementError
        }
      })
      return normalized
    })
    this.queue = operation.catch(() => {})
    return operation
  }

  async setFeature(kind, enabled, provider) {
    if (!['browser', 'computer'].includes(kind)) throw new TypeError('unknown control feature')
    if (typeof enabled !== 'boolean') throw new TypeError('control feature state must be boolean')
    if (!CONTROL_PROVIDERS[kind].includes(provider)) throw new TypeError('unknown control provider')
    const current = await this.load()
    current[kind] = kind === 'computer'
      ? { enabled, provider, suspended: false, failureCount: 0 }
      : { enabled, provider }
    return this.save(current)
  }

  async recordComputerProviderFailure() {
    const current = await this.load()
    if (!current.computer.enabled || current.computer.provider !== 'cua-native') {
      return Object.freeze({ suspended: false, changed: false })
    }
    const failureCount = Math.min(2, current.computer.failureCount + 1)
    current.computer = { ...current.computer, failureCount, suspended: failureCount >= 2 }
    await this.save(current)
    return Object.freeze({ suspended: current.computer.suspended, changed: true })
  }

  async clearComputerProviderFailures() {
    const current = await this.load()
    if (!current.computer.suspended && current.computer.failureCount === 0) return current
    current.computer = { ...current.computer, suspended: false, failureCount: 0 }
    return this.save(current)
  }

  browserPaths() {
    if (Array.isArray(this.browserCandidates)) return this.browserCandidates
    const home = this.environment.LOCALAPPDATA ?? ''
    const programFiles = this.environment.ProgramFiles ?? 'C:\\Program Files'
    const programFilesX86 = this.environment['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
    if (this.platform === 'win32') return [
      { id: 'edge', label: 'Microsoft Edge', path: join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe') },
      { id: 'chrome', label: 'Google Chrome', path: join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe') },
      { id: 'chrome-user', label: 'Google Chrome', path: join(home, 'Google', 'Chrome', 'Application', 'chrome.exe') },
      { id: 'chromium', label: 'Chromium', path: join(home, 'Chromium', 'Application', 'chrome.exe') },
    ]
    if (this.platform === 'darwin') return [
      { id: 'chrome', label: 'Google Chrome', path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
      { id: 'edge', label: 'Microsoft Edge', path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
      { id: 'chromium', label: 'Chromium', path: '/Applications/Chromium.app/Contents/MacOS/Chromium' },
    ]
    return [
      { id: 'chrome', label: 'Google Chrome', path: '/usr/bin/google-chrome' },
      { id: 'edge', label: 'Microsoft Edge', path: '/usr/bin/microsoft-edge' },
      { id: 'chromium', label: 'Chromium', path: '/usr/bin/chromium' },
      { id: 'chromium-browser', label: 'Chromium', path: '/usr/bin/chromium-browser' },
    ]
  }

  async discoverBrowsers() {
    const found = []
    for (const candidate of this.browserPaths()) {
      try {
        await access(candidate.path)
        if (!found.some(item => item.id === candidate.id)) found.push(candidate)
      } catch {}
    }
    return found
  }

  async status({ packageRoots } = {}) {
    const configuration = await this.load()
    const browsers = await this.discoverBrowsers()
    const browserProviderPackage = {
      playwright: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp',
      'chrome-devtools': '@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp',
      stagehand: '@deepseek-ai/dsh-experimental-browser-use-stagehand-native',
    }[configuration.browser.provider]
    const computerProviderPackage = configuration.computer.provider === 'cua-native'
      ? '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native'
      : '@deepseek-ai/dsh-experimental-computer-use-cua-driver-mcp'
    const stagehandConfigured = configuration.browser.provider !== 'stagehand'
      || Boolean(this.environment.DSH_STAGEHAND_MODEL && this.environment.DSH_STAGEHAND_MODEL_API_KEY)
    const browserAvailable = packageRoots?.has?.(browserProviderPackage) === true
      && browsers.length > 0
      && stagehandConfigured
    const graphicalLinux = this.platform !== 'linux' || Boolean(this.environment.DISPLAY || this.environment.WAYLAND_DISPLAY)
    const mcpConfigured = configuration.computer.provider !== 'cua-mcp' || Boolean(this.environment.CUA_MCP_COMMAND)
    const computerAvailable = packageRoots?.has?.(computerProviderPackage) === true && graphicalLinux && mcpConfigured
    return Object.freeze({
      browser: Object.freeze({
        enabled: configuration.browser.enabled,
        provider: configuration.browser.provider,
        state: configuration.browser.enabled ? (browserAvailable ? 'ready' : 'unavailable') : 'disabled',
        browsers: Object.freeze(browsers.map(({ id, label }) => Object.freeze({ id, label }))),
      }),
      computer: Object.freeze({
        enabled: configuration.computer.enabled,
        provider: configuration.computer.provider,
        state: configuration.computer.suspended
          ? 'failed'
          : configuration.computer.enabled
          ? (!computerAvailable ? 'unavailable' : this.platform === 'darwin' ? 'permission-required' : 'ready')
          : 'disabled',
        platform: this.platform,
        ...(configuration.computer.suspended
          ? { message: '原生电脑操控连续启动失败，已安全停用。配置已保留，可在检查环境后重试。' }
          : {}),
      }),
    })
  }

  async probe(kind, provider, { packageRoots } = {}) {
    if (!['browser', 'computer'].includes(kind)) throw new TypeError('unknown control feature')
    const selected = provider ?? (await this.load())[kind].provider
    if (!CONTROL_PROVIDERS[kind].includes(selected)) throw new TypeError('unknown control provider')
    if (kind === 'browser') {
      const packageName = {
        playwright: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp',
        'chrome-devtools': '@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp',
        stagehand: '@deepseek-ai/dsh-experimental-browser-use-stagehand-native',
      }[selected]
      if (packageRoots?.has?.(packageName) !== true) return Object.freeze({ state: 'unavailable', message: '当前安装缺少所选浏览器 Provider。' })
      if (selected === 'stagehand' && !(this.environment.DSH_STAGEHAND_MODEL && this.environment.DSH_STAGEHAND_MODEL_API_KEY)) {
        return Object.freeze({ state: 'unavailable', message: 'Stagehand 需要单独配置 Provider 凭据。' })
      }
      const browsers = await this.discoverBrowsers()
      return browsers.length > 0
        ? Object.freeze({ state: 'ready', provider: selected })
        : Object.freeze({ state: 'unavailable', message: '未发现 Chrome、Edge 或 Chromium。请先安装受支持的系统浏览器。' })
    }
    const packageName = selected === 'cua-native'
      ? '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native'
      : '@deepseek-ai/dsh-experimental-computer-use-cua-driver-mcp'
    if (packageRoots?.has?.(packageName) !== true) return Object.freeze({ state: 'unavailable', message: '当前安装缺少所选电脑操控 Provider。' })
    if (selected === 'cua-mcp' && !this.environment.CUA_MCP_COMMAND) {
      return Object.freeze({ state: 'unavailable', message: '外置 Cua Driver MCP 尚未配置。' })
    }
    if (this.platform === 'linux' && !(this.environment.DISPLAY || this.environment.WAYLAND_DISPLAY)) {
      return Object.freeze({ state: 'unavailable', message: '当前 Linux 会话没有可用的图形桌面。' })
    }
    return Object.freeze({ state: this.platform === 'darwin' ? 'permission-required' : 'ready', provider: selected })
  }

  async profileConfiguration() {
    const configuration = await this.load()
    const browsers = await this.discoverBrowsers()
    return Object.freeze({
      ...configuration,
      browser: Object.freeze({
        ...configuration.browser,
        executablePath: browsers[0]?.path,
        enabled: configuration.browser.enabled
          && browsers.length > 0
          && (configuration.browser.provider !== 'stagehand'
            || Boolean(this.environment.DSH_STAGEHAND_MODEL && this.environment.DSH_STAGEHAND_MODEL_API_KEY)),
      }),
      computer: Object.freeze({
        ...configuration.computer,
        enabled: configuration.computer.enabled && !configuration.computer.suspended,
        ...(configuration.computer.provider === 'cua-mcp' && this.environment.CUA_MCP_COMMAND
          ? { command: this.environment.CUA_MCP_COMMAND }
          : {}),
      }),
      stagehand: Object.freeze({
        modelName: this.environment.DSH_STAGEHAND_MODEL,
        configured: Boolean(this.environment.DSH_STAGEHAND_MODEL && this.environment.DSH_STAGEHAND_MODEL_API_KEY),
      }),
    })
  }
}

export function createDefaultControlCenterConfiguration() {
  return copyConfiguration()
}
