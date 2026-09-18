import { describe, expect, it } from 'vitest'
import { mainSessionId } from '../src/client/main-session.ts'

describe('main-view Session selection', () => {
  it('ignores background-owned Sessions and follows a navigation change', () => {
    const list = { byId: {
      task: { id: 'task', retainedBy: { taskBoard: 1 } },
      old: { id: 'old', retainedBy: { mainView: 1 } },
    } }
    expect(mainSessionId(list as never)).toBe('old')
    list.byId.old.retainedBy = {} as never
    list.byId.task.retainedBy = { mainView: 1 } as never
    expect(mainSessionId(list as never)).toBe('task')
  })

  it('returns no selection when the catalog has no main-view owner', () => {
    expect(mainSessionId({ byId: {} })).toBeUndefined()
  })
})
