export const RUNTIME_HTTP_READY_LINE = 'dsh desktop web: ready'

export async function finalizeRuntimeReadiness({ commit, hmr, announce, isStopping = () => false }) {
  if (isStopping()) return false
  commit()
  if (isStopping()) return false
  if (typeof hmr?.runExclusive === 'function') {
    try { await hmr.runExclusive(async () => {}) } catch (error) {
      if (isStopping()) return false
      throw error
    }
  }
  if (isStopping()) return false
  announce()
  return true
}
