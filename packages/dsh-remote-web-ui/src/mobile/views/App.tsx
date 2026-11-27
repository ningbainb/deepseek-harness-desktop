/**
 * Mobile surface root: the view state machine (workspaces → sessions →
 * chat) and the top-level data flows. Deliberately plain React state — no
 * router, no state library: the surface is three fixed levels with a back
 * affordance, and every piece of data is fetched on demand.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspaceView as WorkspaceRow } from '../../mobile-contract.ts'
import { MuxClient } from '../mux.ts'
import type { SessionView } from './presentation.ts'
import { ChatView } from './ChatView.tsx'
import { SessionListView } from './SessionListView.tsx'
import { WorkspaceView as WorkspaceRoster } from './WorkspaceView.tsx'

/** One navigation level. */
type Route =
  | { kind: 'workspaces' }
  | { kind: 'sessions'; workspace: WorkspaceRow }
  | { kind: 'chat'; session: SessionView; workspace: WorkspaceRow }

/** One rendered chat message (produced by the fold). */
export interface RenderMessage {
  id: string
  kind: 'user' | 'assistant'
  text: string
  seq: number
  time: number
  pending?: boolean
  failed?: boolean
  toolSummary?: string
}

/** Read the optional workspace target carried from the pairing QR flow. */
export function mobileWorkspaceTarget(search: string): string | undefined {
  const value = new URLSearchParams(search).get('workspace')
  return value === null || value === '' ? undefined : value
}

/**
 * The surface root.
 * @returns the app tree.
 */
export function App() {
  const [route, setRoute] = useState<Route>({ kind: 'workspaces' })
  const [initialWorkspaceId, setInitialWorkspaceId] = useState<string | undefined>(
    () => mobileWorkspaceTarget(window.location.search),
  )
  const muxRef = useRef<MuxClient | undefined>(undefined)

  // The mux stream lives for the page lifetime: session events keep the
  // open chat live, and reconnect is automatic.
  useEffect(() => {
    const mux = new MuxClient()
    muxRef.current = mux
    mux.start()
    return () => { mux.stop() }
  }, [])

  // Keep the live-event client pointed at the session currently on screen so
  // its polling fallback can keep that chat fresh over SSE-impairing tunnels
  // (quick tunnel / Tailscale Serve do not forward Server-Sent Events).
  useEffect(() => {
    muxRef.current?.observe(route.kind === 'chat' ? route.session.sessionId : undefined)
  }, [route])

  const back = useCallback(() => {
    setRoute(previous => {
      if (previous.kind === 'chat') return { kind: 'sessions', workspace: previous.workspace }
      if (previous.kind === 'sessions') return { kind: 'workspaces' }
      return previous
    })
  }, [])

  const openChat = useCallback((session: SessionView, workspace: WorkspaceRow) => {
    setRoute({ kind: 'chat', session, workspace })
  }, [])

  const openWorkspace = useCallback((workspace: WorkspaceRow) => {
    if (initialWorkspaceId !== undefined) {
      const url = new URL(window.location.href)
      url.searchParams.delete('workspace')
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
      setInitialWorkspaceId(undefined)
    }
    setRoute({ kind: 'sessions', workspace })
  }, [initialWorkspaceId])

  return (
    <div className="mobile">
      {route.kind === 'workspaces'
        ? <WorkspaceRoster initialWorkspaceId={initialWorkspaceId} onPick={openWorkspace} />
        : route.kind === 'sessions'
          ? (
            <SessionListView
              workspace={route.workspace}
              onBack={back}
              onPick={(session) => { openChat(session, route.workspace) }}
            />
          )
          : <ChatView session={route.session} mux={muxRef.current} onBack={back} />}
    </div>
  )
}

// The package exposes src subpaths. Keep the original imports available to consumers.
export { listSessions, listWorkspaces, loadHistory, prompt } from '../api.ts'
export { errorText, formatTime, staleHostHint, toSessionView, type SessionView } from './presentation.ts'
