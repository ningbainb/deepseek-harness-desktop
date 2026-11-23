export type ApprovalItem = {
  id: string
  sessionId: string
  toolName: string
  argumentCount?: number
  waitingSince: number
}
export type Change = { path: string; status: string; added?: number; removed?: number }
export type WorkspaceChanges = { id: string; title: string; files: Change[]; unavailable?: boolean; truncated?: boolean }
export type ChangesPage = { workspaces: WorkspaceChanges[]; nextOffset?: number }
export type DiffPreview = { text: string; truncated: boolean }
