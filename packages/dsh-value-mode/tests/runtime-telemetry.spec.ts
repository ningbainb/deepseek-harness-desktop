import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.ts'
import { emitValueModeRuntimeTelemetry, routeErrorType } from '../src/core/runtime-telemetry.ts'
vi.mock('../src/core/runtime-telemetry.ts', async (original) => ({ ...await original<typeof import('../src/core/runtime-telemetry.ts')>(), emitValueModeRuntimeTelemetry: vi.fn() }))

function fixture(origin?: string) {
  const ctx = new Context()
  ctx.tools = { register: vi.fn() } as never
  ctx.systemPrompt = { section: vi.fn() } as never
  ctx.settings = { installSection: vi.fn((_ctx, _namespace, _schema, config, options) => options.setSource(() => config)) } as never
  ctx.llm = { listProviders: () => [{id:'deepseek'}], listModels: async () => [] } as never
  apply(ctx, {enabled:true,strategy:'saver',expert:{provider:'deepseek',model:'deepseek-reasoner'},executor:{provider:'deepseek',model:'deepseek-chat'}})
  const agent = {id:'private-session',session:{header:{agentPreset:'value-mode',origin}}}
  const payload = {agent,turn:1,step:1,signal:new AbortController().signal}
  return {ctx,agent,payload,request:()=>ctx.bail('agent/request',payload as never,async()=>({provider:'ordinary',model:'ordinary'}))}
}
describe('route settlement telemetry through official SDK events',()=>{
  beforeEach(()=>vi.mocked(emitValueModeRuntimeTelemetry).mockClear())
  it('counts starts, genuine successful settlements and duplicate end frames correctly',async()=>{
    const {ctx,agent,request}=fixture()
    expect((await request()).model).toBe('deepseek-reasoner')
    expect(emitValueModeRuntimeTelemetry).toHaveBeenCalledTimes(1)
    ctx.emit('agent/assistant-stream',{agent,frame:{type:'start',attemptId:'attempt-1',turn:1,step:1,revision:1}} as never)
    const end={agent,frame:{type:'end',attemptId:'attempt-1',revision:1,index:0,outcome:{kind:'committed',eventType:'assistant/message',seq:1}}}
    ctx.emit('agent/assistant-stream',end as never); ctx.emit('agent/assistant-stream',end as never)
    expect(emitValueModeRuntimeTelemetry).toHaveBeenCalledTimes(2)
    expect(vi.mocked(emitValueModeRuntimeTelemetry).mock.calls[1][0]).toMatchObject({event:'cost_mode_route',params:{role:'main',strategy:'saving',result:'success',model:'deepseek-reasoner',error_type:'none'}})
    expect(JSON.stringify(vi.mocked(emitValueModeRuntimeTelemetry).mock.calls)).not.toContain('private-session')
  })
  it('preserves retry decisions, failure information and the next attempt result',async()=>{
    const {ctx,agent,payload,request}=fixture('subagent')
    await request()
    const failure={...payload,provider:'deepseek',failure:{code:'rate-limit',status:429,message:'secret response body'}}
    expect(await ctx.bail('agent/request-error',failure as never,async()=>({kind:'retry'}))).toEqual({kind:'retry'})
    await request()
    ctx.emit('agent/assistant-stream',{agent,frame:{type:'start',attemptId:'retry',turn:1,step:1,revision:2}} as never)
    ctx.emit('agent/assistant-stream',{agent,frame:{type:'end',attemptId:'retry',revision:2,index:0,outcome:{kind:'committed',eventType:'assistant/message',seq:2}}} as never)
    const calls=vi.mocked(emitValueModeRuntimeTelemetry).mock.calls.map(c=>c[0])
    expect(calls).toHaveLength(4)
    expect(calls[1]).toMatchObject({params:{role:'subagent',result:'failure',error_type:'rate_limit',model:'deepseek-chat'}})
    expect(calls[3]).toMatchObject({params:{result:'success'}})
    expect(JSON.stringify(calls)).not.toContain('secret response body')
  })
  it('treats abandoned streams as cancellation rather than success',async()=>{
    const {ctx,agent,request}=fixture()
    await request()
    ctx.emit('agent/assistant-stream',{agent,frame:{type:'start',attemptId:'a',turn:1,step:1,revision:1}} as never)
    ctx.emit('agent/assistant-stream',{agent,frame:{type:'end',attemptId:'a',revision:1,index:0,outcome:{kind:'abandoned'}}} as never)
    expect(vi.mocked(emitValueModeRuntimeTelemetry).mock.calls[1][0]).toMatchObject({params:{result:'cancelled',error_type:'cancelled'}})
    expect(routeErrorType({status:401})).toBe('auth')
    expect(routeErrorType({code:'ETIMEDOUT'})).toBe('timeout')
  })
})
