import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openWorkspaceDocument } from '../src/host/workspace.ts'

let home: string
let workspace: string

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), 'dsh-doc-workspace-')))
  workspace = join(home, 'workspace')
  await mkdir(workspace)
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

describe('document workspace boundary', () => {
  it('reads a supported file inside the agent workspace', async () => {
    await writeFile(join(workspace, 'inside.rtf'), '{\\rtf1 hello}')
    const result = await openWorkspaceDocument(workspace, 'inside.rtf')
    expect(result.format).toBe('rtf')
    expect(new TextDecoder().decode(result.bytes)).toContain('hello')
  })

  it('rejects parent traversal and cross-workspace links', async () => {
    const outside = join(home, 'outside')
    await mkdir(outside)
    await writeFile(join(outside, 'secret.rtf'), '{\\rtf1 protected}')
    await symlink(outside, join(workspace, 'external'), 'junction')
    await expect(openWorkspaceDocument(workspace, '../outside/secret.rtf')).rejects.toThrow(/workspace/i)
    await expect(openWorkspaceDocument(workspace, 'external/secret.rtf')).rejects.toThrow(/workspace/i)
  })

  it('rejects system and alternate-stream path syntax before accessing the file', async () => {
    await expect(openWorkspaceDocument(workspace, 'inside.rtf:hidden')).rejects.toThrow(/path/i)
    await expect(openWorkspaceDocument(workspace, 'NUL.rtf')).rejects.toThrow(/path/i)
  })
})
