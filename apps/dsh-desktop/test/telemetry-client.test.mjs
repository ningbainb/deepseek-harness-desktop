import assert from 'node:assert/strict'
import test from 'node:test'

import { ProductTelemetryClient } from '../src/telemetry-client.mjs'

const CONTEXT = Object.freeze({
  appVersion: '2.5.0',
  channel: 'stable',
  os: 'windows-11',
  language: 'zh',
})

const SURFACE_EVENT = Object.freeze({ outcome: 'opened', detail: 'settings', bucket: 'none' })
const ACTORS = Object.freeze({
  installationActor: 'c'.repeat(64),
  dailyActor: 'a'.repeat(64),
  monthlyActor: 'b'.repeat(64),
})

test('disabled clients drop events without scheduling or fetching', async () => {
  let fetched = 0
  let scheduled = 0
  const client = new ProductTelemetryClient({
    context: CONTEXT,
    fetchImpl: async () => { fetched += 1 },
    schedule: () => { scheduled += 1 },
  })
  assert.equal(client.record('surface_opened', SURFACE_EVENT), false)
  assert.equal(await client.flush(), false)
  assert.equal(fetched, 0)
  assert.equal(scheduled, 0)
})

test('keeps events in memory and flushes one bounded JSON batch', async () => {
  const requests = []
  let timerCallback
  const client = new ProductTelemetryClient({
    endpoint: 'https://telemetry.example/v1/events',
    context: CONTEXT,
    actorProvider: () => ACTORS,
    fetchImpl: async (url, init) => {
      requests.push({ url, init })
      return new Response(null, { status: 204 })
    },
    schedule: (callback) => { timerCallback = callback; return 1 },
    cancelSchedule: () => {},
  })

  assert.equal(client.record('surface_opened', SURFACE_EVENT), true)
  assert.equal(client.queued, 1)
  assert.equal(typeof timerCallback, 'function')
  await timerCallback()
  assert.equal(client.queued, 0)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'https://telemetry.example/v1/events')
  assert.equal(requests[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    schema: 4,
    events: [{ name: 'surface_opened', ...CONTEXT, ...ACTORS, ...SURFACE_EVENT }],
  })
  assert.equal(requests[0].init.headers.origin, undefined)
})

test('flushes at twenty events and never retries failed delivery', async () => {
  let requests = 0
  const client = new ProductTelemetryClient({
    endpoint: 'https://telemetry.example/v1/events',
    context: CONTEXT,
    actorProvider: () => ACTORS,
    fetchImpl: async () => {
      requests += 1
      return new Response('unavailable', { status: 503 })
    },
    schedule: () => 1,
    cancelSchedule: () => {},
  })
  for (let index = 0; index < 20; index += 1) client.record('surface_opened', SURFACE_EVENT)
  await client.idle()
  assert.equal(requests, 1)
  assert.equal(client.queued, 0)
})

test('aborts slow delivery and contains transport failures', async () => {
  let aborted = false
  const client = new ProductTelemetryClient({
    endpoint: 'https://telemetry.example/v1/events',
    context: CONTEXT,
    actorProvider: () => ACTORS,
    timeoutMs: 5,
    fetchImpl: async (_url, init) => await new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        aborted = true
        reject(new DOMException('aborted', 'AbortError'))
      }, { once: true })
    }),
    schedule: globalThis.setTimeout,
    cancelSchedule: globalThis.clearTimeout,
  })
  client.record('surface_opened', SURFACE_EVENT)
  assert.equal(await client.flush(), false)
  assert.equal(aborted, true)
  assert.equal(client.queued, 0)
})

test('shutdown is best effort and never waits past its deadline', async () => {
  const client = new ProductTelemetryClient({
    endpoint: 'https://telemetry.example/v1/events',
    context: CONTEXT,
    actorProvider: () => ACTORS,
    timeoutMs: 5_000,
    fetchImpl: async () => await new Promise(() => {}),
  })
  client.record('surface_opened', SURFACE_EVENT)
  const started = Date.now()
  assert.equal(await client.shutdown({ deadlineMs: 20 }), false)
  assert.ok(Date.now() - started < 500)
})

test('bad identity providers, validation and timers cannot throw into business callers', async () => {
  const base = { endpoint:'https://telemetry.example/v1/events',context:CONTEXT,actorProvider:()=>ACTORS, schedule(){throw new Error('timer')},cancelSchedule(){throw new Error('timer')},fetchImpl:async()=>{throw new Error('offline')} }
  for (const options of [base,{...base,actorProvider(){throw new Error('identity')} }]) {
    const client=new ProductTelemetryClient(options)
    assert.doesNotThrow(()=>client.record('surface_opened',SURFACE_EVENT))
    assert.doesNotThrow(()=>client.record('unrecognized',{}))
    assert.equal(await client.flush(),false)
    await assert.doesNotReject(() => client.shutdown())
  }
})

test('queued route parameters cannot acquire raw fields through caller mutation', async () => {
  let sent
  const client = new ProductTelemetryClient({ endpoint: 'https://telemetry.example/v1/events', context: CONTEXT,
    actorProvider: () => ACTORS, schedule: () => 1, cancelSchedule() {},
    fetchImpl: async (_url, init) => { sent = JSON.parse(init.body); return new Response(null, { status: 204 }) },
  })
  const params = { role: 'main', result: 'success', strategy: 'balanced', model: 'deepseek-chat', error_type: 'none' }
  assert.equal(client.record('cost_mode_route', { params }), true)
  params.error = 'private provider response'
  params.model = 'private mutation'
  await client.flush()
  assert.equal(sent.events[0].params.model, 'deepseek-chat')
  assert.equal(Object.hasOwn(sent.events[0].params, 'error'), false)
})

test('saturated queues prioritize route failures and send canonical schema 5', async () => {
  const bodies=[]
  let finish
  const client=new ProductTelemetryClient({endpoint:'https://telemetry.example/v1/events',context:CONTEXT,actorProvider:()=>ACTORS,schedule:()=>1,cancelSchedule(){},fetchImpl:async(_url,init)=>{
    bodies.push(JSON.parse(init.body))
    if(bodies.length===1) await new Promise(resolve=>{finish=resolve})
    return new Response(null,{status:204})
  }})
  for(let i=0;i<240;i++)client.record('value_mode_call',{outcome:'started',detail:'controller',bucket:'none'})
  await Promise.resolve(); await Promise.resolve()
  assert.equal(client.queued,200)
  assert.equal(client.record('cost_mode_route',{params:{role:'subagent',result:'failure',strategy:'saving',model:'deepseek-chat',error_type:'timeout'}}),true)
  assert.equal(client.queued,200)
  finish()
  await client.shutdown({deadlineMs:1000})
  assert.equal(bodies[1].schema,5)
  assert.equal(bodies[1].events[0].params.result,'failure')
  assert.equal(bodies[1].events[0].params.model,'deepseek-chat')
  assert.ok(bodies.every(body=>body.events.every(e=>!e.name.startsWith('value_mode_'))))
})
