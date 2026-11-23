import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { createDesktopClient } from '@linxin666/dsh-desktop-client'
import { useEffect, useRef, useState } from 'react'
import type { ApprovalItem, ChangesPage, DiffPreview, WorkspaceChanges } from '../core/types.ts'

const zh = {
  title: '审批收件箱', approvals: '待审批', changes: '变更总览', approve: '批准一次', reject: '拒绝',
  session: '打开会话', reminders: '桌面审批提醒', empty: '暂无待审批请求。', close: '关闭',
  error: '操作未完成，请重试。', refresh: '刷新', redacted: '参数值已隐藏', seconds: '秒',
  loading: '正在加载', diff: '查看差异', truncated: '输出超过预览限制。', unavailable: '当前工作区无法读取 Git 状态。',
  added: '新增', deleted: '删除', modified: '修改', more: '加载更多工作区',
  none: '没有检测到变更。', reminderBody: '有工具调用等待审批。',
}
const en: typeof zh = {
  title: 'Approval inbox', approvals: 'Pending approvals', changes: 'Workspace changes', approve: 'Allow once', reject: 'Reject',
  session: 'Open session', reminders: 'Desktop approval reminders', empty: 'No pending approvals.', close: 'Close',
  error: 'The operation could not complete. Try again.', refresh: 'Refresh', redacted: 'Argument values hidden', seconds: 's',
  loading: 'Loading', diff: 'View diff', truncated: 'Output exceeds the preview limit.', unavailable: 'Git status is unavailable for this workspace.',
  added: 'Added', deleted: 'Deleted', modified: 'Modified', more: 'Load more workspaces',
  none: 'No changes detected.', reminderBody: 'A tool call is waiting for approval.',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'agent-inbox': keyof typeof zh }
  interface SlotMap { 'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: { children?: never } } }
}

type Locale = PropsLocale<'agent-inbox'>
const desktop = createDesktopClient()
const reminderKey = 'dsh:agent-inbox:notifications'

async function request<T>(path: string, decision?: { id: string; value: string }): Promise<T> {
  const response = await fetch('/api/dsh-agent-inbox/' + path, {
    method: decision ? 'POST' : 'GET',
    cache: 'no-store',
    headers: { 'x-dsh-agent-inbox': '1', ...(decision && {
      'x-dsh-approval-id': decision.id,
      'x-dsh-approval-decision': decision.value,
    }) },
  })
  if (!response.ok) throw Error('Agent inbox request failed')
  return response.json() as Promise<T>
}

function remindersEnabled() {
  try { return localStorage.getItem(reminderKey) === '1' } catch { return false }
}

function Settings({ t }: Locale) {
  const [enabled, setEnabled] = useState(remindersEnabled)
  return <label><input type="checkbox" checked={enabled} onChange={event => {
    const value = event.currentTarget.checked
    localStorage.setItem(reminderKey, value ? '1' : '0')
    setEnabled(value)
  }} />{t('reminders')}</label>
}

function FileDiff({ t, workspaceId, path }: Locale & { workspaceId: string; path: string }) {
  const [result, setResult] = useState<DiffPreview>()
  const [failed, setFailed] = useState(false)
  return <details onToggle={event => {
    if (!event.currentTarget.open) return
    setResult(undefined)
    setFailed(false)
    const params = new URLSearchParams({ workspaceId, path })
    void request<DiffPreview>('diff?' + params).then(setResult, () => setFailed(true))
  }}>
    <summary>{t('diff')}</summary>
    {failed ? <p role="alert">{t('error')}</p> : !result ? <p>{t('loading')}</p> : <>
      {result.truncated && <p>{t('truncated')}</p>}
      <pre style={{ overflow: 'auto', maxHeight: 360 }}>{result.text}</pre>
    </>}
  </details>
}

