import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import worker from '../src/index.mjs'
import { AnalyticsService, CLEANUP_WRITE_BUDGET } from '../src/analytics-service.mjs'
import { rollupAnalytics, rollupQuery } from '../src/analytics-rollup.mjs'
import { summarizeCostMode } from '../src/cost-mode-summary.mjs'
import { database } from './analytics-fixture.mjs'
import { validCostEvent, legacyCostEvent } from '../../dsh-desktop/src/cost-mode-events.mjs'

const now = new Date('2026-09-09T12:00:00.000Z')
const context = { appVersion:'3.4.0',channel:'stable',os:'windows-11',language:'zh',dailyActor:'a'.repeat(64),monthlyActor:'b'.repeat(64),installationActor:'c'.repeat(64) }
function route(params = {}) { return { ...context,name:'cost_mode_route',params:{role:'main',result:'success',strategy:'balanced',model:'deepseek-chat',error_type:'none',...params},timestamp:now.toISOString(),eventId:crypto.randomUUID() } }
function request(events) { return new Request('https://test.invalid/v1/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({schema:5,events})}) }

test('200000 successful route signals perform zero ingestion D1 mutations and one daily snapshot write', async () => {
  const {db,wrapper,mutations}=database()
  try {
    let points=0
    const service=new AnalyticsService({METRICS:wrapper,ANALYTICS:{writeDataPoint(){points++}}},{now:()=>now})
    const batch=Array.from({length:20},()=>route())
    for(let i=0;i<10000;i++) assert.equal(await service.record(batch,5),true)
    assert.equal(points,200000); assert.equal(mutations.length,0)
    const row={event:'cost_mode_route',app_version:'3.4.0',outcome:'success',detail:'main',bucket:'balanced',count:200000,sample_interval:1}
    await rollupAnalytics({METRICS:wrapper,ANALYTICS_ACCOUNT_ID:'a'.repeat(32),ANALYTICS_READ_TOKEN:'test'},{now,fetchImpl:async(_u,init)=>new Response(JSON.stringify({data:init.body.includes("blob1 = '2026-09-09'")?[row]:[]}))})
    assert.equal(mutations.length,1)
    assert.equal(db.prepare('SELECT SUM(count) AS n FROM metric_daily_all').get().n,200000)
  } finally {db.close()}
})

test('concurrent historical expiry stays within the cleanup write budget and serves every table', async () => {
  const visited = new Set()
  for (let hour = 0; hour < 9; hour++) {
    let written = 0
    const METRICS = { prepare(statement) { return { async run() {
      const table = statement.match(/^DELETE FROM (\w+)/u)[1]
      const limit = Number(statement.match(/LIMIT (\d+)/u)[1])
      const rows = limit * (table.startsWith('product_installation_') ? 2 : 1)
      visited.add(table); written += rows
      return { success: true, meta: { rows_written: rows } }
    } } } }
    await new AnalyticsService({ METRICS }, { now: () => new Date(now.getTime() + hour * 3_600_000) }).scheduled()
    assert.ok(written > 0)
    assert.ok(written <= CLEANUP_WRITE_BUDGET, `cleanup consumed ${written} billed rows`)
  }
  assert.equal(visited.size, 9, 'all retention targets must receive cleanup despite sustained backlog')
})

test('failure cleanup preserves recent diagnostics while bounding an expired backlog', async () => {
  const { db, wrapper } = database()
  try {
    const insert = db.prepare('INSERT INTO analytics_failure (id,timestamp,received_day,event,error_type,model,role,strategy,version) VALUES (?,?,?,?,?,?,?,?,?)')
    for (let i = 0; i < 1000; i++) insert.run(String(i), '2000-01-01T00:00:00.000Z', '2000-01-01', 'cost_mode_route', 'timeout', 'deepseek-chat', 'main', 'balanced', '3.4.0')
    insert.run('recent', new Date().toISOString(), new Date().toISOString().slice(0, 10), 'cost_mode_route', 'timeout', 'deepseek-chat', 'main', 'balanced', '3.4.0')
    await new AnalyticsService({ METRICS: wrapper }, { now: () => now }).scheduled()
    assert.equal(db.prepare('SELECT count(*) AS n FROM analytics_failure').get().n, 751)
    assert.ok(db.prepare("SELECT id FROM analytics_failure WHERE id='recent'").get())
  } finally { db.close() }
})

test('legacy cost names normalize to five parameterized events and never fall back to D1', async () => {
  const {db,wrapper,points,mutations}=database()
  try {
    const combinations=[['entry','selected','configured'],['state','enabled','manual'],['strategy','selected','saver'],['onboarding','shown','hero'],['call','started','controller']]
    const events=combinations.map(([name,outcome,detail])=>({...context,name:'value_mode_'+name,outcome,detail,bucket:'none'}))
    const service=new AnalyticsService({METRICS:wrapper,ANALYTICS:wrapper.analytics},{now:()=>now})
    await service.record(events,4)
    assert.deepEqual(points.map(p=>p.blobs[1]),['cost_mode_enter','cost_mode_toggle','cost_mode_strategy','cost_mode_guide','cost_mode_route'])
    assert.equal(mutations.length,0)
    await new AnalyticsService({METRICS:wrapper},{now:()=>now}).record(events,4)
    assert.equal(mutations.length,0)
    assert.equal(legacyCostEvent(events.at(-1),now).params.result,'started')
  } finally {db.close()}
})

test('every failed route is stored with diagnosis even when Analytics Engine throws, rejects or stalls', async () => {
  for(const writeDataPoint of [()=>{throw new Error('private')},()=>Promise.reject(new Error('private')),()=>new Promise(()=>{})]) {
    const {db,wrapper}=database()
    try {
      const event=route({role:'subagent',result:'failure',strategy:'saving',error_type:'rate_limit'})
      const env={INGEST_ENABLED:'1',METRICS:wrapper,ANALYTICS:{writeDataPoint}}
      assert.equal((await worker.fetch(request([event]),env,{now:()=>now})).status,204)
      assert.equal((await worker.fetch(request([event]),env,{now:()=>now})).status,204)
      const saved=db.prepare('SELECT * FROM analytics_failure').all()
      assert.equal(saved.length,1, 'D1 diagnosis is idempotent by event ID')
      assert.deepEqual({...saved[0]},{id:event.eventId,timestamp:now.toISOString(),received_day:'2026-09-09',event:'cost_mode_route',error_type:'rate_limit',model:'deepseek-chat',role:'subagent',strategy:'saving',version:'3.4.0',diagnostic:'{}'})
    } finally {db.close()}
  }
})

test('D1 prepare/batch failures and missing bindings do not escape the ingestion boundary', async () => {
  for(const db of [undefined,{prepare(){throw new Error('quota')}},{prepare(){return {bind(){return this}}},batch(){return Promise.reject(new Error('quota'))}}]) {
    const response=await worker.fetch(request([route({result:'failure',error_type:'timeout'})]),{INGEST_ENABLED:'1',METRICS:db,ANALYTICS:{writeDataPoint(){}}},{now:()=>now})
    assert.equal(response.status,204); assert.equal(await response.text(),'')
  }
  const pending=[]
  const response=await worker.fetch(request([route({result:'failure',error_type:'timeout'})]),{INGEST_ENABLED:'1',METRICS:{prepare(){return {bind(){return this}}},batch(){return new Promise(()=>{})}},ANALYTICS:{writeDataPoint(){}}},{now:()=>now,waitUntil(p){pending.push(p)}})
  assert.equal(response.status,204); assert.equal(pending.length,1)
})

test('wire schema rejects content, invalid enums and injection but accepts bounded failure dimensions',async()=>{
  const e=route({result:'failure',error_type:'provider'})
  assert.equal(validCostEvent(e),true)
  for(const invalid of [{...e,prompt:'private'},{...e,params:{...e.params,error_type:'raw error text'}},{...e,params:{...e.params,model:'https://secret?token=value'}},{...e,params:{...e.params,sessionId:'private'}},{...e,timestamp:'yesterday'}]) {
    assert.equal(validCostEvent(invalid),false)
    assert.equal((await worker.fetch(request([invalid]),{INGEST_ENABLED:'1'})).status,400)
  }
})

test('rollups overwrite absolute counts, reject stale races, preserve data on empty, failure or truncation',async()=>{
  const {db,wrapper}=database()
  try {
    const env={METRICS:wrapper,ANALYTICS_ACCOUNT_ID:'a'.repeat(32),ANALYTICS_READ_TOKEN:'test'}
    const row={event:'cost_mode_route',outcome:'success',detail:'main',bucket:'balanced',count:100,sample_interval:10}
    const run=(time,data)=>rollupAnalytics(env,{now:new Date(time),fetchImpl:async()=>new Response(JSON.stringify({data}))})
    await run(now.toISOString(),[row]); await run(now.toISOString(),[row])
    assert.equal(db.prepare('SELECT SUM(count) AS n FROM analytics_rollup_events').get().n,300)
    await run('2026-09-09T11:00:00.000Z',[{...row,count:1}])
    assert.equal(db.prepare('SELECT SUM(count) AS n FROM analytics_rollup_events').get().n,300)
    await run('2026-09-09T13:00:00.000Z',[])
    assert.equal(db.prepare('SELECT SUM(count) AS n FROM analytics_rollup_events').get().n,300)
    await assert.rejects(run('2026-09-09T13:00:00.000Z',Array(4001).fill(row)),/incomplete/u)
    await assert.rejects(rollupAnalytics(env,{now,fetchImpl:async()=>new Response('error',{status:503})}),/unavailable/u)
    assert.equal(db.prepare('SELECT SUM(count) AS n FROM analytics_rollup_events').get().n,300)
    assert.match(rollupQuery('2026-09-09'),/SUM\(_sample_interval \* double1\)/u)
    assert.throws(()=>rollupQuery("';DROP TABLE x"))
  }finally{db.close()}
})

test('ratios exclude unfinished/cancelled calls and keep guide completion and strategy counts',()=>{
  const rows=[['cost_mode_route','started','main','saving',100],['cost_mode_route','success','main','saving',80],['cost_mode_route','failure','main','saving',10],['cost_mode_route','cancelled','main','saving',5],['cost_mode_route','started','subagent','balanced',50],['cost_mode_route','success','subagent','balanced',40],['cost_mode_route','failure','subagent','balanced',10],['value_mode_call','started','controller','none',999],['cost_mode_guide','shown','hero','none',20],['cost_mode_guide','completed','hero','none',15]].map(([event,outcome,detail,bucket,count])=>({event,outcome,detail,bucket,count}))
  const summary=summarizeCostMode(rows)
  assert.equal(summary.failureRate,20/140); assert.equal(summary.guideCompletionRate,15/20)
  assert.equal(summary.legacyStarted,999); assert.equal(summary.strategies.saving,100); assert.equal(summary.strategies.balanced,50)
})

test('schema removes five redundant indexes and business handlers cannot directly mutate analytics tables',()=>{
  const {db}=database()
  try {
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name),['product_installation_daily_actor_day','product_installation_first_seen_day'])
    for(const file of readdirSync(new URL('../src/',import.meta.url)).filter(f=>f.endsWith('.mjs')&&!['analytics-service.mjs','analytics-rollup.mjs','analytics-sql.mjs'].includes(f))) {
      assert.doesNotMatch(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),/\b(?:INSERT(?: OR IGNORE)? INTO|DELETE FROM|UPDATE)\s+(?:metric_|analytics_|product_|download_click_)/u,file)
    }
  }finally{db.close()}
})
