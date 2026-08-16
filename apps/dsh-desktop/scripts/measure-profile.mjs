import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

import { ensureDesktopProfile, resolveRuntimePackages } from '../src/profile.mjs'

const iterationsArgument = process.argv.find((argument) => /^--iterations=\d+$/u.test(argument))
const iterations = Number(iterationsArgument?.split('=')[1] ?? 5)
if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 50) {
  throw new TypeError('--iterations must be between 1 and 50')
}

function summarize(samples) {
  const sorted = [...samples].toSorted((left, right) => left - right)
  const total = sorted.reduce((sum, sample) => sum + sample, 0)
  return {
    minimumMs: Number(sorted[0].toFixed(1)),
    medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(1)),
    meanMs: Number((total / sorted.length).toFixed(1)),
    maximumMs: Number(sorted.at(-1).toFixed(1)),
  }
}

async function measure(operation) {
  const startedAt = performance.now()
  await operation()
  return performance.now() - startedAt
}

const temporary = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-benchmark-'))
try {
  const resolverSamples = []
  for (let index = 0; index < iterations; index += 1) {
    resolverSamples.push(await measure(() => resolveRuntimePackages()))
  }

  const packageRoots = resolveRuntimePackages()
  const freshSamples = []
  const warmSamples = []
  for (let index = 0; index < iterations; index += 1) {
    const dshHome = join(temporary, `run-${index}`)
    freshSamples.push(await measure(() => ensureDesktopProfile({ dshHome, packageRoots })))
    warmSamples.push(await measure(() => ensureDesktopProfile({ dshHome, packageRoots })))
  }

  console.log(JSON.stringify({
    iterations,
    packageCount: packageRoots.size,
    resolveRuntimePackages: summarize(resolverSamples),
    freshProfile: summarize(freshSamples),
    warmProfile: summarize(warmSamples),
  }, null, 2))
} finally {
  await rm(temporary, { recursive: true, force: true })
}