type EntryProps = Locale & { openSession: (id: string) => void; sessionTitle: (id: string) => string }
function Inbox({ t, openSession, sessionTitle }: EntryProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const notified = useRef(new Set<string>())
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceChanges[]>()
  const [nextOffset, setNextOffset] = useState<number>()
  const [tab, setTab] = useState<'approvals' | 'changes'>('approvals')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [desktopAvailable, setDesktopAvailable] = useState(false)
  const activePoll = useRef(false)

  const refresh = async () => {
    if (activePoll.current) return
    activePoll.current = true
    try {
      const rows = await request<ApprovalItem[]>('pending')
      setItems(rows)
      const next = new Set(rows.map(item => item.id))
      if (remindersEnabled()) for (const item of rows) {
        if (notified.current.has(item.id)) continue
        void desktop.showNotification({ category: 'approval', id: 'approval:' + item.id, title: t('title'), body: t('reminderBody') }).catch(() => {})
      }
      notified.current = next
    } catch {
      if (dialog.current?.open) setFailed(true)
    } finally { activePoll.current = false }
  }
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    let disposed = false
    void desktop.hasCapability('notifications.show').then(available => {
      if (disposed || !available) return
      setDesktopAvailable(true)
      void refresh()
      timer = setInterval(() => void refresh(), 1500)
    }).catch(() => {})
    return () => { disposed = true; clearInterval(timer) }
  }, [])

  const run = async (operation: () => Promise<void>) => {
    setBusy(true)
    setFailed(false)
    try { await operation() } catch { setFailed(true) }
    finally { setBusy(false) }
  }
  const loadChanges = (offset = 0) => run(async () => {
    const page = await request<ChangesPage>('changes?offset=' + offset)
    setWorkspaces(current => offset ? [...(current ?? []), ...page.workspaces] : page.workspaces)
    setNextOffset(page.nextOffset)
  })

  if (!desktopAvailable) return null
  return <>
    <button type="button" onClick={() => dialog.current?.showModal()}>{t('title')}{items.length ? ' (' + items.length + ')' : ''}</button>
    <dialog ref={dialog} aria-label={t('title')} style={{
      width: 'min(38rem, 92vw)', height: 'min(48rem, 92vh)', marginInlineEnd: 12, overflow: 'auto',
      color: 'CanvasText', backgroundColor: 'Canvas', border: '1px solid GrayText', borderRadius: 12, padding: 20,
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{t('title')}</h2><button onClick={() => dialog.current?.close()}>{t('close')}</button>
      </header>
      <nav aria-label={t('title')}>
        <button aria-pressed={tab === 'approvals'} onClick={() => { setTab('approvals'); setFailed(false) }}>{t('approvals')}</button>{' '}
        <button aria-pressed={tab === 'changes'} disabled={busy} onClick={() => { setTab('changes'); void loadChanges() }}>{t('changes')}</button>
      </nav>
      {failed && <p role="alert">{t('error')}</p>}
      {tab === 'approvals' ? <>
        <p><Settings t={t} /></p>
        {items.length === 0 && <p>{t('empty')}</p>}
        <ul>{items.map(item => <li key={item.id}>
          <p><strong>{item.toolName}</strong> · {sessionTitle(item.sessionId)} · {Math.max(0, Math.floor((Date.now() - item.waitingSince) / 1000))} {t('seconds')}</p>
          <p>{t('redacted')}{item.argumentCount === undefined ? '' : ' (' + item.argumentCount + ')'}</p>
          <button onClick={() => { dialog.current?.close(); openSession(item.sessionId) }}>{t('session')}</button>{' '}
          {(['allowed-once', 'rejected'] as const).map(value => <button key={value} disabled={busy} onClick={() => void run(async () => {
            await request('decision', { id: item.id, value })
            setItems(current => current.filter(row => row.id !== item.id))
          })}>{t(value === 'allowed-once' ? 'approve' : 'reject')}</button>)}
        </li>)}</ul>
      </> : <>
        <p><button disabled={busy} onClick={() => void loadChanges()}>{t('refresh')}</button></p>
        {busy && <p role="status">{t('loading')}</p>}
        {workspaces?.map(workspace => <section key={workspace.id}>
          <h3>{workspace.title}</h3>
          {workspace.unavailable ? <p>{t('unavailable')}</p> : <>
            {workspace.truncated && <p>{t('truncated')}</p>}
            {!workspace.files.length && <p>{t('none')}</p>}
            <ul>{workspace.files.map(file => <li key={file.path}>
              <span>{t(file.status.includes('D') ? 'deleted' : file.status === '??' || file.status.includes('A') ? 'added' : 'modified')}</span>{' '}
              <code>{file.path}</code>
              {file.added !== undefined && <> +{file.added} / -{file.removed}</>}
              <FileDiff t={t} path={file.path} workspaceId={workspace.id} />
            </li>)}</ul>
          </>}
        </section>)}
        {nextOffset !== undefined && <button disabled={busy} onClick={() => void loadChanges(nextOffset)}>{t('more')}</button>}
      </>}
    </dialog>
  </>
}

export const inject = ['slots', 'locale', 'uiWorkspace', 'sessions']
export function apply(ctx: Context) {
  ctx.effect(() => ctx.locale.register('agent-inbox', { zh, en }))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'agent-inbox', locale: 'agent-inbox',
    inject: () => ({
      openSession: (id: string) => { void ctx.uiWorkspace.openSession(id as SessionId) },
      sessionTitle: (id: string) => (ctx.sessions as unknown as ISessions).list.getSnapshot().byId[id as SessionId]?.title ?? id,
    }),
  }, Inbox))
  ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
    name: 'web-ui.plugin.item', id: 'agent-inbox', order: 119, locale: 'agent-inbox',
  }, Settings))
}
