import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const BOTH_DESKTOP_PLATFORMS = ['darwin', 'win32']

function suite(definition) {
  return {
    tier: 'application',
    platforms: BOTH_DESKTOP_PLATFORMS,
    gates: ['core', 'full'],
    args: [],
    timeoutMs: 180_000,
    cleanupTimeoutMs: 15_000,
    requires: ['gui-session'],
    network: 'loopback-fixture',
    owner: 'desktop-platform',
    ...definition,
  }
}

const CORE_SUITES = [
  suite({ id: 'desktop.native-plugin-pages', name: 'Native Plugin Pages, Preserved Skins and Window Palette', targets: ['source', 'packaged'], requirements: ['plugins.pages', 'skins.preserved', 'window.palette'], script: 'scripts/verify-native-plugin-pages.mjs' }),
  suite({ id: 'desktop.settings-readiness', name: 'Settings Availability Before Slow Resources Complete', tier: 'fixture', targets: ['fixture'], requirements: ['settings.readiness'], script: 'scripts/verify-settings-readiness.mjs', timeoutMs: 60_000, requires: [] }),
  suite({ id: 'desktop.star-prompt', name: 'Optional Prompt Ordering & Once-per-release Lifecycle', targets: ['source', 'packaged'], requirements: ['prompt.ordering', 'prompt.once-per-release'], script: 'scripts/verify-star-prompt.mjs' }),
  suite({ id: 'desktop.dock-settings', name: 'Extension Dock Settings & Compact Layout', targets: ['source', 'packaged'], requirements: ['dock.settings', 'dock.layout', 'window.native-controls'], script: 'scripts/verify-dock-settings.mjs' }),
  suite({ id: 'desktop.selected-balance', name: 'Selected Model Balance & Provider Credential Isolation', targets: ['source', 'packaged'], requirements: ['models.balance', 'credentials.isolation'], script: 'scripts/verify-selected-balance.mjs' }),
  suite({ id: 'desktop.model-catalog', name: 'Dock Model Catalog, Selection & Timeout Recovery', targets: ['source', 'packaged'], requirements: ['models.catalog', 'models.selection', 'models.timeout-recovery'], script: 'scripts/verify-dock-model-catalog.mjs' }),
  suite({ id: 'desktop.proxy-routing', name: 'Network Proxy Routing & Recovery', targets: ['source', 'packaged'], requirements: ['network.proxy-routing', 'network.proxy-recovery'], script: 'scripts/verify-proxy-routing.mjs' }),
  suite({ id: 'desktop.window-chrome', name: 'Window Chrome & Geometry', targets: ['source', 'packaged'], requirements: ['window.chrome', 'window.geometry'], script: 'scripts/verify-window-chrome.mjs' }),
  suite({ id: 'desktop.settings-window', name: 'Settings Window Multi-tab & Resizing', targets: ['source', 'packaged'], requirements: ['settings.tabs', 'settings.resize', 'settings.geometry-persistence'], script: 'scripts/verify-settings-window.mjs' }),
  suite({ id: 'desktop.conversation-scroll', name: 'Long Conversation Scroll & Turn Navigation', targets: ['source', 'packaged'], requirements: ['conversation.scroll', 'conversation.turn-navigation'], script: 'scripts/verify-conversation-scroll.mjs' }),
  suite({ id: 'desktop.native-turn-navigation', name: 'Native DSH Turn Navigation Without Duplicate Controls', targets: ['source', 'packaged'], requirements: ['conversation.native-navigation', 'conversation.mode-switch'], script: 'scripts/verify-conversation-scroll.mjs', args: ['--native-turns', '--native-tabs', '--mode-switch'] }),
  suite({ id: 'desktop.directory-picker', name: 'Directory Picker & Workspace Import', targets: ['source', 'packaged'], requirements: ['workspace.directory-picker', 'workspace.import', 'attachments.files'], script: 'scripts/verify-directory-picker.mjs', args: ['--native-layout'] }),
  suite({ id: 'desktop.runtime-provider', name: 'Runtime Provider & IPC Services', tier: 'integration', targets: ['source'], requirements: ['runtime.lifecycle', 'runtime.ipc', 'runtime.recovery'], script: 'scripts/verify-runtime-provider.mjs', requires: [] }),
  suite({ id: 'desktop.particle-theme', name: 'Particle Composer Clearance & Multi-window Settings Delivery', targets: ['source', 'packaged'], requirements: ['theme.particles', 'composer.clearance', 'settings.multi-window'], script: 'scripts/verify-particle-theme.mjs' }),
  suite({ id: 'desktop.preset-deep-link', name: 'Preset Deep-Link Protocol Handler', targets: ['source', 'packaged'], requirements: ['preset.deep-link', 'preset.file-ingress'], script: 'scripts/verify-preset-deep-link.mjs' }),
  suite({ id: 'desktop.preset-export', name: 'Real Preset Export, Visible Feedback & Retry', targets: ['source', 'packaged'], requirements: ['preset.export', 'preset.feedback', 'preset.retry'], script: 'scripts/verify-preset-export.mjs' }),
  suite({
    id: 'desktop.direct-start-unit-integration',
    name: 'Direct-Start Matrix & Repair Unit Integration',
    tier: 'integration',
    targets: ['source'],
    requirements: ['startup.matrix', 'repair.integration', 'desktop.unit-contracts'],
    script: '--test',
    args: [
      'test/packaged-direct-start-matrix.test.mjs',
      'test/repair-agent-integration.test.mjs',
      'test/session-preservation.test.mjs',
      'test/legacy-session-backend.test.mjs',
      'test/pet-client-polling.test.mjs',
      'test/dock-settings-fixture.test.mjs',
      'test/dock-settings-close.test.mjs',
      'test/dock-settings-save.test.mjs',
      'test/extensions-renderer-actions.test.mjs',
      'test/panel-layout-menu.test.mjs',
      'test/desktop-ingress.test.mjs',
      'test/runtime-presentation.test.mjs',
      'test/runtime-startup-timing.test.mjs',
      'test/runtime-shutdown-control.test.mjs',
      'test/runtime-stream-drain.test.mjs',
      'test/window-state.test.mjs',
      'test/window-chrome.test.mjs',
      'test/settings-window.test.mjs',
      'test/modal-reveal.test.mjs',
      'test/star-prompt.test.mjs',
      'test/install-recovery.test.mjs',
      'test/terminal-session.test.mjs',
      'test/terminal-window.test.mjs',
      'test/terminal-renderer.test.mjs',
      'test/windows-background-runner.test.mjs',
      'test/windows-runner-console.test.mjs',
    ],
    timeoutMs: 120_000,
    requires: [],
    network: 'none',
  }),
]

