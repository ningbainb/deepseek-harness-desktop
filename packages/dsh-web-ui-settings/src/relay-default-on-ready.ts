import type { AppReady } from '@deepseek-ai/dsh-cmdline'

export function initializeRelayDefaultOnReady(ready: AppReady, initialize: () => Promise<void>, onError: () => void): () => void {
  let active = true
  let started = false
  const cancel = ready.onReady(() => {
    if (!active || started) return
    started = true
    void initialize().catch(() => { if (active) onError() })
  })
  return () => { active = false; cancel() }
}
