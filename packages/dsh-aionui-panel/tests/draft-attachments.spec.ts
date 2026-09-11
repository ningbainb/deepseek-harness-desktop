import { describe, expect, it, vi } from 'vitest'
import { attachDraftImages, supportsNativeFileUploads } from '../src/client/index.ts'

const sessionId = 'session-1' as never
const files = [{ name: 'diagram.png', type: 'image/png' }] as unknown as readonly File[]

describe('attachDraftImages', () => {
  it('creates 1.1.5 drafts and attaches their ids to the active input', () => {
    const createDrafts = vi.fn(() => [{ id: 'attachment-1' }])
    const addAttachments = vi.fn(() => true)
    expect(attachDraftImages({ createDrafts }, { addAttachments }, sessionId, files)).toBe(true)
    expect(createDrafts).toHaveBeenCalledWith(sessionId, files)
    expect(addAttachments).toHaveBeenCalledWith(['attachment-1'])
  })

  it('releases drafts when the input rejects the attachment ids', () => {
    const attachments = [{ id: 'attachment-1' }]
    const releaseDraftAttachments = vi.fn()
    expect(attachDraftImages(
      { createDrafts: () => attachments, releaseDraftAttachments },
      { addAttachments: () => false },
      sessionId,
      files,
    )).toBe(false)
    expect(releaseDraftAttachments).toHaveBeenCalledWith(attachments)
  })

  it('releases registered uploads if the input throws', () => {
    const attachments = [{ id: 'pending-upload' }]
    const releaseDraftAttachments = vi.fn()
    expect(attachDraftImages({ createDrafts: () => attachments, releaseDraftAttachments }, {
      addAttachments: () => { throw new Error('session disposed') },
    }, sessionId, files)).toBe(false)
    expect(releaseDraftAttachments).toHaveBeenCalledExactlyOnceWith(attachments)
  })

  it('routes generic files in order to the requested session', () => {
    const batch = [new File(['pdf'], 'report.pdf'), new File(['code'], 'main.ts')]
    const createDrafts = vi.fn(() => [{ id: 'pdf' }, { id: 'code' }])
    const addAttachments = vi.fn(() => true)
    expect(attachDraftImages({ createDrafts }, { addAttachments }, 'session-owner' as never, batch)).toBe(true)
    expect(createDrafts).toHaveBeenCalledExactlyOnceWith('session-owner', batch)
    expect(addAttachments).toHaveBeenCalledExactlyOnceWith(['pdf', 'code'])
  })

  it('does not mistake the old image-only API for generic file support', () => {
    const legacy = { createDrafts: vi.fn(), releaseDraftAttachments: vi.fn() }
    expect(supportsNativeFileUploads(legacy)).toBe(false)
    expect(supportsNativeFileUploads({ ...legacy, retryFileUpload: vi.fn() })).toBe(false)
    expect(supportsNativeFileUploads({ ...legacy, retryFileUpload: vi.fn(), fileUploads: {
      getSnapshot: vi.fn(), subscribe: vi.fn(),
    } })).toBe(true)
  })
})
