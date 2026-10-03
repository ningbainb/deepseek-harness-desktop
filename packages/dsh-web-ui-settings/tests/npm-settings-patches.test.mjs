import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const desktopRequire = createRequire(resolve(root, 'apps/dsh-desktop/package.json'));
const settingsRoot = dirname(desktopRequire.resolve('@deepseek-ai/dsh-settings/package.json'));
const { volatileForm, isVolatilePath } = await import(pathToFileURL(resolve(settingsRoot, 'lib/types/schema.js')));
const settingsRequire = createRequire(resolve(settingsRoot, 'package.json'));

function patchSource(source, patch, reverse = false) {
  const lines = source.replaceAll('\r\n', '\n').trimEnd().split('\n');
  const section = patch.split('diff --git a/lib/index.js b/lib/index.js')[1].split('diff --git')[0];
  for (const hunk of section.split(/\n@@[^\n]*\n/).slice(1)) {
    const content = hunk.trimEnd().split('\n');
    const before = content.filter(line => line.startsWith(' ') || line.startsWith(reverse ? '+' : '-')).map(line => line.slice(1));
    const after = content.filter(line => line.startsWith(' ') || line.startsWith(reverse ? '-' : '+')).map(line => line.slice(1));
    const offset = lines.findIndex((_, index) => before.every((line, delta) => lines[index + delta] === line));
    assert.notEqual(offset, -1, `Unmatched patch context: ${before.join('\n')}`);
    lines.splice(offset, before.length, ...after);
  }
  return `${lines.join('\n')}\n`;
}

async function loadPatched(packageName, patchName) {
  const packageRoot = dirname(desktopRequire.resolve(`${packageName}/package.json`));
  const packageRequire = createRequire(resolve(packageRoot, 'package.json'));
  const patch = readFileSync(resolve(root, 'patches', patchName), 'utf8');
  let original = readFileSync(resolve(packageRoot, 'lib/index.js'), 'utf8');
  if (original.includes('import liveSchema')) original = patchSource(original, patch, true);
  let source = patchSource(original, patch);
  source = source.replaceAll('"schemastery"', JSON.stringify(pathToFileURL(packageRequire.resolve('schemastery')).href));
  source = source.replaceAll('"@deepseek-ai/schemastery"', JSON.stringify(pathToFileURL(settingsRequire.resolve('@deepseek-ai/schemastery')).href));
  source = source.replaceAll('"../community.json"', JSON.stringify(pathToFileURL(resolve(packageRoot, 'community.json')).href));
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const community = await loadPatched('@linxin666/dsh-client-ui-community-plugins', '@linxin666__dsh-client-ui-community-plugins@0.4.4.patch');
const launcher = await loadPatched('@linxin666/dsh-desktop-launcher', '@linxin666__dsh-desktop-launcher@0.3.13.patch');

function fixture(legacy = false) {
  const disposers = new Set();
  const events = new Map();
  const routes = new Map();
  const sections = new Set();
  let registration;
  let policy;
  const ctx = {
    fiber: {},
    effect(callback) {
      const cleanup = callback();
      if (typeof cleanup !== 'function') return () => {};
      let active = true;
      const dispose = () => { if (active) { active = false; cleanup(); disposers.delete(dispose) } };
      disposers.add(dispose);
      return dispose;
    },
    inject(names, callback) { assert.deepEqual(names, ['settings']); callback(ctx) },
    on(name, listener) { events.set(name, listener); ctx.effect(() => () => events.delete(name)) },
    get() { return undefined },
    settings: legacy ? {
      installSection(owner, namespace, schema, config, hooks) {
        registration = { namespace, schema, config, hooks };
        assert.equal(owner, ctx);
        hooks.setSource(() => config);
        owner.effect(() => () => { hooks.setSource(() => config); hooks.onChange() });
      },
    } : {
      configure(value, owner) {
        assert.equal(owner, ctx.fiber);
        policy = value;
        return () => { policy = undefined };
      },
    },
    webServer: { register(route) { assert.equal(routes.has(route.path), false); routes.set(route.path, route); return () => routes.delete(route.path) } },
    systemPrompt: { section(section) { sections.add(section); return () => sections.delete(section) } },
  };
  return { ctx, routes, sections, registration: () => registration, policy: () => policy, update() { events.get('loader/volatile-update')?.() }, dispose() { [...disposers].reverse().forEach(dispose => dispose()); assert.equal(disposers.size, 0) } };
}

test('real rc2 SDK projects all community and launcher fields as writable volatile paths', () => {
  for (const plugin of [community, launcher]) {
    const form = volatileForm(plugin.Config);
    assert.ok(form);
    assert.deepEqual(Object.keys(form.dict), Object.keys(plugin.Config.dict));
    for (const field of Object.keys(plugin.Config.dict)) assert.equal(isVolatilePath(plugin.Config, [field]), true);
  }
  assert.equal(volatileForm(community.Config)({}).enabled, true);
  const defaults = volatileForm(launcher.Config)({});
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.dshCommand, 'dsh');
  assert.throws(() => volatileForm(community.Config)({ enabled: 'false' }));
  assert.throws(() => volatileForm(launcher.Config)({ enabled: 'true' }));
});

