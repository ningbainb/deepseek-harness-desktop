import { type DocumentMetadata, type DocumentResult, type ReadOptions } from '../core/types.ts'
import { runParseWorker } from './worker.ts'
import { openWorkspaceDocument } from './workspace.ts'

const MAX_ACTIVE_JOBS = 2
let activeJobs = 0

export async function withIngestJob<T>(task: () => Promise<T>): Promise<T> {
  if (activeJobs >= MAX_ACTIVE_JOBS) throw new Error('Document extraction is busy. Retry when the current extraction finishes.')
  activeJobs++
  try {
    return await task()
  } finally {
    activeJobs--
  }
}

export async function readDocument(
  workspacePath: string,
  path: string,
  options: ReadOptions = {},
): Promise<DocumentResult> {
  return withIngestJob(async () => {
    const { signal, ...selection } = options
    const { format, bytes } = await openWorkspaceDocument(workspacePath, path, signal)
    return runParseWorker({ kind: 'document', format, bytes, selection, inspect: false }, { signal })
  })
}

export async function inspectDocument(
  workspacePath: string,
  path: string,
  options: { signal?: AbortSignal } = {},
): Promise<DocumentMetadata> {
  return withIngestJob(async () => {
    const { signal } = options
    const { format, bytes } = await openWorkspaceDocument(workspacePath, path, signal)
    const result = await runParseWorker({ kind: 'document', format, bytes, selection: {}, inspect: true }, { signal })
    return result.metadata
  })
}
