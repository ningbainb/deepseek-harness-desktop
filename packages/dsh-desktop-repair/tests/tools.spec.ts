import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RepairToolController } from '../src/tools.ts'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const incident = await mkdtemp(join(tmpdir(), 'dsh-repair-tools-'))
  roots.push(incident)
  const workspace = join(incident, 'staging')
  await mkdir(join(workspace, 'profile'), { recursive: true })
  await mkdir(join(workspace, 'plugins', 'example'), { recursive: true })
  await writeFile(join(workspace, 'profile', 'package.json'), '{"name":"profile"}\n')
  await writeFile(join(workspace, 'plugins', 'example', 'index.mjs'), 'export const broken = true\n')
  const runCommand = vi.fn(async () => ({ exitCode: 0, stdout: 'ok', stderr: '', timedOut: false }))
  const controller = new RepairToolController({
    job: {
      jobId: 'repair-job-1',
      workspace,
      resultPath: join(incident, 'result.json'),
      roots: [
        { id: 'profile', kind: 'profile', relativePath: 'profile' },
        { id: 'example', kind: 'plugin', relativePath: 'plugins/example' },
      ],
      commands: [{ name: 'example-test', executable: process.execPath, args: ['--version'], cwd: 'plugins/example' }],
    },
    runCommand,
  })
  return { incident, workspace, controller, runCommand }
}

describe('repair tools', () => {
  it('reads and mutates only staging roots, runs only registered checks, and writes a bounded result', async () => {
    const { incident, controller, runCommand } = await fixture()
    expect(await controller.list('example', '.')).toEqual(['index.mjs'])
    expect(await controller.read('example', 'index.mjs')).toContain('broken = true')
    await controller.write('example', 'index.mjs', 'export const broken = false\n')
    await controller.move('example', 'index.mjs', 'fixed.mjs')
    await controller.delete('example', 'fixed.mjs')
    expect((await controller.runCheck('example-test')).exitCode).toBe(0)
    expect(runCommand).toHaveBeenCalledTimes(1)
    await controller.finish({
      diagnosis: 'plugin-startup-failure',
      changedFiles: ['plugins/example/index.mjs'],
      checksRequested: ['example-test'],
      summary: 'Candidate repair completed.',
    })
    const result = JSON.parse(await readFile(join(incident, 'result.json'), 'utf8'))
    expect(result.status).toBe('candidate-ready')
    expect(result.actions).toHaveLength(7)
    expect(JSON.stringify(result)).not.toContain('export const broken')
  })

  it('rejects traversal, original paths, linked escapes, unknown commands, and excess tool actions', async () => {
    const { incident, workspace, controller } = await fixture()
    await expect(controller.read('example', '../../original.txt')).rejects.toThrow(/outside repair workspace/u)
    await expect(controller.read('example', 'C:\\Users\\private\\credential.json')).rejects.toThrow(/outside repair workspace/u)
    const external = join(incident, 'credential-dir')
    await mkdir(external, { recursive: true })
    await writeFile(join(external, 'token.txt'), 'apiKey=secret')
    try {
      await symlink(external, join(workspace, 'plugins', 'example', 'credential-link'), 'junction')
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code
      if (['EPERM', 'EACCES', 'UNKNOWN'].includes(code ?? '')) {
        throw new Error('directory links are required for this repair-boundary test')
      } else {
        throw error
      }
    }
    await expect(controller.read('example', 'credential-link/token.txt')).rejects.toThrow(/filesystem links/u)
    await expect(controller.runCheck('npm-install')).rejects.toThrow(/registered repair check/u)

    const fresh = await fixture()
    for (let index = 0; index < 12; index += 1) await fresh.controller.list('profile', '.')
    await expect(fresh.controller.list('profile', '.')).rejects.toThrow(/tool action budget exhausted/u)
  })
})
