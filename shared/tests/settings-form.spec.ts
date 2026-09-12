import { describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { CardForm, booleanField, choiceField, numberField, textField } from '../client/settings/settings-form.ts'

/** Minimal in-memory scope backing a CardForm test. */
class FakeScope<T extends Record<string, unknown>> implements SettingsScope<T> {
  value: T
  base: T
  user: Partial<T> = {}
  writable = true
  status: 'ready' | 'loading' = 'ready'
  private listeners = new Set<() => void>()
  mutate = vi.fn(async (
    _ops: Parameters<SettingsScope<T>['mutate']>[0],
    _expectedRevision?: number,
  ) => {})
  set = vi.fn(async (field: string, value: unknown) => { (this.user as Record<string, unknown>)[field] = value })
  unset = vi.fn(async (field: string) => { delete (this.user as Record<string, unknown>)[field] })
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  getSnapshot(): SettingsScopeSnapshot<T> {
    return {
      status: this.status,
      writable: this.writable,
      value: this.value,
      base: this.base,
      user: this.user,
      revision: 1,
      mode: 'host',
    }
  }
  constructor(value: T) {
    this.value = value
    this.base = value
  }
  /** Apply the stored value over the base, the way a real scope projects its section. */
  private reflect(): void {
    this.value = { ...this.base, ...this.user }
  }
  /** Resolve after a save writes, mirroring the Host's read-back. */
  settle(): void {
    this.reflect()
  }
  /** Override the set/unset spies to reflect writes like the real scope. */
  autoReflect(): void {
    this.set.mockImplementation(async (field: string, value: unknown) => {
      (this.user as Record<string, unknown>)[field] = value
      this.reflect()
    })
    this.unset.mockImplementation(async (field: string) => {
      delete (this.user as Record<string, unknown>)[field]
      this.reflect()
    })
  }
}

describe('shared settings-form field specs', () => {
  it('numberField formats stored numbers and clears on empty draft', () => {
    const spec = numberField('size')
    expect(spec.format(32)).toBe('32')
    expect(spec.format(undefined)).toBe('')
    expect(spec.parse('')).toEqual({ kind: 'clear' })
    expect(spec.parse(' 64 ')).toEqual({ kind: 'set', value: 64 })
    expect(spec.parse('abc')).toBeUndefined()
  })

  it('numberField honors integer and min constraints', () => {
    const spec = numberField('size', { integer: true, min: 32 })
    expect(spec.parse('32')).toEqual({ kind: 'set', value: 32 })
    expect(spec.parse('32.5')).toBeUndefined()
    expect(spec.parse('31')).toBeUndefined()
  })

  it('booleanField trims drafts and treats the empty string as a clear', () => {
    const spec = booleanField('enabled')
    expect(spec.parse(' true ')).toEqual({ kind: 'set', value: true })
    expect(spec.parse('false')).toEqual({ kind: 'set', value: false })
    expect(spec.parse('')).toEqual({ kind: 'clear' })
    expect(spec.parse('yes')).toBeUndefined()
  })

  it('textField trims drafts and clears on empty input', () => {
    const spec = textField('name')
    expect(spec.parse('  hugo  ')).toEqual({ kind: 'set', value: 'hugo' })
    expect(spec.parse('')).toEqual({ kind: 'clear' })
  })

  it('choiceField accepts only listed choices', () => {
    const spec = choiceField('model', ['a', 'b'])
    expect(spec.format('a')).toBe('a')
    expect(spec.format('zzz')).toBe('')
    expect(spec.parse('b')).toEqual({ kind: 'set', value: 'b' })
    expect(spec.parse('zzz')).toBeUndefined()
    expect(spec.parse('')).toEqual({ kind: 'clear' })
  })
})

describe('CardForm', () => {
  const fields = () => [booleanField('enabled'), numberField('size'), textField('name'), choiceField('model', ['a', 'b'])]

  it('exposes a ready, clean, writable shell over a served namespace', () => {
    const scope = new FakeScope({ enabled: true, size: 32 })
    const form = new CardForm(scope, fields())
    expect(form.shell()).toMatchObject({ available: true, exposed: true, writable: true, dirty: false, invalid: false })
  })

  it('stages edits and writes them on save', async () => {
    const scope = new FakeScope<Record<string, unknown>>({ enabled: true, size: 32 })
    scope.autoReflect()
    const form = new CardForm(scope, fields())
    const actions = form.actions()
    actions.edit('size', '64')
    actions.edit('name', 'hugo')
    expect(form.shell().dirty).toBe(true)
    expect(form.field('size')).toMatchObject({ text: '64', overridden: true, invalid: false })
    await form.save()
    expect(scope.set).toHaveBeenCalledWith('size', 64)
    expect(scope.set).toHaveBeenCalledWith('name', 'hugo')
    expect(form.shell().dirty).toBe(false)
    expect(form.field('size')).toMatchObject({ text: '64', overridden: true })
  })

  it('blocks the save while a draft is invalid and keeps it staged', async () => {
    const scope = new FakeScope<Record<string, unknown>>({ size: 32 })
    scope.autoReflect()
    const form = new CardForm(scope, fields())
    form.actions().edit('size', 'not-a-number')
    expect(form.shell().invalid).toBe(true)
    await form.save()
    expect(scope.set).not.toHaveBeenCalled()
    expect(form.shell().dirty).toBe(true)
  })

  it('clears only the fields the save actually wrote, preserving in-flight edits', async () => {
    const scope = new FakeScope<Record<string, unknown>>({ enabled: true, size: 32, name: 'old' })
    scope.autoReflect()
    const form = new CardForm(scope, fields())
    const actions = form.actions()
    actions.edit('name', 'new')
    // A deferred write keeps the save in flight so we can stage a second edit mid-save.
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    const originalSet = scope.set.getMockImplementation()
    scope.set.mockImplementation(async (field: string, value: unknown) => {
      await gate
      await originalSet!(field, value)
    })
    const saving = form.save()
    actions.edit('size', '99')
    release!()
    await saving
    expect(form.field('size')).toMatchObject({ text: '99', invalid: false })
    expect(form.shell().dirty).toBe(true)
    await form.save()
    expect(form.shell().dirty).toBe(false)
  })

  it('marks the shell failed when a write does not land', async () => {
    const scope = new FakeScope<Record<string, unknown>>({ name: 'old' })
    // Drop the write on the floor: the read-back never sees the staged value.
    scope.set.mockImplementation(async () => {})
    const form = new CardForm(scope, fields())
    form.actions().edit('name', 'new')
    await form.save()
    expect(form.shell()).toMatchObject({ failed: true, dirty: true })
  })

  it.each(['edit', 'reset'] as const)('keeps a later same-field %s after the original save finishes', async (action) => {
    const scope = new FakeScope<Record<string, unknown>>({ size: 32 })
    scope.autoReflect()
    const originalSet = scope.set.getMockImplementation()!
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    scope.set.mockImplementationOnce(async (field, value) => {
      await gate
      await originalSet(field, value)
    })
    const form = new CardForm(scope, fields())
    form.actions().edit('size', '64')
    const saving = form.save()
    if (action === 'edit') form.actions().edit('size', '99')
    else form.actions().resetField('size')
    release()
    await saving

    expect(scope.value.size).toBe(64)
    expect(form.field('size').text).toBe(action === 'edit' ? '99' : '32')
    expect(form.shell()).toMatchObject({ dirty: true, saving: false, failed: false })
    await form.save()
    expect(scope.value.size).toBe(action === 'edit' ? 99 : 32)
    expect(form.shell().dirty).toBe(false)
  })

  it('keeps drafts and allows retry after a rejected write', async () => {
    const scope = new FakeScope<Record<string, unknown>>({ name: 'old' })
    scope.autoReflect()
    scope.set.mockRejectedValueOnce(new Error('transport interrupted'))
    const form = new CardForm(scope, fields())
    form.actions().edit('name', 'new')
    await form.save()
    expect(form.shell()).toMatchObject({ dirty: true, saving: false, failed: true })
    expect(form.field('name').text).toBe('new')
    await form.save()
    expect(scope.value.name).toBe('new')
    expect(form.shell()).toMatchObject({ dirty: false, saving: false, failed: false })
  })

  it('resets a field back to its base value', () => {
    const scope = new FakeScope<Record<string, unknown>>({ enabled: true })
    const form = new CardForm(scope, fields())
    const actions = form.actions()
    actions.edit('enabled', 'false')
    expect(form.field('enabled').text).toBe('false')
    actions.resetField('enabled')
    expect(form.field('enabled')).toMatchObject({ text: 'true', overridden: false })
  })
})
