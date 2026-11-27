import { useEffect, useSyncExternalStore } from 'react'
import { acpStore } from './acpStore.ts'
import { GeminiModelMenu } from './GeminiModelMenu.tsx'

export interface GeminiComposerTriggerProps {
  sessionId?: string
  useSessions?: <T>(selector: (state: { byId: Record<string, { cwd?: string }> }) => T) => T
}

function noopUseSessions<T>(_selector: (state: { byId: Record<string, { cwd?: string }> }) => T): T | undefined {
  return undefined
}

export function GeminiComposerTrigger({ sessionId, useSessions }: GeminiComposerTriggerProps) {
  const snap = useSyncExternalStore(acpStore.subscribe, acpStore.getSnapshot, acpStore.getSnapshot)
  const selectSessions = useSessions ?? noopUseSessions
  const cwd = selectSessions(state => (sessionId ? state.byId[sessionId]?.cwd : undefined))

  useEffect(() => {
    void acpStore.refreshDiagnostic()
  }, [])

  const models = snap.availableModels.length > 0 ? snap.availableModels : (snap.diagnostic?.models ?? [])
  if (snap.diagnostic?.state !== 'ready' || models.length === 0) {
    return null
  }

  return (
    <GeminiModelMenu
      models={models}
      currentModelId={snap.active ? snap.selectedModelId : undefined}
      triggerLabel="Gemini"
      onSelectModel={(modelId) => {
        void acpStore.openWithModel(modelId, cwd)
      }}
    />
  )
}
