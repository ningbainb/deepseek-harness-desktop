/** Desktop-owned, loopback-only authority for native workspace-file opening. */

import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-workspace'
import { desktopJsonPost, writeJson } from './desktop-json-post.ts'
import {
  DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV,
  isSafeDesktopWorkspaceFileOpenPath,
} from './workspace-file-open-policy.ts'

export const DESKTOP_WORKSPACE_FILE_OPEN_TARGET_PATH = '/desktop/workspace-file-open-target'

const MAX_ROOT_LENGTH = 32_767
const MAX_RELATIVE_PATH_LENGTH = 4_096
const MAX_BODY_BYTES = 1 << 20

type WorkspaceAuthority = {
  resolveByPath(path: string): Promise<{ path: string } | undefined>
}

type OpenTargetFailure = {
  ok: false
  error: { code: string; message: string }
}
type OpenTargetSuccess = {
  ok: true
  value: { path: string }
}

function failure(code: string, message: string): OpenTargetFailure {
  return { ok: false, error: { code, message } }
}

function normalizeForPrefix(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/u, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function isPathInside(root: string, child: string): boolean {
  if (root === '' || child === '') return false
  const normalizedRoot = normalizeForPrefix(root)
  const normalizedChild = normalizeForPrefix(child)
  return normalizedChild === normalizedRoot || normalizedChild.startsWith(`${normalizedRoot}/`)
}

function isSameCanonicalPath(left: string, right: string): boolean {
  return normalizeForPrefix(left) === normalizeForPrefix(right)
}

function isGitPath(path: string): boolean {
  return path.replaceAll('\\', '/').split('/').some(part => part.toLowerCase() === '.git')
}

function normalizeRequest(value: unknown): { root: string; path: string } | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const root = typeof record.root === 'string' ? record.root.trim() : ''
  const path = typeof record.path === 'string' ? record.path.trim().replaceAll('\\', '/') : ''
  if (root.length === 0 || root.length > MAX_ROOT_LENGTH || !isAbsolute(root)) return undefined
  if (
    path.length === 0
    || path.length > MAX_RELATIVE_PATH_LENGTH
    || path.startsWith('/')
    || /^[a-z]:/iu.test(path)
    || path.split('/').some(segment => segment.length === 0 || segment === '..' || segment.includes(':'))
    || !isSafeDesktopWorkspaceFileOpenPath(path)
  ) return undefined
  return { root, path }
}

/**
 * Resolve only an exact registered workspace root. The launch capability
 * authenticates Electron main to this Host route; it intentionally is not a
 * browser-session identifier. The public DSH route protocol has no
 * renderer-session credential to verify here, so a supplied session field
 * would merely be forgeable browser input.
 */
export async function resolveDesktopWorkspaceFileOpenTarget(
  workspaceRegistry: WorkspaceAuthority,
  request: { root: string; path: string },
): Promise<OpenTargetSuccess | OpenTargetFailure> {
  const normalizedRequest = normalizeRequest(request)
  if (normalizedRequest === undefined) {
    return failure('invalid-request', 'workspace file request is invalid')
  }

  let workspace: { path: string } | undefined
  try {
    workspace = await workspaceRegistry.resolveByPath(normalizedRequest.root)
  } catch {
    return failure('workspace-unknown', 'workspace root is not registered')
  }
  if (workspace === undefined) return failure('workspace-unknown', 'workspace root is not registered')

  let requestedRoot: string
  let root: string
  try {
    requestedRoot = await realpath(normalizedRequest.root)
    root = await realpath(workspace.path)
  } catch {
    return failure('workspace-unknown', 'workspace root is unavailable')
  }
  // Do not trust a containing-path registry implementation: the canonical
  // request root must itself equal the resolved registry owner.
  if (!isSameCanonicalPath(requestedRoot, root)) {
    return failure('workspace-unknown', 'workspace root is not registered')
  }

  const candidate = join(root, normalizedRequest.path)
  if (!isPathInside(root, candidate) || isGitPath(normalizedRequest.path)) {
    return failure('path-outside-root', 'workspace file path is not allowed')
  }

  let target: string
  try {
    target = await realpath(candidate)
  } catch {
    return failure('not-found', 'workspace file was not found')
  }
  if (!isPathInside(root, target) || isGitPath(relative(root, target))) {
    return failure('path-outside-root', 'workspace file path is not allowed')
  }

  let info: Awaited<ReturnType<typeof stat>>
  try {
    info = await stat(target)
  } catch {
    return failure('not-found', 'workspace file was not found')
  }
  if (info.isDirectory()) return failure('is-directory', 'workspace target is a directory')
  if (!info.isFile()) return failure('external-open-denied', 'only regular files may be opened')
  if (!isSafeDesktopWorkspaceFileOpenPath(target)) {
    return failure('external-open-denied', 'workspace file type is not allowed for native opening')
  }
  return { ok: true, value: { path: target } }
}

/** Create the exact route so unit tests can exercise its transport fence. */
export function createDesktopWorkspaceFileOpenRoute(
  workspaceRegistry: WorkspaceAuthority,
  { capabilityToken = process.env[DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV] }: { capabilityToken?: string } = {},
): WebRoute {
  // Capture the process-private launch token when the route is mounted. A
  // restart creates a new Host process and therefore a new authority.
  return {
    kind: 'exact',
    path: DESKTOP_WORKSPACE_FILE_OPEN_TARGET_PATH,
    handler: desktopJsonPost(capabilityToken, MAX_BODY_BYTES, async (body, response) => {
      const requestValue = normalizeRequest(body)
      if (requestValue === undefined) {
        writeJson(response, 400, failure('bad-request', 'malformed workspace file request'))
        return
      }
      writeJson(response, 200, await resolveDesktopWorkspaceFileOpenTarget(workspaceRegistry, requestValue))
    }),
  }
}

/** Register the authority with the always-mounted Desktop compat bundle. */
export function registerDesktopWorkspaceFileOpenRoute(ctx: Context): () => void {
  return ctx.webServer.register(createDesktopWorkspaceFileOpenRoute(ctx.workspaceRegistry, {
    capabilityToken: process.env[DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV],
  }))
}
