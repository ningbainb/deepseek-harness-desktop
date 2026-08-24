import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  claimRepairJob,
  loadRepairJob,
  writeRepairResult,
} from '../src/job.ts'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const incident = await mkdtemp(join(tmpdir(), 'dsh-repair-job-'))
  roots.push(incident)
  const workspace = join(incident, 'staging')
  await mkdir(join(workspace, 'profile'), { recursive: true })
  const jobPath = join(incident, 'job.json')
  const resultPath = join(incident, 'result.json')
  await writeFile(jobPath, `${JSON.stringify({
    schemaVersion: 1,
    jobId: 'repair-job-1',
    fingerprint: 'a'.repeat(64),
    sessionId: 'desktop-repair-a',
    workspace,
    resultPath,
    roots: [{ id: 'profile', kind: 'profile', relativePath: 'profile' }],
    commands: [{
      name: 'profile-test',
      executable: process.execPath,
      args: ['--version'],
      cwd: 'profile',
    }],
    settings: {
      defaultToolsCapability: 'none',
      fallbackModels: [{
        provider: 'fallback',
        model: 'repair-2',
        toolsCapability: 'native',
      }],
    },
    timeoutMs: 90_000,
  }, null, 2)}\n`)
  return { incident, workspace, jobPath, resultPath }
}

describe('repair job boundary', () => {
  it('loads and claims one atomic job, then identifies a completed duplicate', async () => {
    const { jobPath, resultPath } = await fixture()
    const job = await loadRepairJob(jobPath)
    expect(job.roots[0]).toEqual({ id: 'profile', kind: 'profile', relativePath: 'profile' })
    expect(job.settings).toEqual({
      defaultToolsCapability: 'none',
      fallbackModels: [{
        provider: 'fallback',
        model: 'repair-2',
        toolsCapability: 'native',
      }],
    })
    expect((await claimRepairJob(job)).claimed).toBe(true)
    await writeRepairResult(job, {
      status: 'model-unavailable',
      summary: 'No configured model was available.',
      diagnosis: 'model-unavailable',
      changedFiles: [],
      checksRequested: [],
      attempts: [],
      actions: [],
    })
    expect((await claimRepairJob(job)).duplicate).toBe(true)
    expect(JSON.parse(await readFile(resultPath, 'utf8')).status).toBe('model-unavailable')
  })

  it('rejects jobs that expose original paths or place output outside the incident', async () => {
    const { incident, jobPath } = await fixture()
    const value = JSON.parse(await readFile(jobPath, 'utf8'))
    value.originalProfile = 'C:\\Users\\private\\.dsh\\profiles\\desktop'
    value.resultPath = join(incident, '..', 'outside-result.json')
    await writeFile(jobPath, JSON.stringify(value))
    await expect(loadRepairJob(jobPath)).rejects.toThrow(/repair job fields|incident directory/u)
  })
})
