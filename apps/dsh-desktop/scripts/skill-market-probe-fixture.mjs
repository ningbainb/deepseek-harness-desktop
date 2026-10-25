import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureDesktopProfile } from '../src/profile.mjs'

export async function prepareSkillMarketProbe({ home }) {
  await ensureDesktopProfile({ dshHome: home })
  const profile = join(home, 'profiles', 'desktop')
  const name = '@fixture/dsh-skill-market-probe'
  const target = join(profile, 'node_modules', '@fixture', 'dsh-skill-market-probe')
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'package.json'), JSON.stringify({
    name, version: '0.0.0-test', type: 'module', main: 'index.mjs',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  await writeFile(join(target, 'cordis.patch.yml'), `- insert:\n    - id: skill-market-startup-probe\n      name: '${name}/startup.mjs'\n    - id: skill-market-probe\n      name: '${name}'\n`)
  await writeFile(join(target, 'translation-probe.mjs'), await readFile(new URL('./skill-market-translation-probe.mjs', import.meta.url)))
  await writeFile(join(target, 'startup.mjs'), `
import { installMarketTranslationProbe } from './translation-probe.mjs'
export const inject = ['loader']
export function apply(ctx) {
  const translation = installMarketTranslationProbe()
  globalThis.desktopMarketTranslationProbe = translation
  ctx.effect(() => () => { translation.dispose(); delete globalThis.desktopMarketTranslationProbe })
  let samples = 0
  const started = performance.now()
  const timer = setInterval(() => {
    const entries = [...ctx.loader.entries()]
    const pending = entries.filter(entry => !entry.disabled && (entry._initTask || entry.fiber?.inertia))
    const inactive = entries.filter(entry => !entry.disabled && entry.fiber?.state !== 2)
    console.log('[skill-market-startup-probe]', JSON.stringify({
      elapsedMs: Math.round(performance.now() - started), total: entries.length,
      tasks: ctx.loader.getTasks().length,
      pending: pending.slice(0, 24).map(entry => ({
        id: entry.id, name: entry.options.name, state: entry.fiber?.state,
        importing: Boolean(entry._initTask),
      })),
      inactive: inactive.slice(0, 24).map(entry => ({
        id: entry.id, name: entry.options.name, state: entry.fiber?.state,
      })),
    }))
    if (++samples === 24) clearInterval(timer)
  }, 5_000)
  timer.unref()
  ctx.effect(() => () => clearInterval(timer))
}
`)
  await writeFile(join(target, 'index.mjs'), `
export const inject = ['webServer', 'tools', 'settings']
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/api/desktop-skill-market-probe',
    handler(request, response) {
      if (request.method !== 'GET') { response.writeHead(405).end(); return }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        toolNames: ctx.tools.schemas().map(schema => schema.name),
        settings: ctx.settings.get('dsh-agent-plugins-market'),
        translationRequests: globalThis.desktopMarketTranslationProbe?.requests,
      }))
    },
  }))
}
`)
  const manifestPath = join(profile, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.dependencies[name] = '0.0.0-test'
  manifest.dsh.profile.bundles.unshift(name)
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
}
