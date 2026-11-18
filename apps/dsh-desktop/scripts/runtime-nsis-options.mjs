const EXTERNAL_BROWSER_CORE_TARGETS = Object.freeze([
  'DeepSeek Harness Desktop.exe',
  'resources/app.asar',
  'resources/app.asar.unpacked/package.json',
  'resources/app.asar.unpacked/runtime-support/browser-component.json',
])

const WINDOWS_OFFICE_ROOT = 'resources/app.asar.unpacked/node_modules/@deepseek-ai/libreoffice-kit-win32-x64'

/** Inspect the real compressed payload, preserving the legacy nested-runtime contract. */
export function verifyNormalNsisArchive(adapter, archivePaths) {
  if (!archivePaths.has('resources/runtime-reconstruction/manifest.json')) throw new Error('NSIS archive has no offline reconstruction metadata')
  if (!Array.isArray(adapter.omittedTargets)) throw new Error('Missing verified Windows NSIS payload')
  for (const target of adapter.omittedTargets) if (archivePaths.has(target)) throw new Error('NSIS reused a stale complete-runtime archive')
  if (adapter.externalBrowserRuntime === true && adapter.fullRuntime !== true) throw new Error('Incomplete external-browser adapter')
  if (adapter.fullRuntime !== true) return
  const required = adapter.requiredTargets
  if (adapter.omittedTargets.length !== 0 || !Array.isArray(required)) throw new Error('Incomplete full-runtime adapter')
  if (adapter.externalBrowserRuntime === true) {
    if (required.length !== EXTERNAL_BROWSER_CORE_TARGETS.length
      || new Set(required).size !== required.length
      || EXTERNAL_BROWSER_CORE_TARGETS.some(target => !required.includes(target))) throw new Error('Incomplete external-browser core adapter')
    for (const target of archivePaths) {
      if (/(?:^|\/)node_modules\/electron\//u.test(target)) throw new Error('External-browser archive includes a nested Electron runtime')
      if (/(?:^|\/)node_modules\/@deepseek-ai\/libreoffice-kit-wasm(?:\/|$)/u.test(target)) {
        throw new Error('Windows NSIS archive includes the secondary Office WASM engine')
      }
    }
    for (const file of ['prebuilds.json', 'bin/dsoffice.exe']) {
      if (!archivePaths.has(`${WINDOWS_OFFICE_ROOT}/${file}`)) throw new Error(`Windows NSIS native Office engine file missing: ${file}`)
    }
  } else if (!required.includes('resources/app.asar.unpacked/node_modules/electron/dist/electron.exe')) {
    throw new Error('Incomplete full-runtime adapter')
  }
  for (const target of required) if (!archivePaths.has(target)) throw new Error(`Complete NSIS runtime target missing: ${target}`)
}

export function configureNormalNsisBuild(options, adapter) {
  if (adapter.schemaVersion !== 2 || !/^[a-f0-9]{64}$/u.test(adapter.manifestSHA256)) throw new Error('Invalid NSIS adapter identity')
  if (!/^[a-z]:[\\/]/iu.test(adapter.directory) || /["$\r\n]/u.test(adapter.directory)) throw new Error('Invalid NSIS include path')
  if (typeof options.config === 'object' && options.config?.nsis?.script) throw new Error('A custom NSIS script would bypass the normal uninstaller lifecycle')
  const restorationBytes = adapter.restorationBytes
  if (!Number.isSafeInteger(restorationBytes) || restorationBytes < 0) throw new Error('Invalid runtime restoration byte size')
  if (adapter.fullRuntime === true && restorationBytes !== 0) throw new Error('Complete runtime payload cannot require restoration')
  if (adapter.externalBrowserRuntime === true && adapter.fullRuntime !== true) throw new Error('External browser payload requires complete core verification')
  const restorationKiB = Math.ceil(restorationBytes / 1024)
  const accounted = new WeakSet()
  const previous = options.effectiveOptionComputed
  return { ...options, effectiveOptionComputed: async values => {
    if (previous && await previous(values)) throw new Error('NSIS build was cancelled by an existing options hook')
    const [defines, commands] = values
    if (!accounted.has(defines)) {
      if (restorationBytes || defines.APP_64_UNPACKED_SIZE !== undefined) {
        const compactKiB = Number(defines.APP_64_UNPACKED_SIZE)
        const estimatedKiB = Number(defines.ESTIMATED_SIZE)
        if (!Number.isSafeInteger(compactKiB) || compactKiB < 0 || !Number.isSafeInteger(estimatedKiB) || estimatedKiB < 0) {
          throw new Error('Invalid NSIS installation space estimate')
        }
        const completeKiB = Math.max(compactKiB, estimatedKiB) + restorationKiB
        if (!Number.isSafeInteger(completeKiB) || completeKiB > 0x7fffffff) throw new Error('NSIS installation space estimate overflow')
        defines.APP_64_UNPACKED_SIZE = String(completeKiB)
        defines.ESTIMATED_SIZE = completeKiB
      }
      accounted.add(defines)
    }
    if (Object.hasOwn(commands, '!addincludedir')) throw new Error('Unexpected existing NSIS include override')
    defines.DSH_RUNTIME_MANIFEST_SHA256 = adapter.manifestSHA256
    if (adapter.fullRuntime === true) defines.DSH_RUNTIME_FULL_PAYLOAD = '1'
    if (adapter.externalBrowserRuntime === true) defines.DSH_RUNTIME_EXTERNAL_BROWSER_PAYLOAD = '1'
    // CLI preprocessing runs before sharedHeader adds the stock include path.
    // Keep the stock main script, uninstaller generation, signing and size gates.
    commands['!addincludedir'] = `"${adapter.directory.replaceAll('\\', '/')}"`
    return false
  } }
}
