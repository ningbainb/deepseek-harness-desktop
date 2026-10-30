import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { expect, test, vi } from 'vitest'
import { PetService } from 'published-pet-host-under-test/service.ts'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
async function fixture(update: (patch: Record<string, unknown>, service: PetService) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-pet-display-sync-'))
  const ctx = new Context()
  let service!: PetService
  const mirror = vi.fn(async (_ns: string, patch: Record<string, unknown>) => update(patch, service))
  ctx.provide('settings', { update: mirror })
  service = new PetService(ctx, { persistDir: home })
  return { service, mirror, persisted: async () => JSON.parse(await readFile(join(home, 'pet.json'), 'utf8')).display,
    dispose: async () => { await ctx.fiber.dispose(); await rm(home, { recursive: true, force: true }) } }
}
function commit(service: PetService, patch: Record<string, unknown>) {
  service.applySettingsSection({ ...service.display(), ...patch, enabled: true, decorationEnabled: true })
}

test('display mutation acknowledges only after the settings mirror commits', async () => {
  const gate = deferred()
  const value = await fixture(async (patch, service) => { await gate.promise; commit(service, patch) })
  try {
    let acknowledged = false
    const pending = value.service.setConfig({ right: 144, bottom: 49 }).then(result => { acknowledged = true; return result })
    await vi.waitFor(() => expect(value.mirror).toHaveBeenCalledOnce())
    await Promise.resolve()
    expect(acknowledged).toBe(false)
    gate.resolve()
    expect((await pending).display.bottom).toBe(49)
    expect((await value.persisted()).bottom).toBe(49)
  } finally { gate.resolve(); await value.dispose() }
})

test('display mutation serializes later partial edits behind an earlier delayed settings commit', async () => {
  const gates = [deferred(), deferred()]
  let calls = 0
  const value = await fixture(async (patch, service) => { const index = calls++; if (gates[index]) await gates[index].promise; commit(service, patch) })
  try {
    const original = value.service.display()
    const first = value.service.setConfig({ right: 144, bottom: 49 })
    const second = value.service.setConfig({ size: 180, bottom: 169 })
    await vi.waitFor(() => expect(value.mirror).toHaveBeenCalled())
    expect(value.mirror).toHaveBeenCalledOnce()
    gates[0].resolve()
    await first
    await vi.waitFor(() => expect(value.mirror).toHaveBeenCalledTimes(2))
    gates[1].resolve()
    await second
    expect(value.service.display()).toMatchObject({ right: 144, bottom: 169, size: 180 })
    expect(await value.persisted()).toEqual(value.service.display())
    await value.service.setConfig(original)
    await Promise.resolve()
    expect(value.mirror).toHaveBeenCalledTimes(3)
    expect(value.service.display()).toEqual(original)
    expect(await value.persisted()).toEqual(original)
  } finally { gates.forEach(gate => gate.resolve()); await value.dispose() }
})

test('display mutation keeps local persistence and later writes usable when the settings mirror fails', async () => {
  let calls = 0
  const value = await fixture(async (patch, service) => { if (calls++ === 0) throw Error('fixture settings unavailable'); commit(service, patch) })
  try {
    expect((await value.service.setConfig({ right: 144, bottom: 49 })).ok).toBe(true)
    expect((await value.persisted()).bottom).toBe(49)
    expect((await value.service.setConfig({ bottom: 169 })).ok).toBe(true)
    expect(value.service.display()).toMatchObject({ right: 144, bottom: 169 })
    expect(await value.persisted()).toEqual(value.service.display())
  } finally { await value.dispose() }
})

test('display mutation repairs an unavailable pet only after earlier commits and includes the newly applied display', async () => {
  const gates = [deferred(), deferred()]
  let calls = 0
  const value = await fixture(async (patch, service) => { const index = calls++; if (gates[index]) await gates[index].promise; commit(service, patch) })
  try {
    const selected = value.service.selectedPetId()
    const first = value.service.setConfig({ right: 144, bottom: 49 })
    await vi.waitFor(() => expect(value.mirror).toHaveBeenCalledOnce())
    value.service.applySettingsSection({ ...value.service.display(), bottom: 169, petId: 'removed-fixture-pet', enabled: true, decorationEnabled: true })
    expect(value.mirror).toHaveBeenCalledOnce()
    gates[0].resolve()
    await first
    await vi.waitFor(() => expect(value.mirror).toHaveBeenCalledTimes(2))
    expect(value.mirror.mock.calls[1][1]).toMatchObject({ petId: selected, right: 144, bottom: 169 })
    gates[1].resolve()
    await value.service.setConfig({ right: 188 })
    expect(value.mirror).toHaveBeenCalledTimes(3)
    expect(value.service.selectedPetId()).toBe(selected)
    expect(value.service.display()).toMatchObject({ right: 188, bottom: 169 })
    expect(await value.persisted()).toEqual(value.service.display())
  } finally { gates.forEach(gate => gate.resolve()); await value.dispose() }
})
