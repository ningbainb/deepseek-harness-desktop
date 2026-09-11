/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { DragFileInlay, type DragFileInjected } from '../src/client/drag/DragFileInlay.tsx'
import { FileAttachmentQueue, attachmentReference } from '../src/client/drag/attachments.ts'
import { FILE_DRAG_MIME, processImageFilesSequentially } from '../src/client/drag/file-drag.ts'

vi.mock('../src/client/drag/file-drag.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/client/drag/file-drag.ts')>(),
  processImageFilesSequentially: vi.fn(async (files: readonly File[]) => files),
}))

let root: Root | undefined
let container: HTMLDivElement
const cleanups: (() => void)[] = []
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = undefined
  container?.remove()
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function render(props: Partial<DragFileInjected> = {}) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(<DragFileInlay {...{ insertPath: vi.fn(), ...props } as never} />))
}

function drag(type: string, files: File[], internalPath?: string) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: {
    types: internalPath ? [FILE_DRAG_MIME] : ['Files'],
    files,
    items: files.map(file => ({ kind: 'file', type: file.type })),
    getData: () => internalPath ?? '',
  } })
  act(() => container.dispatchEvent(event))
  return event
}

it('yields ordinary PDF, code and mixed drops to one native handler', () => {
  const addFiles = vi.fn(), legacyAdd = vi.fn(), insertPath = vi.fn()
  const queue = { subscribe: () => () => {}, snapshot: () => emptyEntries, add: legacyAdd }
  render({ addFiles, insertPath, fileQueue: queue as never })
  const native = vi.fn()
  document.addEventListener('drop', native)
  cleanups.push(() => document.removeEventListener('drop', native))
  for (const files of [
    [new File(['pdf'], 'report.pdf', { type: 'application/pdf' })],
    [new File(['code'], 'main.ts', { type: 'text/plain' })],
    [new File(['png'], 'diagram.png', { type: 'image/png' }), new File(['pdf'], 'report.pdf')],
  ]) {
    expect(drag('dragenter', files).defaultPrevented).toBe(false)
    expect(drag('dragover', files).defaultPrevented).toBe(false)
    expect(drag('drop', files).defaultPrevented).toBe(false)
  }
  expect(native).toHaveBeenCalledTimes(3)
  expect(addFiles).not.toHaveBeenCalled()
  expect(legacyAdd).not.toHaveBeenCalled()
  expect(insertPath).not.toHaveBeenCalled()
  expect(container.querySelector('[data-dsh-file-attachments]')).toBeNull()
})
const emptyEntries: never[] = []

it('retains internal workspace path dragging with native uploads enabled', () => {
  const insertPath = vi.fn()
  render({ addFiles: vi.fn(), insertPath })
  expect(drag('drop', [], './src/main.ts').defaultPrevented).toBe(true)
  expect(insertPath).toHaveBeenCalledExactlyOnceWith('./src/main.ts')
})

it('compresses mixed drops and admits one ordered batch without a second upload', async () => {
  const addFiles = vi.fn(() => true), addImages = vi.fn(() => true)
  const large = new File(['png'], 'large.png', { type: 'image/png' })
  Object.defineProperty(large, 'size', { value: 3 * 1024 * 1024 })
  const compressed = new File(['small'], 'large.png', { type: 'image/png' })
  vi.mocked(processImageFilesSequentially).mockResolvedValueOnce([compressed])
  const pdf = new File(['pdf'], 'report.pdf'), code = new File(['code'], 'main.ts')
  render({ addFiles, addImages })
  expect(drag('drop', [pdf, large, code]).defaultPrevented).toBe(true)
  await act(async () => { await Promise.resolve() })
  expect(addFiles).toHaveBeenCalledExactlyOnceWith([pdf, compressed, code])
  expect(addImages).not.toHaveBeenCalled()
})

it('does not admit a stale compressed batch after session teardown', async () => {
  let finish!: (files: File[]) => void
  vi.mocked(processImageFilesSequentially).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const addFiles = vi.fn(() => true), large = new File(['png'], 'large.png', { type: 'image/png' })
  Object.defineProperty(large, 'size', { value: 3 * 1024 * 1024 })
  render({ addFiles, addImages: vi.fn(() => true) })
  drag('drop', [large])
  act(() => root!.unmount()); root = undefined
  await act(async () => { finish([large]); await Promise.resolve() })
  expect(addFiles).not.toHaveBeenCalled()
})

it('retains the legacy upload path on older shells', () => {
  const add = vi.fn(), queue = { subscribe: () => () => {}, snapshot: () => emptyEntries, add }
  render({ fileQueue: queue as never })
  const file = new File(['pdf'], 'report.pdf')
  expect(drag('drop', [file]).defaultPrevented).toBe(true)
  expect(add).toHaveBeenCalledExactlyOnceWith([file])
  expect(container.querySelector('input[type="file"]')).not.toBeNull()
})

it('keeps missing legacy references visible without a duplicate file picker', async () => {
  const reference = attachmentReference('missing.pdf', './.dsh-attachments/session/file/missing.pdf')
  const queue = new FileAttachmentQueue({ read: () => reference, subscribe: () => () => {}, insert: () => true, remove: vi.fn() }, vi.fn(), async () => false)
  cleanups.push(() => queue.dispose())
  render({ addFiles: vi.fn(), fileQueue: queue })
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  expect(container.querySelector('[data-state="failed"]')).not.toBeNull()
  expect(container.textContent).toContain('missing.pdf')
  expect(container.querySelector('[role="alert"]')).not.toBeNull()
  expect(container.querySelector('input[type="file"]')).toBeNull()
})