const WINDOWS_CORE_SUITES = [
  suite({ id: 'desktop.windows-dpi', name: 'Windows DPI Persistence, Maximize and Explicit Resize', platforms: ['win32'], targets: ['source', 'packaged'], requirements: ['window.dpi-persistence', 'window.maximize', 'window.resize'], script: 'scripts/verify-window-state-dpi.mjs' }),
]

const PACKAGED_SUITES = [
  suite({ id: 'desktop.terminal-packaged', name: 'Embedded Terminal (ConPTY / xterm)', targets: ['packaged'], gates: ['full'], requirements: ['terminal.local', 'terminal.cleanup'], script: 'scripts/verify-terminal.mjs' }),
  suite({ id: 'desktop.ssh-packaged', name: 'Packaged SSH Terminal & Relaunch Persistence', targets: ['packaged'], gates: ['full'], requirements: ['terminal.ssh', 'terminal.ssh-persistence'], script: 'scripts/verify-packaged-ssh.mjs' }),
  suite({ id: 'desktop.direct-start-packaged', name: 'Packaged Direct-Start Matrix', targets: ['packaged'], gates: ['full'], requirements: ['startup.packaged-matrix', 'migration.historical-home'], script: 'scripts/verify-packaged-direct-start-matrix.mjs', timeoutMs: 300_000 }),
  suite({ id: 'desktop.fresh-relaunch-packaged', name: 'Packaged Clean Profile Relaunch', targets: ['packaged'], gates: ['full'], requirements: ['startup.fresh-profile', 'startup.second-launch'], script: 'scripts/verify-packaged-fresh-second-launch.mjs' }),
  suite({ id: 'desktop.personalization-packaged', name: 'Packaged Personalization (Prompt & Memory Cards)', targets: ['packaged'], gates: ['full'], requirements: ['personalization.prompt', 'personalization.memory', 'personalization.persistence'], script: 'scripts/verify-packaged-personalization.mjs' }),
  suite({ id: 'desktop.model-preferences-packaged', name: 'Packaged Model Preferences Card', targets: ['packaged'], gates: ['full'], requirements: ['models.preferences', 'models.preferences-persistence'], script: 'scripts/verify-packaged-model-preferences.mjs' }),
  suite({ id: 'desktop.image-drop-packaged', name: 'Packaged Image Drop Reliability & Memory', targets: ['packaged'], gates: ['full'], requirements: ['attachments.image-drop', 'attachments.image-retry', 'resources.image-memory'], script: 'scripts/verify-packaged-image-drop.mjs', timeoutMs: 360_000 }),
  suite({ id: 'desktop.agent-work-packaged', name: 'Packaged Session Message & Agent Tool Work', targets: ['packaged'], gates: ['full'], requirements: ['conversation.message', 'agent.tool-work'], script: 'scripts/verify-packaged-agent-work.mjs', timeoutMs: 300_000 }),
  suite({ id: 'desktop.workspace-relocation-packaged', name: 'Workspace Relocation Compatibility & Rollback', targets: ['packaged'], gates: ['full'], requirements: ['workspace.relocation', 'workspace.rollback'], script: 'scripts/verify-workspace-relocation.mjs' }),
  suite({ id: 'desktop.skin-center-packaged', name: 'Skin Center Live Apply & Relaunch Persistence', targets: ['packaged'], gates: ['full'], requirements: ['skins.apply', 'skins.persistence'], script: 'scripts/verify-skin-center.mjs' }),
  suite({ id: 'desktop.profile-reset-packaged', name: 'Packaged Cleared Profile Rebuild', targets: ['packaged'], gates: ['full'], requirements: ['profile.reset', 'profile.rebuild'], script: 'scripts/verify-packaged-profile-reset.mjs' }),
]

