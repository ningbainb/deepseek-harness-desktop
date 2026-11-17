import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { STAR_PROMPT_VERSION, StarPromptStore } from '../src/star-prompt.mjs'

test('control approval fixture suppresses only the current release prompt before testing pointer clearance', async () => {
  const source = await readFile(new URL('../scripts/verify-control-approval.mjs', import.meta.url), 'utf8')
  const seed = source.split(/\r?\n/u).find(line => line.includes("await writeFile(join(userData, 'star-prompt-state.json')"))
  assert.ok(seed, 'the isolated fixture must seed the prompt state before launch')
  const root = await mkdtemp(join(tmpdir(), 'dsh-control-star-fixture-'))
  try {
    const { writeFile } = await import('node:fs/promises')
    const execute = new (Object.getPrototypeOf(async function () {}).constructor)('writeFile', 'join', 'userData', 'STAR_PROMPT_VERSION', seed)
    await execute(writeFile, join, root, STAR_PROMPT_VERSION)
    const store = new StarPromptStore({ path: join(root, 'star-prompt-state.json') })
    assert.equal(await store.claim(STAR_PROMPT_VERSION), false, 'the release prompt must not cover the real send button')
    assert.match(source, /import\s*\{\s*STAR_PROMPT_VERSION\s*\}\s*from '\.\.\/src\/star-prompt\.mjs'/u)
    const nextRelease = new StarPromptStore({ path: join(root, 'star-prompt-state.json'), targetVersion: `${STAR_PROMPT_VERSION}-next` })
    assert.equal(await nextRelease.claim(`${STAR_PROMPT_VERSION}-next`), true, 'future release prompts must remain enabled')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
