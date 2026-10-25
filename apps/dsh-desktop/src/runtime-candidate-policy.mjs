import { tmpdir } from 'node:os'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import {
  assessRuntimeSupport,
  normalizeKnownGoodRuntimeEvidence,
  normalizeRuntimeSupportMatrix,
} from './runtime-support-policy.mjs'

function inside(root, path) {
  if (typeof path !== 'string' || !isAbsolute(path)) return false
  const remainder = relative(resolve(root), resolve(path))
  return remainder !== '' && remainder !== '..' && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder)
}

export function candidateRuntimeOptions({ isPackaged, environment = process.env, temporaryRoot = tmpdir() }) {
  if (environment.DSH_DESKTOP_CANDIDATE_VERSION === undefined) return undefined
  const version = environment.DSH_DESKTOP_CANDIDATE_VERSION
  if (isPackaged !== false || !/^\d+\.\d+\.\d+-[0-9A-Za-z.-]+$/u.test(version)
    || !inside(temporaryRoot, environment.DSH_HOME)
    || !inside(temporaryRoot, environment.DSH_DESKTOP_USER_DATA)
    || resolve(environment.DSH_HOME) === resolve(environment.DSH_DESKTOP_USER_DATA)
    || !isAbsolute(environment.DSH_DESKTOP_CANDIDATE_EVIDENCE ?? '')
    || !isAbsolute(environment.DSH_DESKTOP_CANDIDATE_MATRIX ?? '')) {
    throw new Error('Candidate Runtime requires an unpackaged Desktop and explicit isolated temporary data and evidence paths')
  }
  return Object.freeze({
    version,
    evidencePath: environment.DSH_DESKTOP_CANDIDATE_EVIDENCE,
    matrixPath: environment.DSH_DESKTOP_CANDIDATE_MATRIX,
  })
}

export function normalizeCandidateRuntimeEvidence(document, version) {
  if (document?.supportStatus !== 'candidate' || document?.provider?.supportStatus !== 'candidate'
    || document?.runtime?.version !== version) {
    throw new TypeError('Candidate Runtime evidence does not match the explicitly requested candidate')
  }
  return normalizeKnownGoodRuntimeEvidence({
    ...document,
    supportStatus: 'known-good',
    provider: { ...document.provider, supportStatus: 'known-good' },
  })
}

export function assessCandidateRuntimeSupport(matrix, identity, version) {
  normalizeRuntimeSupportMatrix(matrix)
  if (identity.upstreamVersion !== version) throw new TypeError('Candidate Runtime identity does not match the requested candidate')
  const entries = matrix.entries.filter(entry => entry.upstreamVersion === version && entry.status === 'candidate')
  const result = assessRuntimeSupport({
    ...matrix,
    entries: entries.map(entry => ({ ...entry, status: 'known-good' })),
  }, identity)
  if (result.status === 'blocked') return result
  return Object.freeze({
    status: 'candidate',
    reason: 'isolated-candidate',
    upstreamVersion: version,
    entry: Object.freeze({ ...result.entry, status: 'candidate' }),
  })
}
