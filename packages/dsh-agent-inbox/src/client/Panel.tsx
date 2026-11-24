import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { createDesktopClient } from '@linxin666/dsh-desktop-client'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import css from './agent-inbox.module.css'
import type { ApprovalItem, ChangesPage, DiffPreview, WorkspaceChanges } from '../core/types.ts'

const zh = {
  open: '打开审批收件箱', description: '跨会话处理工具审批，集中查看工作区的 Git 变更。', reminderHint: '有工具调用等待审批时发送桌面通知。', saveFailed: '无法保存提醒设置。',
  title: '审批收件箱', approvals: '待审批', changes: '变更总览', approve: '批准一次', reject: '拒绝',
  session: '打开会话', reminders: '桌面审批提醒', empty: '暂无待审批请求。', close: '关闭',
  error: '操作未完成，请重试。', refresh: '刷新', redacted: '参数值已隐藏', seconds: '秒',
  loading: '正在加载', diff: '查看差异', truncated: '输出超过预览限制。', unavailable: '当前工作区无法读取 Git 状态。',
  added: '新增', deleted: '删除', modified: '修改', more: '加载更多工作区',
  none: '没有检测到变更。', reminderBody: '有工具调用等待审批。',
}
const en: typeof zh = {
  open: 'Open approval inbox', description: 'Review tool approvals across sessions and inspect workspace Git changes.', reminderHint: 'Show a desktop notification when a tool call needs approval.', saveFailed: 'Could not save notification preferences.',
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
const openEvent = 'dsh:agent-inbox:open'
const reminderListeners = new Set<() => void>()

function subscribeReminders(listener: () => void) {
  reminderListeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    reminderListeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

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

function InboxIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 13l2.5-7h11l2.5 7v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 13h5l1 2h4l1-2h5" />
  </svg>
}

function ReminderSwitch({ t }: Locale) {
  const enabled = useSyncExternalStore(subscribeReminders, remindersEnabled, () => false)
  const [failed, setFailed] = useState(false)
  return <div className={css.reminder}>
    <button className={css.toggle} type="button" role="switch" aria-checked={enabled} onClick={() => {
      try {
        localStorage.setItem(reminderKey, enabled ? '0' : '1')
        setFailed(false)
        for (const listener of reminderListeners) listener()
      } catch { setFailed(true) }
    }}><span className={css.track} aria-hidden="true" />{t('reminders')}</button>
    {failed && <p role="alert" className={css.error}>{t('saveFailed')}</p>}
  </div>
}

export function Settings({ t }: Locale) {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let active = true
    void desktop.hasCapability('notifications.show').then(value => { if (active) setAvailable(value) }).catch(() => {})
    return () => { active = false }
  }, [])
  return <section className={css.card} data-agent-inbox-settings>
    <header><h3>{t('title')}</h3><p>{t('description')}</p></header>
    <div className={css.settingsRow}>
      <div><ReminderSwitch t={t} /><p>{t('reminderHint')}</p></div>
      <button type="button" disabled={!available} onClick={() => window.dispatchEvent(new Event(openEvent))}><InboxIcon />{t('open')}</button>
    </div>
  </section>
}

function diffTone(line: string) {
  if (line.startsWith('@@') || /^(?:diff |index |--- |\+\+\+ )/.test(line)) return 'hunk'
  if (line.startsWith('+')) return 'added'
  if (line.startsWith('-')) return 'deleted'
}

function FileDiff({ t, workspaceId, file }: Locale & { workspaceId: string; file: WorkspaceChanges['files'][number] }) {
  const [result, setResult] = useState<DiffPreview>()
  const [failed, setFailed] = useState(false)
  const requestId = useRef(0)
  const tone = file.status.includes('D') ? 'deleted' : file.status === '??' || file.status.includes('A') ? 'added' : 'modified'
  return <details className={css.file} onToggle={event => {
    if (!event.currentTarget.open) return
    const id = ++requestId.current
    setResult(undefined)
    setFailed(false)
    const params = new URLSearchParams({ workspaceId, path: file.path })
    void request<DiffPreview>('diff?' + params).then(
      value => { if (id === requestId.current) setResult(value) },
      () => { if (id === requestId.current) setFailed(true) },
    )
  }}>
    <summary title={t('diff')}>
      <code title={file.path}>{file.path}</code>
      <span className={css.badge} data-tone={tone}>{t(tone)}</span>
      {file.added !== undefined && <span className={css.stats}><span data-tone="added">+{file.added}</span> / <span data-tone="deleted">-{file.removed}</span></span>}
    </summary>
    <div className={css.diffBody}>
      {failed ? <p role="alert" className={css.error}>{t('error')}</p> : !result ? <p role="status">{t('loading')}</p> : <>
        {result.truncated && <p>{t('truncated')}</p>}
        <pre className={css.diff} tabIndex={0} aria-label={t('diff')}>{result.text.split('\n').map((line, index) =>
          <span key={index} data-tone={diffTone(line)}>{line}{'\n'}</span>)}</pre>
      </>}
    </div>
  </details>
}

