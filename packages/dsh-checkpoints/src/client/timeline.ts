import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Checkpoint } from '../core/protocol.ts'
import { checkpointList } from './api.ts'
import { changedTurns } from './model.ts'

const timelines = new Map<string, ReturnType<typeof createTimeline>>()

function createTimeline(sessionId: string) {
  let checkpoints: readonly Checkpoint[] = []
  let turns = changedTurns(checkpoints)
  let request: AbortController | undefined
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let latestSeq = -1
  const listeners = new Set<() => void>()

  function refresh() {
    request?.abort()
    const controller = new AbortController()
    request = controller
    void checkpointList(sessionId, controller.signal).then(next => {
      if (controller.signal.aborted) return
      const previous = new Map(checkpoints.map(item => [item.checkpointId, item]))
      checkpoints = next.map(item => {
        const prior = previous.get(item.checkpointId)
        return prior?.source === item.source ? prior : item
      })
      turns = changedTurns(checkpoints)
      for (const listener of listeners) listener()
    }).catch(() => {})
  }

  return {
    list: () => checkpoints,
    at: (turn: string) => turns.get(turn),
    subscribe(listener: () => void) {
      if (idleTimer !== undefined) clearTimeout(idleTimer)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size > 0) return
        idleTimer = setTimeout(() => {
          clearTimeout(refreshTimer)
          request?.abort()
          timelines.delete(sessionId)
        }, 5000)
      }
    },
    observe(seq: number) {
      if (seq <= latestSeq) return
      latestSeq = seq
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        refresh()
        // An interrupted turn can commit just after the closing event is projected.
        refreshTimer = setTimeout(refresh, 1250)
      }, 150)
    },
    refresh,
  }
}

function getOrCreateTimeline(sessionId: string) {
  const existing = timelines.get(sessionId)
  if (existing) return existing
  const created = createTimeline(sessionId)
  timelines.set(sessionId, created)
  return created
}

export function useCheckpointTimeline(sessionId: string, turn: number, seq: number) {
  const timeline = useMemo(() => getOrCreateTimeline(sessionId), [sessionId])
  const getTurn = useCallback(() => timeline.at(String(turn)), [timeline, turn])
  const checkpoint = useSyncExternalStore(timeline.subscribe, getTurn, getTurn)
  useEffect(() => { timeline.observe(seq) }, [timeline, seq])
  return { checkpoint, timeline }
}

export function useSessionCheckpoints(sessionId: string) {
  const timeline = useMemo(() => getOrCreateTimeline(sessionId), [sessionId])
  const checkpoints = useSyncExternalStore(timeline.subscribe, timeline.list, timeline.list)
  useEffect(() => { timeline.refresh() }, [timeline])
  return { checkpoints, timeline }
}
