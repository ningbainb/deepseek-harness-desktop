import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const name = 'direct-start-session-probe'

export function apply(ctx) {
  const home = process.env.DSH_HOME
  if (typeof home !== 'string' || home.length === 0) throw new Error('direct-start probe requires DSH_HOME')
  const markerPath = join(home, 'sessions', 'direct-start-fixture', 'marker.json')
  const resultPath = join(home, 'sessions', 'direct-start-fixture', 'runtime-readable.json')
  const marker = JSON.parse(readFileSync(markerPath, 'utf8'))
  mkdirSync(dirname(resultPath), { recursive: true })
  writeFileSync(resultPath, `${JSON.stringify({
    marker: marker.marker,
    profile: process.env.DSH_PROFILE,
  }, null, 2)}\n`, 'utf8')
  ctx.logger?.info?.('[direct-start-probe] existing session marker is runtime-readable')
}
