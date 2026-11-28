import { readFile } from 'node:fs/promises'
import { writeJsonAtomic } from './atomic-write-adapter.mjs'

function normalizeShownVersions(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((version) => typeof version === 'string').slice(-32))]
}

async function readState(path) {
  let state
  try {
    state = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
  }
  return {
    shownVersions: normalizeShownVersions(state?.shownVersions),
    pendingVersion: typeof state?.pendingVersion === 'string' ? state.pendingVersion : undefined,
  }
}

function writeState(path, shownVersions, pendingVersion) {
  const state = { schemaVersion: 1, shownVersions, pendingVersion }
  return writeJsonAtomic(path, state)
}

/** Callers serialize each read-modify-write operation in the store for its own file. */
export async function claimVersionPrompt(path, version, { suppressIfUnmarked = false } = {}) {
  const { shownVersions, pendingVersion } = await readState(path)
  if (shownVersions.includes(version)) return false
  if (suppressIfUnmarked && pendingVersion !== version) return false
  await writeState(path, normalizeShownVersions([...shownVersions, version]))
  return true
}

export async function markVersionPromptPending(path, version) {
  const { shownVersions } = await readState(path)
  if (shownVersions.includes(version)) return false
  await writeState(path, shownVersions, version)
  return true
}

export async function isVersionPromptShown(path, version) {
  const { shownVersions } = await readState(path)
  return shownVersions.includes(version)
}

export async function markVersionPromptShown(path, version) {
  const { shownVersions } = await readState(path)
  if (shownVersions.includes(version)) return false
  await writeState(path, normalizeShownVersions([...shownVersions, version]))
  return true
}
