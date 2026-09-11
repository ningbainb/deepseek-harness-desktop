/** Reversible install preparation is not an actual application quit. */
export function createDesktopInstallPreparation({
  lifecycle,
  isQuitRequested,
  setPreparing,
  recordInstallRequested = async () => {},
  finishPreparation = async () => {},
  log = async () => {},
}) {
  let generation = 0
  let attempt
  let recovery
  const report = async message => {
    try { await log(message) } catch { /* Diagnostics cannot block recovery. */ }
  }
  const beforeInstall = async () => {
    const current = { generation: ++generation, begun: false }
    attempt = current
    const assertCurrent = () => {
      if (current.generation !== generation || isQuitRequested() || lifecycle.resourcesDisposed) {
        throw new Error('Desktop install preparation was cancelled')
      }
    }
    if (recovery) await recovery
    assertCurrent()
    await recordInstallRequested()
    assertCurrent()
    current.begun = true
    setPreparing(true)
    await lifecycle.stop()
    assertCurrent()
    await finishPreparation()
    assertCurrent()
  }
  const onInstallFailure = error => {
    if (recovery) return recovery
    const current = ++generation
    const begun = attempt?.begun === true
    attempt = undefined
    const operation = Promise.resolve().then(async () => {
      if (isQuitRequested() || lifecycle.resourcesDisposed) {
        await report(`[updater] install recovery suppressed because app quit is in progress: ${error instanceof Error ? error.message : String(error)}`)
        return false
      }
      // A timed-out receipt write has not stopped anything. Its late result
      // must not enter preparation after the error has already been handled.
      if (!begun) return true
      setPreparing(false)
      const recovered = await lifecycle.recover({
        canRecover: () => current === generation && !isQuitRequested(),
      })
      await report(recovered
        ? '[updater] runtime recovered after installer launch failure'
        : '[updater] runtime recovery failed after installer launch failure')
      return recovered
    }).finally(() => { if (recovery === operation) recovery = undefined })
    recovery = operation
    return operation
  }
  return Object.freeze({ beforeInstall, onInstallFailure })
}
