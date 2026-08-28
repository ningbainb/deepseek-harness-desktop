import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ProjectMatcher } from '../../src/conversation-import/project-matcher.mjs'
import { MATCH_STATUS } from '../../src/conversation-import/schema.mjs'

test('ProjectMatcher detects exact canonical path match', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'matcher-exact-'))
  try {
    const projectDir = join(tempDir, 'project-a')
    await mkdir(projectDir, { recursive: true })

    const result = await ProjectMatcher.matchProject(
      { originalCwd: projectDir },
      projectDir,
    )

    assert.equal(result.status, MATCH_STATUS.EXACT_PATH)
    assert.equal(result.isExactMatch, true)
    assert.equal(result.revisionChanged, false)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('ProjectMatcher detects Git revision changes when HEAD has advanced', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'matcher-git-rev-'))
  try {
    const projectDir = join(tempDir, 'repo')
    const gitDir = join(projectDir, '.git')
    await mkdir(gitDir, { recursive: true })
    await writeFile(join(gitDir, 'HEAD'), '11223344556677889900aabbccddeeff', 'utf8')

    const result = await ProjectMatcher.matchProject(
      {
        originalCwd: projectDir,
        historicalRevision: '001122334455',
      },
      projectDir,
    )

    assert.equal(result.status, MATCH_STATUS.EXACT_PATH)
    assert.equal(result.revisionChanged, true)
    assert.equal(result.historicalRevision, '001122334455')
    assert.equal(result.currentRevision, '112233445566')
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('ProjectMatcher matches Git remote when directory was moved', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'matcher-remote-'))
  try {
    const currentWorkspace = join(tempDir, 'new-location')
    const gitDir = join(currentWorkspace, '.git')
    await mkdir(gitDir, { recursive: true })
    await writeFile(
      join(gitDir, 'config'),
      '[remote "origin"]\n  url = https://github.com/my-org/my-repo.git\n',
      'utf8',
    )
    await writeFile(join(gitDir, 'HEAD'), 'aabbccddeeff', 'utf8')

    const nonExistentOldPath = 'C:\\old\\non\\existent\\path\\my-repo'

    const result = await ProjectMatcher.matchProject(
      {
        originalCwd: nonExistentOldPath,
        historicalRemote: 'git@github.com:my-org/my-repo.git',
        historicalRevision: '1234567890ab',
      },
      currentWorkspace,
    )

    assert.equal(result.status, MATCH_STATUS.GIT_REMOTE)
    assert.equal(result.revisionChanged, true)
    assert.ok(result.message.includes('Git 远程仓库与当前工作区一致'))
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('ProjectMatcher rejects non-existent path when remotes do not match', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'matcher-mismatch-'))
  try {
    const currentWorkspace = join(tempDir, 'unrelated-repo')
    const gitDir = join(currentWorkspace, '.git')
    await mkdir(gitDir, { recursive: true })
    await writeFile(
      join(gitDir, 'config'),
      '[remote "origin"]\n  url = https://github.com/other-org/other-repo.git\n',
      'utf8',
    )

    const nonExistentOldPath = 'C:\\old\\path\\different-repo'

    const result = await ProjectMatcher.matchProject(
      {
        originalCwd: nonExistentOldPath,
        historicalRemote: 'https://github.com/my-org/my-repo.git',
      },
      currentWorkspace,
    )

    assert.equal(result.status, MATCH_STATUS.PATH_NOT_FOUND)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
