import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureDesktopProfile } from '../src/profile.mjs'

export async function prepareWorkspaceStateProbe({ home }) {
  await ensureDesktopProfile({ dshHome: home })
  const profile = join(home, 'profiles', 'desktop')
  const name = '@fixture/dsh-workspace-state-probe'
  const target = join(profile, 'node_modules', '@fixture', 'dsh-workspace-state-probe')
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'package.json'), JSON.stringify({ name, version: '0.0.0-test', type: 'module',
    main: 'index.mjs', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  await writeFile(join(target, 'cordis.patch.yml'), `- insert:\n    - id: workspace-state-probe\n      name: '${name}'\n`)
  await writeFile(join(target, 'index.mjs'), `
export const inject = ['webServer', 'workspaceRegistry']
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/api/desktop-workspace-state-probe',
    handler(request, response) {
      if (request.method !== 'GET') { response.writeHead(405).end(); return }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        archivedSessionIds: [...ctx.workspaceRegistry.archivedSessionIds],
        pinnedSessionIds: [...ctx.workspaceRegistry.pinnedSessionIds],
      }))
    },
  }))
}
`)
  const manifestPath = join(profile, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.dependencies[name] = '0.0.0-test'
  manifest.dsh.profile.bundles.unshift(name)
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

export async function readWorkspaceStateProbe(page) {
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/desktop-workspace-state-probe')
    if (!response.ok) throw new Error(`Workspace SDK probe HTTP ${response.status}`)
    return response.json()
  })
  return result
}
