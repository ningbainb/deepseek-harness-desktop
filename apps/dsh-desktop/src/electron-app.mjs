import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

import { startQrConnect } from '@tencent-connect/qqbot-connector'

import { applyWindowIcon, resolveAppIconPath } from './app-icon.mjs'
import { resolveDesktopVersion } from './app-version.mjs'
import { createCommunityQrImage } from './community.mjs'
import { GITHUB_FEEDBACK_URL, GITHUB_PROJECT_URL } from './community-links.mjs'
import { BoundedLogStore } from './log-store.mjs'
import { registerExtensionIpc } from './extension-ipc.mjs'
import {
  createHostCompatibilityProvider,
  resolvePackageVersion,
} from './extensions/plugin-compatibility.mjs'
import { PluginManager, resolvePnpmCliPath } from './extensions/plugins.mjs'
import {
  QqBotBindingService,
  QqBotCredentialStore,
  setQqBotProfileEnabled,
} from './extensions/qqbot.mjs'
import { publicUpdateStatus, registerDesktopIpc } from './ipc.mjs'
import { installApplicationMenu } from './menu.mjs'
import { installNavigationPolicy } from './navigation-policy.mjs'
import { ensureDesktopProfile, resolveDshCliPath, resolveRuntimePackages } from './profile.mjs'
import { installRendererPermissions } from './renderer-permissions.mjs'
import { DEFAULT_STARTUP_TIMEOUT_MS, DshRuntimeController } from './runtime-controller.mjs'
import { DesktopUpdateController, loadElectronAutoUpdater } from './updater.mjs'
import { installUpdateSurface } from './update-surface.mjs'
import { installWindowChrome, setWindowChromeTheme, windowChromeBrowserOptions } from './window-chrome.mjs'
import { attachWindowStatePersistence, loadWindowState } from './window-state.mjs'

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url))
const PRELOAD_PATH = join(SOURCE_DIR, 'preload.cjs')
const STARTUP_PATH = join(SOURCE_DIR, 'ui', 'startup.html')
const EXTENSIONS_PATH = join(SOURCE_DIR, 'ui', 'extensions.html')
const COMMUNITY_PATH = join(SOURCE_DIR, 'ui', 'community.html')

function runtimeHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function runtimeWorkspace(app) {
  if (!app.isPackaged) return join(SOURCE_DIR, '..', '..', '..')
  return homedir()
}

export async function ensurePnpmCommandShim({ directory, executable, pnpmCli }) {
  await mkdir(directory, { recursive: true })
  const path = join(directory, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  const content = process.platform === 'win32'
    ? `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${executable}" "${pnpmCli}" %*\r\n`
    : `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${executable}" "${pnpmCli}" "$@"\n`
  const existing = await readFile(path, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return undefined
    throw error
  })
  if (existing !== content) await writeFile(path, content, { encoding: 'utf8', mode: 0o755 })
  return directory
}

