import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { expect, test } from 'vitest'
import { proposeTurnMemory } from '../src/core/query.ts'

function user(text: string, source = 'user') {
  return { type: 'user/message', data: { source: { kind: source }, content: [{ type: 'text', text }] } } as SessionEvent
}

test('proposes only bounded direct user observations from the last completed turn', () => {
  const header = {} as SessionHeader
  const events = [
    { type: 'turn/start' } as SessionEvent,
    user('Ordinary task question'),
    user('Prefer a background instruction', 'injection'),
    user('以后请使用常规 TypeScript'),
    { type: 'turn/end' } as SessionEvent,
    { type: 'turn/start' } as SessionEvent,
    user('Remember a turn that has not ended'),
  ]
  expect(proposeTurnMemory({ header, events }, true)).toBe('以后请使用常规 TypeScript')
  expect(proposeTurnMemory({ header, events: events.slice(0, 4) }, false)).toBeUndefined()
  expect(proposeTurnMemory({ header: { ...header, origin: 'subagent' }, events }, false)).toBeUndefined()
})

test('an explicit request can propose ordinary user text after the turn', () => {
  const header = {} as SessionHeader
  const end = { type: 'turn/end' } as SessionEvent
  const events = [{ type: 'turn/start' } as SessionEvent, user('Check this report'), end]
  expect(proposeTurnMemory({ header, events }, false)).toBe('Check this report')
  expect(proposeTurnMemory({ header, events }, true)).toBeUndefined()
})
