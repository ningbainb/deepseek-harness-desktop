/** Actual Cordis + Desktop pipe + installed aggregate updater; no TCP listener or update operations. */
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Context as HostContext, Fiber, Plugin } from '@deepseek-ai/cordis'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { describe, expect, it } from 'vitest'
import * as remote from '../src/index.ts'

const pipeUrl = new URL('../../dsh-desktop-pipe-webserver/lib/index.mjs', import.meta.url)
const pipeRequire = createRequire(pipeUrl)
// Match the actual pipe's Cordis instance, even if pnpm has multiple SDK peer closures.
const { Context } = pipeRequire('@deepseek-ai/cordis') as typeof import('@deepseek-ai/cordis')
const desktopRequire = createRequire(new URL('../../../apps/dsh-desktop/package.json', import.meta.url))
const aggregateRequire = createRequire(desktopRequire.resolve('@linxin666/dsh-web-all'))

interface Pipe {
  exact: Map<string, WebRoute>
  prefixes: Map<string, WebRoute>
  fetch(request: Request): Promise<Response>
}

async function fixture(): Promise<{ ctx: HostContext; web: Pipe; updater: Plugin }> {
  const pipeModule = await import(/* @vite-ignore */ pathToFileURL(fileURLToPath(pipeUrl)).href)
  const updater = await import(/* @vite-ignore */ pathToFileURL(aggregateRequire.resolve('@linxin666/dsh-update')).href) as Plugin
  const ctx = new Context()
  pipeModule.apply(ctx)
  ctx.provide('connection', {
    createPeer: (options: ConstructorParameters<typeof Peer>[1]) => new Peer(ctx, options),
  } as never)
  const unexpectedGatewayCall = (): never => { throw new Error('ownership test must not call the gateway') }
  ctx.provide('typertGateway', { invoke: unexpectedGatewayCall, stream: unexpectedGatewayCall } as never)
  ctx.provide('userScope', {} as never)
  return { ctx, web: ctx.get('webServer') as unknown as Pipe, updater }
}

function updateHandlers(web: Pipe): unknown[] {
  const status = web.exact.get('/api/update/status')?.handler
  const run = web.exact.get('/api/update/run')?.handler
  expect(status).toBeTypeOf('function')
  expect(run).toBeTypeOf('function')
  return [status, run]
}

async function expectRemoteAvailable(web: Pipe): Promise<void> {
  expect(web.exact.has('/api/pair/issue')).toBe(true)
  expect(web.prefixes.has('/m/api')).toBe(true)
  const page = await web.fetch(new Request('http://127.0.0.1/m'))
  expect(page.status).toBe(200)
  expect(await page.text()).toContain('<!doctype html>')
  expect((await web.fetch(new Request('http://127.0.0.1/api/pair/status'))).status).toBe(200)
}

describe('remote host update-route ownership', () => {
  it('retains standalone update routes by default and removes every route on unload', async () => {
    const { ctx, web } = await fixture()
    try {
      const mounted = await ctx.plugin(remote)
      updateHandlers(web)
      await expectRemoteAvailable(web)
      await mounted.dispose()
      expect(web.exact.size).toBe(0)
      expect(web.prefixes.size).toBe(0)
    } finally { await ctx.fiber.dispose() }
  })

  it.each(['updater-first', 'remote-first'])('coexists with the real dedicated updater (%s), including off/on and remount', async order => {
    const { ctx, web, updater } = await fixture()
    // This SDK's schema is callable (Config(data)), rather than Config.parse(data).
    // Exercise real defaults and Volatile.get() fields instead of hand-built refs.
    const config = remote.Config({ embeddedUpdateRoutes: false })
    // The loader event commits new parsed live fields; the composition option
    // remains fixed for the entire mount.
    const liveRemote = { name: 'remote-live-fixture', inject: remote.inject, apply: (child: HostContext) => remote.apply(child, config) }
    try {
      let mounted: Fiber
      if (order === 'updater-first') {
        await ctx.plugin(updater)
        mounted = await ctx.plugin(liveRemote)
      } else {
        mounted = await ctx.plugin(liveRemote)
        await ctx.plugin(updater)
      }
      const owner = updateHandlers(web)
      await expectRemoteAvailable(web)
      config.enabled = remote.Config({ enabled: false }).enabled
      ctx.emit('loader/volatile-update', [])
      expect(web.exact.size).toBe(2)
      expect(web.prefixes.size).toBe(0)
      expect(updateHandlers(web)).toEqual(owner)
      config.enabled = remote.Config({ enabled: true }).enabled
      ctx.emit('loader/volatile-update', [])
      await expectRemoteAvailable(web)
      expect(updateHandlers(web)).toEqual(owner)
      await mounted.dispose()
      expect(web.exact.size).toBe(2)
      expect(web.prefixes.size).toBe(0)
      const remounted = await ctx.plugin(liveRemote)
      await expectRemoteAvailable(web)
      expect(updateHandlers(web)).toEqual(owner)
      await remounted.dispose()
      expect(web.exact.size).toBe(2)
    } finally { await ctx.fiber.dispose() }
    expect(web.exact.size).toBe(0)
    expect(web.prefixes.size).toBe(0)
  })

  it('keeps strict duplicate detection and rolls back remote routes on a default-config collision', async () => {
    const { ctx, web, updater } = await fixture()
    try {
      await ctx.plugin(updater)
      const owner = updateHandlers(web)
      const failed = ctx.plugin(remote)
      await expect(failed.await()).rejects.toThrow('duplicate exact route "/api/update/status"')
      expect(updateHandlers(web)).toEqual(owner)
      expect(web.exact.size).toBe(2)
      expect(web.prefixes.size).toBe(0)
      await failed.dispose()
      // A corrected mount must work without restarting the process.
      const corrected = await ctx.plugin(remote, { embeddedUpdateRoutes: false })
      await expectRemoteAvailable(web)
      expect(updateHandlers(web)).toEqual(owner)
      await corrected.dispose()
      expect(web.exact.size).toBe(2)
    } finally { await ctx.fiber.dispose() }
    expect(web.exact.size).toBe(0)
    expect(web.prefixes.size).toBe(0)
  })
})
