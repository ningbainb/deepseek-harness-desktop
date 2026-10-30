import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureDesktopProfile } from '../src/profile.mjs'

// Observation only: no import/retry, entry activation, registration or settings writes.
function observeSidebar(ctx) {
  const read = operation => {
    try { return operation() } catch (error) { return { error: String(error.message ?? error) } }
  }
  const target = /better-sidebar|settings-general|session-controller|api-remotes|api-gateway|client-modules/u
  const modules = ctx.modules
  const loader = ctx.loader
  const root = loader.ctx
  const serviceNames = ['slots', 'sessions', 'locale', 'modules', 'connection', 'remote', 'remote.session', 'betterSidebar']
  const entries = [...loader.entries()].filter(entry => target.test(entry.options.name ?? ''))
  const service = (context, name) => read(() => context.get(name) !== undefined)
  return {
    at: new Date().toISOString(),
    moduleState: read(() => modules.entries.state.getSnapshot()),
    manifest: read(() => modules.manifest),
    entries: entries.map(entry => ({
      id: entry.id, name: entry.options.name, disabled: read(() => entry.disabled),
      fiber: entry.fiber ? {
        state: entry.fiber.state,
        inject: read(() => Object.keys(entry.fiber.inject ?? {})),
        services: Object.fromEntries(serviceNames.map(name => [name, service(entry.fiber.ctx, name)])),
      } : null,
      importError: read(() => String(modules.importError(entry.options.name) ?? '')),
    })),
    rootServices: Object.fromEntries(serviceNames.map(name => [name, service(root, name)])),
    modules: [...modules.loadCache].filter(([id]) => target.test(id)).map(([id, record]) => ({
      id, keys: Object.keys(record),
      inject: read(() => record.exports?.inject),
      importError: read(() => String(modules.importError(id) ?? '')),
    })),
    sections: read(() => ctx.slots.entries('settings.section').map(entry => ({
      id: entry.options.id, order: entry.options.order, label: read(() => typeof entry.options.label === 'function' ? entry.options.label() : entry.options.label),
    }))),
  }
}

export async function observeHost(ctx) {
  const read = operation => {
    try { return operation() } catch (error) { return { error: String(error.message ?? error) } }
  }
  const names = ['webServer', 'sessions', 'connection', 'tools', 'settings', 'webPlugins']
  const errors = (ctx.logger.buffer ?? []).filter(message => ['error', 'warn'].includes(message.type)).map(message => ({
    at: message.ts, type: message.type, name: message.name,
    entryId: read(() => message.fiber?.deref()?.entry?.id),
    text: message.args.map(value => value instanceof Error ? `${value.name}: ${value.message}\n${value.stack ?? ''}` : String(value)).join(' ').slice(0, 12000),
  }))
  const entries = await Promise.all([...ctx.loader.entries()].filter(entry => /better-sidebar|webserver|connection|dsh-tools|dsh-session$/u.test(entry.options.name ?? '')).map(async entry => {
    const module = entry.moduleNamespace?.default ?? entry.moduleNamespace
    const inject = Object.keys(entry.fiber?.inject ?? {})
    let settledFiberError = null
    if (entry.fiber?.state === 3 && !entry.fiber.inertia) {
      try { await entry.fiber.await() } catch (error) { settledFiberError = String(error.stack ?? error.message ?? error) }
    }
    return {
      id: entry.id, optionsId: entry.options.id, name: entry.options.name,
      disabled: read(() => entry.disabled), rawDisabled: entry.options.disabled ?? false,
      imported: entry.moduleNamespace !== undefined,
      moduleInject: module?.inject ?? null, entryInject: entry.options.inject ?? null,
      importErrors: errors.filter(message => message.entryId === entry.id || message.text.includes(entry.options.name)),
      fiber: entry.fiber ? {
        state: entry.fiber.state, stateName: ['PENDING', 'LOADING', 'ACTIVE', 'FAILED', 'DISPOSED', 'UNLOADING'][entry.fiber.state],
        inject, settledFiberError,
        dependencies: Object.fromEntries(inject.map(name => [name, read(() => entry.fiber.ctx.get(name) !== undefined)])),
        services: Object.fromEntries(names.map(name => [name, read(() => entry.fiber.ctx.get(name) !== undefined)])),
      } : null,
    }
  }))
  return {
    at: new Date().toISOString(),
    targetPresent: entries.some(entry => entry.name === 'dsh-better-sidebar'),
    services: Object.fromEntries(names.map(name => [name, read(() => ctx.get(name) !== undefined)])),
    entries,
    recentHostErrors: errors.slice(-30),
  }
}

export async function installSidebarLedgerDiagnostic(home) {
  await ensureDesktopProfile({ dshHome: home })
  const name = '@fixture/dsh-sidebar-ledger'
  const profile = join(home, 'profiles', 'desktop')
  const directory = join(profile, 'node_modules', '@fixture', 'dsh-sidebar-ledger')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version: '0.0.0-test', type: 'module',
    exports: { '.': './host.mjs', './client': './client.js', './package.json': './package.json' },
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: [] } },
  }, null, 2))
  await writeFile(join(directory, 'host.mjs'), `export const inject = ['loader', 'connection'];
    export function apply(ctx) {
      ctx.effect(() => ctx.connection.fetch.register({
        path: '/api/sidebar-ledger-diagnostic', methods: ['POST'], requestBody: 'buffered',
        async fetch() { return Response.json(await (${observeHost.toString()})(ctx)); }
      }), 'sidebar diagnostic: read-only Host observation');
    }\n`)
  await writeFile(join(directory, 'client.js'), `window.__ModuleLoader__.load({ id: ${JSON.stringify(name)}, factory: () => ({
    inject: ['loader', 'modules', 'slots'],
    apply(ctx) {
      const face = () => (${observeSidebar.toString()})(ctx);
      globalThis.__sidebarLedgerDiagnostic = face;
      ctx.effect(() => () => { if (globalThis.__sidebarLedgerDiagnostic === face) delete globalThis.__sidebarLedgerDiagnostic; });
    }
  }) });\n`)
  await writeFile(join(directory, 'cordis.patch.yml'), `- insert:\n    - id: sidebar-ledger-diagnostic\n      name: '${name}'\n`)
  const manifestPath = join(profile, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.dependencies[name] = '0.0.0-test'
  manifest.dsh.profile.bundles.push(name)
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
}

export async function captureSidebarLedgerDiagnostic(page, path, consoleEvents) {
  const snapshot = await page.evaluate(async () => ({
    probe: typeof window.__sidebarLedgerDiagnostic === 'function' ? window.__sidebarLedgerDiagnostic() : { error: 'SDK observation probe did not activate' },
    boot: window.__DSH_BOOT__,
    host: await fetch('/api/sidebar-ledger-diagnostic', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) })
      .then(async response => ({ status: response.status, value: await response.json() }))
      .catch(error => ({ error: String(error.message) })),
    visibleSettingsButtons: [...document.querySelectorAll('[role="dialog"] button')].filter(element => element.getBoundingClientRect().width > 0).map(element => element.textContent),
  }))
  await writeFile(path, JSON.stringify({ ...snapshot, consoleEvents }, null, 2) + '\n')
  console.log('sidebar ledger diagnostic', path)
}