export async function startElectronApp(metadata) {
  const applicationStartedAt = performance.now()
  const electron = await import('electron')
  const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, safeStorage, screen, shell } = electron
  if (process.env.DSH_DESKTOP_USER_DATA) app.setPath('userData', process.env.DSH_DESKTOP_USER_DATA)
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  app.setName(metadata.productName)
  app.setAppUserModelId(metadata.appId)
  await app.whenReady()
  const applicationReadyAt = performance.now()

  const appIconPath = resolveAppIconPath({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    sourceDir: SOURCE_DIR,
  })
  const appIcon = nativeImage.createFromPath(appIconPath)
  if (appIcon.isEmpty()) throw new Error(`desktop app icon is missing or invalid: ${appIconPath}`)
  const windowChromeIconDataUrl = appIcon.resize({ width: 40, height: 40, quality: 'best' }).toDataURL()
  const desktopVersion = await resolveDesktopVersion({
    isPackaged: app.isPackaged,
    appVersion: app.getVersion(),
    manifestPath: join(SOURCE_DIR, '..', 'package.json'),
  })

  const userData = app.getPath('userData')
  const logsDirectory = join(userData, 'logs')
  await mkdir(logsDirectory, { recursive: true })
  const logStore = new BoundedLogStore({ directory: logsDirectory })
  await logStore.append(`[startup] application-ready=${Math.round(applicationReadyAt - applicationStartedAt)}ms`)
  const dshHome = runtimeHome()
  const profileStartedAt = performance.now()
  const runtimePackages = resolveRuntimePackages()
  let qqBotCredentials
  const ensureProfile = async () => {
    const result = await ensureDesktopProfile({ dshHome, packageRoots: runtimePackages })
    await setQqBotProfileEnabled({ profileDir: result.profileDir, enabled: Boolean(qqBotCredentials) })
    return result
  }
  const profile = await ensureDesktopProfile({ dshHome, packageRoots: runtimePackages })
  const qqBotCredentialStore = new QqBotCredentialStore({
    path: join(userData, 'qqbot-credentials.json'),
    safeStorage,
  })
  try {
    qqBotCredentials = await qqBotCredentialStore.load()
  } catch (error) {
    await logStore.append(`[qqbot] failed to load credentials: ${error.message}`)
  }
  await setQqBotProfileEnabled({ profileDir: profile.profileDir, enabled: Boolean(qqBotCredentials) })
  await logStore.append(
    `[startup] profile-ready=${Math.round(performance.now() - profileStartedAt)}ms packages=${runtimePackages.size}`,
  )
  const qqBotEnvironment = () => qqBotCredentials
    ? { QQBOT_APPID: qqBotCredentials.appId, QQBOT_SECRET: qqBotCredentials.appSecret }
    : { QQBOT_APPID: '', QQBOT_SECRET: '' }
  const projectRoot = runtimeWorkspace(app)
  const runtimeBin = await ensurePnpmCommandShim({
    directory: join(userData, 'runtime-bin'),
    executable: process.execPath,
    pnpmCli: resolvePnpmCliPath(),
  })
  const runtimeVersion = resolvePackageVersion('@deepseek-ai/dsh', {
    profileDir: profile.profileDir,
    anchors: [import.meta.url],
  })
  if (runtimeVersion === undefined) throw new Error('the installed DSH runtime version is unavailable')
  const hostCompatibility = createHostCompatibilityProvider({
    desktopVersion,
    nodeVersion: process.versions.node,
    runtimeVersion,
    resolvePackageVersion: (name) => resolvePackageVersion(name, {
      profileDir: profile.profileDir,
      anchors: [import.meta.url],
    }),
  })
  const pluginManager = new PluginManager({ profileDir: profile.profileDir, hostCompatibility })
  const compatibilityReconciliation = await pluginManager.reconcileCompatibility()
  for (const plugin of compatibilityReconciliation.disabled) {
    await logStore.append(`[plugins] disabled incompatible community bundle: ${plugin.name}`)
  }

  const controller = new DshRuntimeController({
    cliPath: resolveDshCliPath(),
    cwd: projectRoot,
    dshHome,
    executable: process.execPath,
    logStore,
    autoRestart: true,
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
    pathEntries: [runtimeBin],
    environmentProvider: qqBotEnvironment,
  })
  const qqBotBinding = new QqBotBindingService({
    initialCredentials: qqBotCredentials,
    credentialStore: qqBotCredentialStore,
    startQrConnect,
    setProfileEnabled: (enabled) => setQqBotProfileEnabled({ profileDir: profile.profileDir, enabled }),
    setRuntimeCredentials: (credentials) => { qqBotCredentials = credentials },
    restartRuntime: () => controller.restart(),
  })

  const statePath = join(userData, 'window-state.json')
  const state = await loadWindowState(statePath, screen.getAllDisplays())
  let mainWindow = new BrowserWindow({
    ...state,
    minWidth: 720,
    minHeight: 540,
    show: false,
    title: metadata.productName,
    icon: appIcon,
    backgroundColor: '#040814',
    ...windowChromeBrowserOptions(),
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  })
  applyWindowIcon(mainWindow, appIcon)
  const removeMainWindowChrome = installWindowChrome({
    browserWindow: mainWindow,
    iconDataUrl: windowChromeIconDataUrl,
    showHelpMenu: true,
    onError: (error) => void logStore.append(`[window-chrome] ${error.message}`),
  })
  const removeUpdateSurface = installUpdateSurface({
    browserWindow: mainWindow,
    onError: (error) => void logStore.append(`[update-surface] ${error.message}`),
  })
  if (state.maximized) mainWindow.maximize()
  const saveWindowState = attachWindowStatePersistence(mainWindow, statePath)
  let activeOrigin
  let extensionWindow
  let communityWindow
  let updateController

  installNavigationPolicy({
    webContents: mainWindow.webContents,
    getRuntimeOrigin: () => activeOrigin,
    openExternal: (url) => shell.openExternal(url),
  })
  installRendererPermissions({
    session: mainWindow.webContents.session,
    getActiveOrigin: () => activeOrigin,
  })
  mainWindow.webContents.session.on('will-download', async (_event, item) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: join(app.getPath('downloads'), item.getFilename()),
    })
    if (result.canceled || !result.filePath) item.cancel()
    else item.setSavePath(result.filePath)
  })

  const unregisterIpc = registerDesktopIpc({
    ipcMain,
    controller,
    getWindow: () => mainWindow,
    metadata,
    version: desktopVersion,
    platform: process.platform,
    ensureProfile,
    openLogs: () => shell.openPath(logsDirectory),
    exitApp: () => app.quit(),
    handleHelpAction: (action) => {
      if (action === 'community') return createCommunityWindow()
      if (action === 'feedback') return shell.openExternal(GITHUB_FEEDBACK_URL)
      if (action === 'project') return shell.openExternal(GITHUB_PROJECT_URL)
      return updateController?.check({ manual: true })
    },
    setWindowChromeTheme: (sender, theme) => {
      const target = BrowserWindow.fromWebContents(sender)
      if (!target || target.isDestroyed()) return undefined
      return setWindowChromeTheme(target, theme)
    },
    getUpdateController: () => updateController,
  })

  const createExtensionWindow = async () => {
    if (extensionWindow && !extensionWindow.isDestroyed()) {
      extensionWindow.show()
      extensionWindow.focus()
      return extensionWindow
    }
    extensionWindow = new BrowserWindow({
      width: 1120,
      height: 780,
      minWidth: 760,
      minHeight: 620,
      show: false,
      parent: mainWindow,
      title: 'Extension Dock',
      icon: appIcon,
      backgroundColor: '#071117',
      ...windowChromeBrowserOptions(),
      webPreferences: {
        preload: PRELOAD_PATH,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
      },
    })
    applyWindowIcon(extensionWindow, appIcon)
    const removeExtensionWindowChrome = installWindowChrome({
      browserWindow: extensionWindow,
      iconDataUrl: windowChromeIconDataUrl,
      onError: (error) => void logStore.append(`[window-chrome] ${error.message}`),
    })
    installNavigationPolicy({
      webContents: extensionWindow.webContents,
      getRuntimeOrigin: () => undefined,
      openExternal: (url) => shell.openExternal(url),
    })
    extensionWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    extensionWindow.once('ready-to-show', () => extensionWindow?.show())
    extensionWindow.on('closed', () => {
      removeExtensionWindowChrome()
      extensionWindow = undefined
    })
    await extensionWindow.loadFile(EXTENSIONS_PATH)
    return extensionWindow
  }

  const createCommunityWindow = async () => {
    if (communityWindow && !communityWindow.isDestroyed()) {
      communityWindow.show()
      communityWindow.focus()
      return communityWindow
    }
    const qrImage = await createCommunityQrImage()
    communityWindow = new BrowserWindow({
      width: 580,
      height: 740,
      minWidth: 500,
      minHeight: 680,
      show: false,
      parent: mainWindow,
      title: '加入社群',
      icon: appIcon,
      backgroundColor: '#050b13',
      ...windowChromeBrowserOptions(),
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
      },
    })
    applyWindowIcon(communityWindow, appIcon)
    const removeCommunityWindowChrome = installWindowChrome({
      browserWindow: communityWindow,
      iconDataUrl: windowChromeIconDataUrl,
      onError: (error) => void logStore.append(`[window-chrome] ${error.message}`),
    })
    installNavigationPolicy({
      webContents: communityWindow.webContents,
      getRuntimeOrigin: () => undefined,
      openExternal: (url) => shell.openExternal(url),
    })
    communityWindow.webContents.session.setPermissionCheckHandler(() => false)
    communityWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    communityWindow.once('ready-to-show', () => communityWindow?.show())
    communityWindow.on('closed', () => {
      removeCommunityWindowChrome()
      communityWindow = undefined
    })
    await communityWindow.loadFile(COMMUNITY_PATH, { query: { qr: qrImage } })
    return communityWindow
  }

  const unregisterExtensionIpc = registerExtensionIpc({
    ipcMain,
    dialog,
    shell,
    getWindow: () => extensionWindow ?? mainWindow,
    pluginManager,
    controller,
    ensureProfile,
    projectRoot,
    dshHome,
    agentsHome: process.env.DSH_AGENTS_HOME,
    qqBotBinding,
  })
  const loadStartup = async () => {
    activeOrigin = undefined
    if (mainWindow && !mainWindow.isDestroyed()) {
      const preview = process.env.DSH_DESKTOP_STARTUP_PREVIEW_STATE
      await mainWindow.loadFile(STARTUP_PATH, preview ? { query: { preview } } : undefined)
    }
  }
  let runtimeStartedAt
  controller.on('status', (status) => {
    if (status.state === 'starting') runtimeStartedAt = performance.now()
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (status.state === 'ready' && status.url) {
      const runtimeReadyAt = performance.now()
      if (runtimeStartedAt !== undefined) {
        void logStore.append(`[startup] runtime-ready=${Math.round(runtimeReadyAt - runtimeStartedAt)}ms`)
      }
      activeOrigin = new URL(status.url).origin
      void mainWindow.loadURL(status.url).then(() => {
        void logStore.append(`[startup] renderer-loaded=${Math.round(performance.now() - runtimeReadyAt)}ms`)
        if (process.env.DSH_DESKTOP_SMOKE_EXIT === '1') {
          console.log(`desktop smoke ready: ${activeOrigin}`)
          app.quit()
        }
      }).catch((error) => {
        void logStore.append(`[renderer] ${error.message}`)
        void loadStartup().catch(() => {})
      })
    } else if (['crashed', 'stopping', 'restarting'].includes(status.state) && !mainWindow.webContents.getURL().startsWith('file:')) {
      void loadStartup().catch(() => {})
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = undefined })
  await loadStartup()
  if (process.env.DSH_DESKTOP_OPEN_EXTENSIONS === '1') await createExtensionWindow()
  if (process.env.DSH_DESKTOP_OPEN_COMMUNITY === '1') await createCommunityWindow()
  if (process.env.DSH_DESKTOP_HOLD_STARTUP !== '1') void controller.start().catch(() => {})

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  let quitInProgress = false
  let runtimeStopped = false
  let shutdownPromise
  const shutdownRuntime = () => {
    if (runtimeStopped) return Promise.resolve()
    if (shutdownPromise) return shutdownPromise
    shutdownPromise = Promise.resolve(saveWindowState())
      .catch((error) => void logStore.append(`[shutdown] ${error.message}`))
      .then(() => controller.stop())
      .catch((error) => void logStore.append(`[shutdown] ${error.message}`))
      .finally(() => {
        runtimeStopped = true
        updateController?.dispose()
        updateController?.off('status', publishUpdateStatus)
        removeUpdateSurface()
        removeMainWindowChrome()
        unregisterIpc()
        unregisterExtensionIpc()
        qqBotBinding.dispose()
      })
    return shutdownPromise
  }

  let autoUpdater
  if (app.isPackaged && process.platform === 'win32' && process.env.DSH_DESKTOP_DISABLE_UPDATES !== '1') {
    try {
      autoUpdater = await loadElectronAutoUpdater()
    } catch (error) {
      void logStore.append(`[updater] failed to load: ${error.message}`)
    }
  }
  if (process.env.DSH_DESKTOP_VERIFY_UPDATER === '1' && !autoUpdater) {
    throw new Error('packaged updater verification failed')
  }
  updateController = new DesktopUpdateController({
    updater: autoUpdater,
    getWindow: () => mainWindow,
    currentVersion: app.getVersion(),
    enabled: Boolean(autoUpdater),
    log: (line) => void logStore.append(line),
    beforeInstall: async () => {
      quitInProgress = true
      await shutdownRuntime()
    },
  })
  const publishUpdateStatus = (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop:update-status', publicUpdateStatus(status))
    }
  }
  updateController.on('status', publishUpdateStatus)
  const openLogs = () => shell.openPath(logsDirectory)
  installApplicationMenu({
    Menu,
    app,
    shell,
    controller,
    openExtensions: () => void createExtensionWindow(),
    openCommunity: () => void createCommunityWindow().catch((error) => logStore.append(`[community] ${error.message}`)),
    openFeedback: () => void shell.openExternal(GITHUB_FEEDBACK_URL),
    openLogs,
    checkForUpdates: (options) => updateController.check(options),
  })
  updateController.start()

  app.on('before-quit', (event) => {
    if (runtimeStopped) return
    event.preventDefault()
    if (quitInProgress) return
    quitInProgress = true
    void shutdownRuntime().then(() => app.quit())
  })
  app.on('window-all-closed', () => app.quit())
}
