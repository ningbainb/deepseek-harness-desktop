import { expect, it, vi } from 'vitest'
import { FileAttachmentQueue, attachmentReference } from '../src/client/drag/attachments.ts'

function draft() {
  let text = 'keep my draft'
  const listeners = new Set<() => void>()
  return { read: () => text, insert: (reference: string) => { text += '\n' + reference; for (const fn of listeners) fn(); return true }, remove: (reference: string) => { text = text.replace(reference, ''); for (const fn of listeners) fn() }, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } } }
}
it('serializes mixed files, retains failed items and does not erase the draft', async () => {
  const telemetry = vi.fn()
  vi.stubGlobal('dshDesktop', { recordFeatureEvent: telemetry })
  const input = draft()
  const upload = vi.fn().mockResolvedValueOnce({ path: './.dsh-attachments/s/one/report.pdf' }).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ path: './.dsh-attachments/s/two/code.ts' })
  const queue = new FileAttachmentQueue(input, upload)
  queue.add([new File(['pdf'], 'report.pdf'), new File(['code'], 'code.ts')])
  await vi.waitFor(() => expect(queue.snapshot().map(item => item.state)).toEqual(['ready', 'failed']))
  expect(input.read()).toContain('keep my draft')
  expect(input.read()).toContain('report.pdf')
  expect(input.read()).not.toContain('code.ts')
  queue.retry(queue.snapshot()[1]!.id)
  await vi.waitFor(() => expect(queue.snapshot().every(item => item.state === 'ready')).toBe(true))
  queue.remove(queue.snapshot()[0]!.id)
  expect(input.read()).not.toContain('report.pdf')
  expect(input.read()).toContain('code.ts')
  queue.dispose()
  expect(telemetry.mock.calls.map(([event]) => event)).toEqual(['started', 'succeeded', 'started', 'failed', 'started', 'succeeded'].map(outcome => ({ feature: 'attachment', outcome, detail: 'file' })))
  vi.unstubAllGlobals()
})
it('late uploads cannot inject removed attachments or cross into another session', async () => {
  let settle!: (result: { path: string }) => void
  const first = draft(), second = draft()
  const queue = new FileAttachmentQueue(first, () => new Promise(resolve => { settle = resolve }))
  queue.add([new File(['x'], 'x.bin')])
  queue.remove(queue.snapshot()[0]!.id)
  settle({ path: './.dsh-attachments/owner/file/x.bin' })
  await Promise.resolve(); await Promise.resolve()
  expect(first.read()).toBe('keep my draft'); expect(second.read()).toBe('keep my draft')
  queue.dispose()
})
it('restores removable durable references and escapes special filenames', () => {
  const input = draft(), reference = attachmentReference('a[b]#.pdf', './.dsh-attachments/s/f/a[b]#.pdf')
  expect(reference).toContain('%23')
  const plain = attachmentReference('report.pdf', './.dsh-attachments/s/f/report.pdf')
  input.insert(plain)
  const queue = new FileAttachmentQueue(input, vi.fn())
  expect(queue.snapshot()).toHaveLength(1)
  queue.remove(queue.snapshot()[0]!.id)
  expect(input.read()).not.toContain('.dsh-attachments')
  queue.dispose()
})

it('rechecks restored references and keeps missing files visibly failed', async () => {
  const input = draft()
  input.insert(attachmentReference('lost.pdf', './.dsh-attachments/s/f/lost.pdf'))
  const upload = vi.fn()
  const queue = new FileAttachmentQueue(input, upload, async () => false)
  expect(queue.snapshot()[0]?.state).toBe('pending')
  await vi.waitFor(() => expect(queue.snapshot()[0]?.error).toBe('reference-missing'))
  expect(upload).not.toHaveBeenCalled()
  expect(input.read()).toContain('lost.pdf')
  queue.dispose()
})