type EntryProps = Locale & Pick<PropsRuntime<'sidebar.footer.action'>, 'wide'> & { openSession: (id: string) => void; sessionTitle: (id: string) => string }
function Inbox({ t, openSession, sessionTitle, wide }: EntryProps) {
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
  const approvalRevision = useRef(0)
  const [changesRevision, setChangesRevision] = useState(0)

  const refresh = async () => {
    if (activePoll.current) return
    activePoll.current = true
    const revision = approvalRevision.current
    try {
      const rows = await request<ApprovalItem[]>('pending')
      if (approvalRevision.current !== revision) return
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
    if (offset === 0) setChangesRevision(revision => revision + 1)
  })

  useEffect(() => {
    if (!desktopAvailable) return
    const open = () => { if (dialog.current && !dialog.current.open) dialog.current.showModal() }
    window.addEventListener(openEvent, open)
    return () => window.removeEventListener(openEvent, open)
  }, [desktopAvailable])

  if (!desktopAvailable) return null
  return <>
    <button className={css.entry} type="button" data-agent-inbox-entry data-rail={wide ? undefined : "rail"} aria-label={t('title')} title={t('title')} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
      <InboxIcon /><span>{t('title')}</span>{items.length > 0 && <span className={css.count}>{items.length}</span>}
    </button>
    <dialog ref={dialog} aria-label={t('title')} className={css.dialog} onClick={event => {
      if (event.target === event.currentTarget) dialog.current?.close()
    }}>
      <div className={css.drawer}>
        <header className={css.header}>
          <h2>{t('title')}</h2>
          <div className={css.actions}>
            <ReminderSwitch t={t} />
            <button type="button" disabled={busy} onClick={() => {
              if (tab === 'changes') void loadChanges()
              else { setFailed(false); void refresh() }
            }}>{t('refresh')}</button>
            <button type="button" aria-label={t('close')} title={t('close')} onClick={() => dialog.current?.close()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </header>
        <nav aria-label={t('title')} className={css.tabs}>
          <button type="button" aria-pressed={tab === 'approvals'} onClick={() => { setTab('approvals'); setFailed(false) }}>{t('approvals')} <span className={css.count}>{items.length}</span></button>
          <button type="button" aria-pressed={tab === 'changes'} disabled={busy} onClick={() => {
            setTab('changes')
            if (!workspaces) void loadChanges()
          }}>{t('changes')}</button>
        </nav>
        <div className={css.content}>
          {failed && <p role="alert" className={css.error}>{t('error')}</p>}
          {tab === 'approvals' ? <>
            {items.length === 0 && <p className={css.empty}>{t('empty')}</p>}
            <ul className={css.list}>{items.map(item => <li key={item.id} className={css.item}>
              <div className={css.approvalHeading}>
                <h3>{sessionTitle(item.sessionId)}</h3>
                <span className={css.badge}>{item.toolName}</span>
                <span className={css.waiting}>{Math.max(0, Math.floor((Date.now() - item.waitingSince) / 1000))} {t('seconds')}</span>
              </div>
              <p className={css.preview}>{t('redacted')}{item.argumentCount === undefined ? '' : ' (' + item.argumentCount + ')'}</p>
              <div className={css.decision}>
                <button type="button" onClick={() => { dialog.current?.close(); openSession(item.sessionId) }}>{t('session')}</button>
                <div className={css.actions}>
                  {(['rejected', 'allowed-once'] as const).map(value => <button type="button" key={value}
                    className={value === 'rejected' ? css.danger : css.primary} disabled={busy} onClick={() => void run(async () => {
                      await request('decision', { id: item.id, value })
                      approvalRevision.current++
                      setItems(current => current.filter(row => row.id !== item.id))
                    })}>{t(value === 'allowed-once' ? 'approve' : 'reject')}</button>)}
                </div>
              </div>
            </li>)}</ul>
          </> : <>
            {busy && <p role="status">{t('loading')}</p>}
            {workspaces?.length === 0 && <p className={css.empty}>{t('none')}</p>}
            {workspaces?.map(workspace => <section className={css.item} key={changesRevision + ":" + workspace.id}>
              <h3>{workspace.title}</h3>
              {workspace.unavailable ? <p>{t('unavailable')}</p> : <>
                {workspace.truncated && <p>{t('truncated')}</p>}
                {!workspace.files.length && <p>{t('none')}</p>}
                <ul className={css.files}>{workspace.files.map(file => <li key={file.path}>
                  <FileDiff t={t} file={file} workspaceId={workspace.id} />
                </li>)}</ul>
              </>}
            </section>)}
            {nextOffset !== undefined && <button type="button" disabled={busy} onClick={() => void loadChanges(nextOffset)}>{t('more')}</button>}
          </>}
        </div>
      </div>
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
