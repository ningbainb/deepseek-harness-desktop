import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { readSessionLogText } from '../scripts/session-log-fixture.mjs'

test('the shared scroll/context history seed uses SDK events and preserves every other session', async () => {
  const { seedConversationHistory } = await import('../scripts/conversation-history-fixture.mjs')
  const home = await mkdtemp(join(tmpdir(), 'dsh-context-history-fixture-'))
  try {
    const workspacePath = join(home, 'project'), directory = join(home, 'sessions', 'fixture-project', 'fixture-history')
    await mkdir(directory, { recursive: true })
    const target = join(directory, 'fixture.jsonl'), unrelated = join(directory, 'unrelated.jsonl')
    await writeFile(target, JSON.stringify({ id: 'fixture-history', cwd: workspacePath }) + '\n')
    const retained = Buffer.from(JSON.stringify({ id: 'retained-other', cwd: workspacePath }) + '\n')
    await writeFile(unrelated, retained)
    const seeded = await seedConversationHistory({ dshHome: home, workspacePath, sessionId: 'fixture-history', messageCount: 20, nativeTurns: true, markerPrefix: 'Context retained history' })
    const events = (await readSessionLogText(target)).trim().split('\n').slice(1).map(JSON.parse)
    assert.equal(events.filter(event => event.type === 'user/message').length, 20)
    assert.equal(events.filter(event => event.type === 'turn/start').length, 20)
    assert.equal(events.filter(event => event.type === 'turn/end').length, 20)
    assert.equal(events.filter(event => event.type === 'assistant/message').length, 1)
    assert.equal(events.every((event, index) => event.seq === index), true)
    assert.equal(seeded.asOfSeq, events.at(-1).seq)
    assert.match(JSON.stringify(events), /Context retained history 01/u)
    assert.match(JSON.stringify(events), /Context retained history 20/u)
    assert.deepEqual(await readFile(unrelated), retained)
  } finally { await rm(home, { recursive: true, force: true }) }
})
