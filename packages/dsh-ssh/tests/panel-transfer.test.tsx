// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { TransferTab } from '../src/client/panel/TransferTab.tsx'
import { tt } from '../src/client/panel/helpers.ts'
import type { SshApi } from '../src/client/api.ts'
import type { RemoteDirEntry } from '../src/protocol.ts'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined
afterEach(async () => { await act(async () => root?.unmount()); document.body.replaceChildren(); vi.restoreAllMocks() })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const file = (name: string): RemoteDirEntry => ({ name, type: 'file', size: 10, mtimeMs: 1 })
function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(item => item.textContent === label)
  expect(found, label).toBeDefined()
  return found!
}
async function changeHost(value: string) {
  await act(async () => {
    const select = document.querySelector('select')!
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function mount(ls: SshApi['ls']) {
  const api = {
    listHosts: vi.fn(async () => ['a', 'b'].map(alias => ({ alias, host: `${alias}.test` }))),
    ls,
    downloadFile: vi.fn(async () => ({ streamed: true, bytes: 10, filename: 'b.txt' })),
  }
  root = createRoot(document.body.appendChild(document.createElement('div')))
  await act(async () => { root!.render(<TransferTab api={api as unknown as SshApi} />) })
  return api
}

it('invalidates host A directory results before allowing a new selection on B', async () => {
  const old = deferred<RemoteDirEntry[]>()
  const ls = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce([file('b.txt')])
  const api = await mount(ls)
  await changeHost('a')
  await act(async () => button(tt('transfer.browseRemote')).click())
  await changeHost('b')
  await act(async () => old.resolve([file('a.txt')]))
  expect(document.querySelector('[data-type="file"]')).toBeNull()
  expect(button(tt('transfer.download')).disabled).toBe(true)
  await act(async () => button(tt('transfer.browseRemote')).click())
  await act(async () => (document.querySelector('[data-type="file"]') as HTMLButtonElement).click())
  await act(async () => button(tt('transfer.download')).click())
  expect(ls).toHaveBeenLastCalledWith('b', '/')
  expect(api.downloadFile).toHaveBeenCalledWith('b', '/b.txt', expect.any(Function))
})

it('clears a selected old path and ignores late failures even after switching back to A', async () => {
  const old = deferred<RemoteDirEntry[]>()
  const ls = vi.fn().mockResolvedValueOnce([file('old.txt')]).mockReturnValueOnce(old.promise).mockResolvedValueOnce([file('new.txt')])
  await mount(ls)
  await changeHost('a')
  await act(async () => button(tt('transfer.browseRemote')).click())
  await act(async () => (document.querySelector('[data-type="file"]') as HTMLButtonElement).click())
  expect((document.querySelector('input:not([type="file"])') as HTMLInputElement).value).toBe('/old.txt')
  await act(async () => button(tt('transfer.refresh')).click())
  await changeHost('b')
  await changeHost('a')
  expect((document.querySelector('input:not([type="file"])') as HTMLInputElement).value).toBe('')
  await act(async () => button(tt('transfer.browseRemote')).click())
  await act(async () => old.reject(new Error('old host failure')))
  expect(document.body.textContent).not.toContain('old host failure')
  expect(document.body.textContent).toContain('new.txt')
})

it('keeps transfer target controls fixed until a transfer settles, then allows host changes', async () => {
  const pending = deferred<{ streamed: boolean; bytes: number; filename: string }>()
  const api = await mount(vi.fn().mockResolvedValue([file('download.txt')]))
  api.downloadFile.mockReturnValueOnce(pending.promise)
  await changeHost('a')
  await act(async () => button(tt('transfer.browseRemote')).click())
  await act(async () => (document.querySelector('[data-type="file"]') as HTMLButtonElement).click())
  await act(async () => button(tt('transfer.download')).click())
  expect(document.querySelector('select')!.disabled).toBe(true)
  expect((document.querySelector('input:not([type="file"])') as HTMLInputElement).disabled).toBe(true)
  await act(async () => pending.resolve({ streamed: true, bytes: 10, filename: 'download.txt' }))
  expect(document.querySelector('select')!.disabled).toBe(false)
  await changeHost('b')
  expect(button(tt('transfer.download')).disabled).toBe(true)
})