const PLATFORM_PACKAGED_SUITES = {
  darwin: [suite({ id: 'desktop.macos-lifecycle-packaged', name: 'Packaged macOS Quit & Unsigned Update Policy', platforms: ['darwin'], targets: ['packaged'], gates: ['full'], requirements: ['macos.quit', 'macos.activation', 'macos.unsigned-update'], script: 'scripts/verify-macos-lifecycle.mjs' })],
  win32: [
    suite({ id: 'desktop.installer-lifecycle-windows', name: 'Compiled NSIS Upgrade & Rollback Lifecycle', platforms: ['win32'], targets: ['packaged'], gates: ['full'], requirements: ['install.upgrade', 'install.rollback'], script: 'scripts/verify-installer-lifecycle.mjs', timeoutMs: 360_000 }),
    suite({ id: 'desktop.update-shutdown-windows', name: 'Packaged Update Shutdown Receipt', platforms: ['win32'], targets: ['packaged'], gates: ['full'], requirements: ['update.shutdown', 'update.receipt'], script: 'scripts/verify-update-shutdown.mjs' }),
  ],
}

export function getRegressionSuites({ platform = process.platform, full = false } = {}) {
  const core = [
    ...CORE_SUITES.slice(0, 13),
    ...(platform === 'win32' ? WINDOWS_CORE_SUITES : []),
    ...CORE_SUITES.slice(13),
  ].filter(item => item.platforms.includes(platform))
  if (!full) return core
  return [...core, ...PACKAGED_SUITES.filter(item => item.platforms.includes(platform)), ...(PLATFORM_PACKAGED_SUITES[platform] ?? [])]
}

export function resolveSuiteTarget(suiteDefinition, { packagedExecutable } = {}) {
  if (suiteDefinition.targets.length === 1) return suiteDefinition.targets[0]
  return packagedExecutable && suiteDefinition.targets.includes('packaged') ? 'packaged' : 'source'
}

export function validateRegressionSuites(suites, { appDir } = {}) {
  const errors = []
  const ids = new Set()
  const allowedTargets = new Set(['source', 'fixture', 'packaged', 'legacy-artifact'])
  const allowedGates = new Set(['core', 'full', 'nightly', 'release'])
  for (const item of suites) {
    if (!item.id || !/^[a-z0-9][a-z0-9.-]+$/.test(item.id)) errors.push(`invalid suite id: ${item.id ?? '<missing>'}`)
    else if (ids.has(item.id)) errors.push(`duplicate suite id: ${item.id}`)
    ids.add(item.id)
    for (const field of ['name', 'tier', 'script', 'owner', 'network']) {
      if (typeof item[field] !== 'string' || !item[field]) errors.push(`${item.id ?? '<missing>'}: missing ${field}`)
    }
    for (const field of ['targets', 'platforms', 'gates', 'requirements', 'args', 'requires']) {
      if (!Array.isArray(item[field])) errors.push(`${item.id ?? '<missing>'}: ${field} must be an array`)
    }
    for (const target of item.targets ?? []) if (!allowedTargets.has(target)) errors.push(`${item.id}: unknown target ${target}`)
    for (const gate of item.gates ?? []) if (!allowedGates.has(gate)) errors.push(`${item.id}: unknown gate ${gate}`)
    if (!(item.timeoutMs > 0)) errors.push(`${item.id}: timeoutMs must be positive`)
    if (!(item.cleanupTimeoutMs > 0)) errors.push(`${item.id}: cleanupTimeoutMs must be positive`)
    if (appDir && item.script !== '--test' && !existsSync(resolve(appDir, item.script))) errors.push(`${item.id}: script does not exist: ${item.script}`)
    if (!(item.requirements?.length > 0)) errors.push(`${item.id}: requirements must not be empty`)
  }
  if (errors.length) throw new Error(`Invalid regression suite catalogue:\n${errors.join('\n')}`)
  return suites
}
