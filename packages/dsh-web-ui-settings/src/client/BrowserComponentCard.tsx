import { useEffect, useState } from 'react'

type Phase = 'idle' | 'checking' | 'waiting' | 'downloading' | 'verifying' | 'extracting' | 'activating' | 'ready' | 'error' | 'cancelled'
type Status = { phase: Phase; receivedBytes: number; totalBytes: number; version: string; error?: string | null }
const phases: Record<Phase, string> = {
  idle: '尚未准备', checking: '正在检查', waiting: '正在等待', downloading: '正在下载',
  verifying: '正在校验', extracting: '正在解压', activating: '正在激活', ready: '可用', error: '准备失败', cancelled: '已取消',
}
const pending = (status: Status | undefined) => status && !['idle', 'ready', 'error', 'cancelled'].includes(status.phase)
const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
async function request(action: 'status' | 'prepare' | 'cancel', signal?: AbortSignal): Promise<Status> {
  const response = await fetch(`/api/desktop/browser-component/${action}`, {
    method: action === 'status' ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
  })
  if (!response.ok) throw new Error(`组件请求失败 (${response.status})，请重试。`)
  const status = await response.json() as Status
  if (!Object.hasOwn(phases, status.phase) || !Number.isFinite(status.receivedBytes) || !Number.isFinite(status.totalBytes)) {
    throw new Error('组件状态无法读取，请重试。')
  }
  return status
}

/** Runtime-owned, same-origin component preparation; provider permissions stay in their original form. */
export function BrowserComponentCard({ active = true }: { active?: boolean }) {
  const [status, setStatus] = useState<Status>()
  const [error, setError] = useState<string>()
  const [acting, setActing] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const next = await request('status', controller.signal)
        if (controller.signal.aborted) return
        setStatus(next)
        setError(undefined)
        if (pending(next)) timer = setTimeout(() => { void poll() }, 750)
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '组件状态无法读取，请重试。')
      }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [active, refresh])
  const act = async (action: 'prepare' | 'cancel') => {
    if (acting) return
    setActing(true); setError(undefined)
    try { setStatus(await request(action)); setRefresh(value => value + 1) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '组件操作失败，请重试。') }
    finally { setActing(false) }
  }
  const openSettings = () => {
    window.dispatchEvent(new CustomEvent('dsh:dock-plugin', { detail: 'dsh-builtin-browser' }))
    window.dispatchEvent(new CustomEvent('dsh:dock-setting', { detail: 'plugin-options' }))
  }
  return <section data-browser-component-card>
    <h1>共享浏览器</h1>
    <p>使用时检查独立浏览器组件，缺失时再下载。浏览器数据和动作权限沿用原配置。</p>
    <p role="status" aria-live="polite">{status ? phases[status.phase] : '正在读取状态'}{status?.version && ` (${status.version})`}</p>
    {status && <p>组件大小：{status.totalBytes > 0 ? size(status.totalBytes) : '读取中'}；已接收 {size(status.receivedBytes)}</p>}
    {status?.phase === 'downloading' && status.totalBytes > 0 && <progress aria-label="浏览器组件下载进度" value={status.receivedBytes} max={status.totalBytes} />}
    {(error || status?.error) && <p role="alert">{error || status?.error}</p>}
    {status?.phase === 'error' && <p>可稍后重试，聊天和项目仍可使用。</p>}
    {pending(status)
      ? <button type="button" disabled={acting} onClick={() => { void act('cancel') }}>取消下载</button>
      : status?.phase !== 'ready' && <button type="button" disabled={acting} onClick={() => { void act('prepare') }}>{status?.phase === 'error' || status?.phase === 'cancelled' ? '重试下载' : '准备浏览器组件'}</button>}
    {error && <button type="button" disabled={acting} onClick={() => setRefresh(value => value + 1)}>刷新状态</button>}
    <button type="button" onClick={openSettings}>浏览器设置与动作权限</button>
  </section>
}
