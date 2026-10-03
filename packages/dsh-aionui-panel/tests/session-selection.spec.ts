import { describe, expect, it } from 'vitest'
import { currentMainSessionId } from '../src/client/session-selection.ts'

describe('AionUI main Session selection', () => {
  it('follows the official mainView owner, not catalog order or background retention', () => {
    const list = { byId: {
      background: { id: 'background', retainedBy: { plugin: 1 } },
      selected: { id: 'selected', retainedBy: { mainView: 1 } },
    } }
    expect(currentMainSessionId(list as never)).toBe('selected')
  })

  it('does not attach panels to an unselected Session', () => {
    expect(currentMainSessionId({ byId: {
      background: { id: 'background', retainedBy: { plugin: 1 } },
    } } as never)).toBeUndefined()
  })
})