test('community native branch observes live accepted enabled state and cleans up policy', () => {
  const state = fixture();
  let enabled = true;
  try {
    community.apply(state.ctx, { enabled: { get: () => enabled } });
    assert.deepEqual(state.policy(), { auto: false });
    assert.ok(community.listCommunityPlugins().length > 0);
    enabled = false; state.update();
    assert.deepEqual(community.listCommunityPlugins(), []);
    enabled = true; state.update();
    assert.ok(community.listCommunityPlugins().some(plugin => typeof plugin.repo === 'string'));
  } finally { state.dispose() }
  assert.equal(state.policy(), undefined);
});

test('community legacy branch installs the actual old namespace and drives its source hooks', () => {
  const state = fixture(true);
  try {
    community.apply(state.ctx, { enabled: true });
    const section = state.registration();
    assert.equal(section.namespace, 'community-plugins');
    assert.equal(section.schema({}).enabled, true);
    section.hooks.setSource(() => ({ enabled: false }));
    assert.deepEqual(community.listCommunityPlugins(), []);
    let enabled = true;
    section.hooks.setSource(() => ({ enabled }));
    assert.ok(community.listCommunityPlugins().length > 0);
    enabled = false; section.hooks.onChange();
    assert.deepEqual(community.listCommunityPlugins(), []);
  } finally { state.dispose() }
});

test('launcher native branch synchronizes actual create/shutdown routes and guidance on live edits', async () => {
  const state = fixture();
  let enabled = false;
  let announceToAgent = false;
  try {
    launcher.apply(state.ctx, { enabled: { get: () => enabled }, announceToAgent: { get: () => announceToAgent } });
    assert.deepEqual(state.policy(), { auto: false });
    assert.equal(state.routes.size, 0);
    enabled = true; state.update();
    assert.equal(state.routes.size, 2);
    announceToAgent = true; state.update();
    assert.equal(state.routes.size, 2);
    assert.equal(state.sections.size, 1);
    for (const route of state.routes.values()) {
      let status;
      const response = { writeHead(code) { status = code }, end() {} };
      await route.handler({ method: 'POST', socket: { remoteAddress: '192.0.2.1' } }, response);
      assert.equal(status, 403);
    }
    announceToAgent = false; state.update();
    assert.equal(state.sections.size, 0);
    enabled = false; state.update();
    assert.equal(state.routes.size, 0);
  } finally { state.dispose() }
  assert.equal(state.routes.size, 0);
  assert.equal(state.policy(), undefined);
});

test('launcher legacy branch keeps real registration, enabled routes and old schema defaults', () => {
  const state = fixture(true);
  try {
    launcher.apply(state.ctx, { enabled: false });
    const section = state.registration();
    assert.equal(section.namespace, 'desktop-launcher');
    assert.equal(section.schema({}).confirmShutdown, true);
    section.hooks.setSource(() => ({ enabled: true, announceToAgent: true }));
    assert.equal(state.routes.size, 2);
    assert.equal(state.sections.size, 1);
    section.hooks.setSource(() => ({ enabled: false }));
    section.hooks.onChange();
    assert.equal(state.routes.size, 0);
    assert.equal(state.sections.size, 0);
  } finally { state.dispose() }
});
