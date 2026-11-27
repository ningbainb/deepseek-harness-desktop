import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { declareBundledPreset } from '../host/presets/preset-registry.ts'

it('registers once when the service arrives and releases a pending declaration on unload', async ({ onTestFinished }) => {
  const directory = await mkdtemp(join(tmpdir(), 'bundled-preset-'))
  onTestFinished(() => rm(directory, { recursive: true, force: true }))
  await writeFile(join(directory, 'preset.yml'), 'name: Example\norder: 7\n')
  await writeFile(join(directory, 'agent.cordis.yml'), [
    '- id: example',
    '  name: cordis:group',
    '  config:',
    '    - id: local',
    '      name: ./plugin.mjs',
  ].join('\n'))

  const release = vi.fn(async () => {})
  let finishRegistration!: () => void
  const registration = new Promise<typeof release>(resolve => { finishRegistration = () => resolve(release) })
  const register = vi.fn(() => registration)
  let registry: { register: typeof register } | undefined
  let start!: () => void
  let stop!: () => Promise<void>
  const ctx = {
    get: () => registry,
    inject: (_services: string[], callback: () => void) => { start = callback },
    effect: (effect: () => typeof stop) => { stop = effect() },
  }

  declareBundledPreset(ctx as unknown as Parameters<typeof declareBundledPreset>[0], 'example', directory)
  expect(register).not.toHaveBeenCalled()
  registry = { register }
  start()
  start()
  expect(register).toHaveBeenCalledTimes(1)
  expect(register).toHaveBeenCalledWith(expect.objectContaining({
    id: 'example', name: 'Example', order: 7,
    plugins: [{ id: 'example', name: 'cordis:group', config: [
      { id: 'local', name: pathToFileURL(join(directory, 'plugin.mjs')).href, config: undefined },
    ] }],
  }))
  const stopped = stop()
  finishRegistration()
  await stopped
  expect(release).toHaveBeenCalledTimes(1)
  start()
  expect(register).toHaveBeenCalledTimes(1)
})
