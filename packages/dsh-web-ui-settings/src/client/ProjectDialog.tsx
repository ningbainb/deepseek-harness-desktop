import { useEffect, useRef, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import css from './desktop-interactions.module.css'
import { reportFeatureEvent } from './feature-telemetry.ts'

export type ProjectServices = Pick<ClientContext, 'workspaces' | 'sessions'>
export const projectCopy = {
  zh: { chooseTitle: '选择工作区', existingGroup: '已有项目', title: '创建项目', name: '项目名称', folder: '源文件夹', pick: '点击选择项目文件夹', hint: '将此文件夹作为项目的工作目录', change: '更换', remove: '移除', cancel: '取消', close: '关闭', busy: '正在创建…', picking: '正在选择…', failed: '项目操作失败，请重试。', exists: '该文件夹已属于项目', open: '打开已有项目' },
  en: { chooseTitle: 'Choose workspace', existingGroup: 'Existing projects', title: 'Create project', name: 'Project name', folder: 'Source folder', pick: 'Choose a project folder', hint: 'Use this folder as the project working directory', change: 'Change', remove: 'Remove', cancel: 'Cancel', close: 'Close', busy: 'Creating…', picking: 'Choosing…', failed: 'Project operation failed. Please retry.', exists: 'This folder already belongs to a project', open: 'Open existing project' },
}
export function normalizeProjectPath(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/, '')
  return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//') ? normalized.toLowerCase() : normalized
}

export function ProjectDialog({ services, onClose, language = 'zh', pickFolder, chooseExisting = false }: { services: ProjectServices; onClose: () => void; language?: 'zh' | 'en'; chooseExisting?: boolean; pickFolder?: () => Promise<string | null | undefined> }) {
  const t = projectCopy[language]
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState('')
  const edited = useRef(false)
  const mounted = useRef(true)
  const lock = useRef(false)
  const dialog = useRef<HTMLDivElement>(null)
  // Retain creation identity across rename/connect failures; never rename an unrelated duplicate.
  const created = useRef<Awaited<ReturnType<ProjectServices['workspaces']['create']>>>()
  const [duplicate, setDuplicate] = useState<NonNullable<typeof created.current>>()
  useEffect(() => {
    mounted.current = true
    const prior = document.activeElement as HTMLElement | null
    dialog.current?.querySelector('input')?.focus()
    return () => { mounted.current = false; if (prior?.isConnected) prior.focus() }
  }, [])
  const pick = async () => {
    if (lock.current) return
    lock.current = true; setPicking(true); setError('')
    try {
      const selected = await (pickFolder ? pickFolder() : services.workspaces.pickDirectory())
      if (!mounted.current || !selected) return
      setPath(selected); created.current = undefined
      if (!edited.current) setName(selected.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? selected)
      setDuplicate(services.workspaces.list.getSnapshot().items.find(item => normalizeProjectPath(item.path) === normalizeProjectPath(selected)))
    } catch (reason) { if (mounted.current) setError(`${t.failed} ${reason instanceof Error ? reason.message : ''}`) }
    finally { lock.current = false; if (mounted.current) setPicking(false) }
  }
  const submit = async () => {
    if (lock.current || !path || !name.trim()) return
    lock.current = true; setBusy(true); setError('')
    const detail = duplicate ? 'connect' : 'create'
    let attempted = false
    try {
      let workspace = duplicate ?? created.current
      if (!workspace) {
        // Refresh the duplicate check just before admission.
        const existing = services.workspaces.list.getSnapshot().items.find(item => normalizeProjectPath(item.path) === normalizeProjectPath(path))
        if (existing) { setDuplicate(existing); return }
        reportFeatureEvent({ feature: 'project', outcome: 'started', detail }); attempted = true
        workspace = await services.workspaces.create({ path })
        created.current = workspace
      }
      if (!attempted) { reportFeatureEvent({ feature: 'project', outcome: 'started', detail }); attempted = true }
      if (!duplicate) await services.workspaces.rename(workspace.workspaceId, name.trim())
      const sessionId = await services.workspaces.connectWorkspace(workspace.workspaceId)
      if (!mounted.current) return
      services.sessions.open(sessionId)
      reportFeatureEvent({ feature: 'project', outcome: 'succeeded', detail })
      onClose()
    } catch (reason) {
      if (attempted) reportFeatureEvent({ feature: 'project', outcome: 'failed', detail })
      if (mounted.current) setError(`${t.failed} ${reason instanceof Error ? reason.message : ''}`)
    }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  return <div className={css.overlay} data-dsh-project-dialog onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); if (!lock.current) onClose() }
    if (event.key === 'Tab') {
      const nodes = [...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')]
      const index = nodes.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey && index <= 0) { event.preventDefault(); nodes.at(-1)?.focus() }
      else if (!event.shiftKey && index === nodes.length - 1) { event.preventDefault(); nodes[0]?.focus() }
    }
  }}>
    <div ref={dialog} className={css.dialog} role="dialog" aria-modal="true" aria-labelledby="dsh-project-title">
      <header><h2 id="dsh-project-title">{chooseExisting ? t.chooseTitle : t.title}</h2><button type="button" className={css.close} aria-label={t.close} disabled={busy || picking} onClick={onClose}>×</button></header>
      {chooseExisting && <section className={css.existing} aria-label={t.existingGroup}>
        {services.workspaces.list.getSnapshot().items.map(item => <button key={item.workspaceId} type="button" disabled={busy || picking}
          aria-pressed={duplicate?.workspaceId === item.workspaceId} onClick={() => {
            setPath(item.path); setName(item.title || item.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || item.path)
            setDuplicate(item); created.current = undefined; setError('')
          }}><strong>{item.title || item.path}</strong><small>{item.path}</small></button>)}
      </section>}
      <form onSubmit={event => { event.preventDefault(); void submit() }}>
        <label className={css.field}>{t.name}<input value={name} maxLength={160} disabled={busy} onChange={event => { edited.current = true; setName(event.target.value) }} placeholder={t.name} /></label>
        <div className={css.field}>{t.folder}</div>
        <button type="button" className={css.folder} disabled={busy || picking} onClick={() => void pick()} title={path || t.pick}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>
          <strong>{picking ? t.picking : path ? path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() : t.pick}</strong>
          <span>{path || t.hint}</span>
        </button>
        {path && <div className={css.folderActions}><button type="button" disabled={busy || picking} onClick={() => void pick()}>{t.change}</button><button type="button" disabled={busy || picking} onClick={() => { setPath(''); setDuplicate(undefined); created.current = undefined }}>{t.remove}</button></div>}
        {duplicate && <p role="status">{t.exists}：{duplicate.title || duplicate.path}</p>}
        {error && <p role="alert" className={css.error}>{error}</p>}
        <footer><button type="button" disabled={busy || picking} onClick={onClose}>{t.cancel}</button><button className={css.primary} type="submit" disabled={busy || picking || !name.trim() || !path}>{busy ? t.busy : duplicate ? t.open : t.title}</button></footer>
      </form>
    </div>
  </div>
}
