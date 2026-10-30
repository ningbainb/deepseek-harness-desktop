import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// Resolve the public NPM service through the same official bundle as Runtime.
const require = createRequire(import.meta.url)
const sdk = createRequire(require.resolve('@deepseek-ai/dsh-base/package.json'))
const { default: PermissionPresetService } = await import(pathToFileURL(sdk.resolve('@deepseek-ai/dsh-permission-presets')).href)

function preserveDesktopPermissionDefault(ctx, config) {
  // Do not select an existing broader preset just to satisfy SDK validation.
  // Keep both actual knobs, user catalogs and explicit defaults authoritative.
  const selected = config.defaultPreset.get()
  const desktopSpec = { sandbox: 'danger-full-access', approval: 'ask', name: '完整文件权限，操作前询问' }
  let presets = config.presets
  // The official form persists only the selected ID. Reconstruct our own
  // encoded combination after restart, never a missing arbitrary user preset.
  if (typeof selected === 'string' && /^desktop-full-access-ask(?:-(?:[2-9]|[1-9]\d+))?$/u.test(selected)
    && !Object.hasOwn(presets, selected)) {
    presets = { ...presets, [selected]: desktopSpec }
  }
  const sandbox = ctx.shell.sandboxMode
  const approval = ctx.approval.config.policy ?? 'ask'
  if (sandbox === 'danger-full-access' && approval === 'ask'
    && !Object.values(presets).some(spec => spec.sandbox === sandbox && spec.approval === approval)) {
    // SDK captures this inference at construction, including when an explicit
    // volatile default is later cleared. Keep the captured fallback valid.
    let name = 'desktop-full-access-ask'
    for (let suffix = 2; Object.hasOwn(presets, name); suffix += 1) name = `desktop-full-access-ask-${suffix}`
    presets = { ...presets, [name]: desktopSpec }
  }
  return presets === config.presets ? config : { ...config, presets }
}

export default class DesktopPermissionPresets extends PermissionPresetService {
  constructor(ctx, config) {
    super(ctx, preserveDesktopPermissionDefault(ctx, config))
  }
}
