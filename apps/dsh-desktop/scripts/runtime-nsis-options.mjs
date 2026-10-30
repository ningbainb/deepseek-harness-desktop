export function configureNormalNsisBuild(options, adapter) {
  if (adapter.schemaVersion !== 2 || !/^[a-f0-9]{64}$/u.test(adapter.manifestSHA256)) throw new Error('Invalid NSIS adapter identity')
  if (!/^[a-z]:[\\/]/iu.test(adapter.directory) || /["$\r\n]/u.test(adapter.directory)) throw new Error('Invalid NSIS include path')
  if (typeof options.config === 'object' && options.config?.nsis?.script) throw new Error('A custom NSIS script would bypass the normal uninstaller lifecycle')
  const restorationBytes = adapter.restorationBytes
  if (!Number.isSafeInteger(restorationBytes) || restorationBytes < 0) throw new Error('Invalid runtime restoration byte size')
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
    // CLI preprocessing runs before sharedHeader adds the stock include path.
    // Keep the stock main script, uninstaller generation, signing and size gates.
    commands['!addincludedir'] = `"${adapter.directory.replaceAll('\\', '/')}"`
    return false
  } }
}
