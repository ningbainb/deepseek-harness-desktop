import { describe, expect, it, vi } from 'vitest'
import type {} from '../src/client/index.ts'
import { DescribeImageSettingsCardController } from '../src/client/DescribeImageSettingsCard.tsx'

describe('Desktop image settings card', () => {
  it('stages and discards the interception switch while retaining every existing setting', () => {
    const scope = {
      getSnapshot: () => ({ status: 'ready', writable: true, value: { interceptImageSend: true, model: 'vision', baseURL: 'https://example.com' }, user: {} }),
      subscribe: vi.fn(() => () => {}),
    }
    const face = new DescribeImageSettingsCardController(scope as never).inject()
    const snapshot = () => face.hooks.describeImageSettingsCard.getSnapshot()
    expect(snapshot()).toMatchObject({ interceptImageSend: { text: 'true' }, model: { text: 'vision' }, baseURL: { text: 'https://example.com' } })
    face.edit('interceptImageSend', 'false')
    expect(snapshot()).toMatchObject({ dirty: true, invalid: false, interceptImageSend: { text: 'false' }, model: { text: 'vision' } })
    face.discard()
    expect(snapshot()).toMatchObject({ dirty: false, interceptImageSend: { text: 'true' } })
  })
})
