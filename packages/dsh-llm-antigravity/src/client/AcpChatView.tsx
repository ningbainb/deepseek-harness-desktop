import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { acpStore, type AcpChatMessage } from './acpStore.ts'
import css from './AcpChat.module.css'
import { GeminiModelMenu, SparkleIcon } from './GeminiModelMenu.tsx'

function workspaceFolderName(cwd?: string): string {
  if (!cwd) return '默认工作区'
  const parts = cwd.split(/[\\/]+/u).filter(Boolean)
  return parts.at(-1) || cwd
}

function renderInlineCode(text: string): ReactNode[] {
  const pieces = text.split(/(`[^`\n]+`)/gu)
  return pieces.map((part, idx) => (
    part.startsWith('`') && part.endsWith('`') && part.length > 2
      ? <code key={idx} className={css.inlineCode}>{part.slice(1, -1)}</code>
      : part
  ))
}

function FormattedMessage({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const result: Array<{ kind: 'text' | 'code'; content: string }> = []
    const regex = /```(?:[a-zA-Z0-9_-]+)?\r?\n([\s\S]*?)```/gu
    let last = 0
    for (const match of text.matchAll(regex)) {
      const idx = match.index ?? 0
      if (idx > last) result.push({ kind: 'text', content: text.slice(last, idx) })
      result.push({ kind: 'code', content: match[1] ?? '' })
      last = idx + match[0].length
    }
    if (last < text.length) result.push({ kind: 'text', content: text.slice(last) })
    return result
  }, [text])

  return (
    <div className={css.replyBody}>
      {blocks.map((block, idx) => (
        block.kind === 'code'
          ? <pre key={idx} className={css.codeBlock}><code>{block.content}</code></pre>
          : block.content.split(/\r?\n\r?\n/u).filter(Boolean).map((para, pIdx) => (
              <p key={`${idx}-${pIdx}`} className={css.replyPara}>{renderInlineCode(para)}</p>
            ))
      ))}
    </div>
  )
}

function AssistantMessage({ msg, modelName, onRetry }: { msg: AcpChatMessage; modelName: string; onRetry?: () => void }) {
  return (
    <div className={css.assistantRow}>
      <div className={css.assistantMeta}>
        <span className={css.sparkle}><SparkleIcon size={12} /></span>
        <span>{modelName}</span>
        {msg.streaming && <span className={css.spinner} aria-label="生成中" />}
      </div>

      {msg.thoughts && (
        <details className={css.thoughtBox}>
          <summary>{msg.streaming && !msg.text ? '正在思考...' : '查看思考过程'}</summary>
          <div className={css.thoughtBody}>{msg.thoughts}</div>
        </details>
      )}

      {msg.plan && msg.plan.length > 0 && (
        <div className={css.planBox}>
          <div className={css.planTitle}>执行计划</div>
          <ol className={css.planList}>
            {msg.plan.map((entry, idx) => (
              <li key={idx}>
                {entry.content}{entry.status ? `（${entry.status}）` : ''}
              </li>
            ))}
          </ol>
        </div>
      )}

      {msg.toolCalls && msg.toolCalls.length > 0 && msg.toolCalls.map((call, idx) => (
        <div key={call.toolCallId || idx} className={css.toolCard}>
          <div className={css.toolHead}>
            <span>{call.title || call.kind || '工具调用'}</span>
            {call.status && <span className={css.toolStatus}>{call.status}</span>}
          </div>
          {call.diff && (
            <pre className={css.diffBlock}>
              {`${call.diff.path}\n${call.diff.oldText ? `- ${call.diff.oldText}\n` : ''}${call.diff.newText ? `+ ${call.diff.newText}` : ''}`}
            </pre>
          )}
        </div>
      ))}

      {msg.pendingPermission && (
        <div className={css.permCard} role="alertdialog" aria-label="需要人工授权确认">
          <div className={css.permTitle}>需要确认操作：{msg.pendingPermission.title || msg.pendingPermission.kind || '外部工具操作'}</div>
          {msg.pendingPermission.rawInput !== undefined && (
            <div className={css.permDetail}>{JSON.stringify(msg.pendingPermission.rawInput)}</div>
          )}
          <div className={css.permActions}>
            {msg.pendingPermission.options.map(opt => (
              <button
                key={opt.optionId}
                type="button"
                className={opt.kind?.startsWith('reject') ? css.permDenyBtn : css.permAllowBtn}
                disabled={msg.pendingPermission?.resolving}
                onClick={() => {
                  void acpStore.resolvePermission(msg.id, msg.pendingPermission!.permissionId, opt.optionId)
                }}
              >
                {opt.name || opt.optionId}
              </button>
            ))}
            <button
              type="button"
              className={css.permDenyBtn}
              disabled={msg.pendingPermission.resolving}
              onClick={() => {
                void acpStore.resolvePermission(msg.id, msg.pendingPermission!.permissionId, undefined, true)
              }}
            >
              拒绝本次操作
            </button>
          </div>
        </div>
      )}

      {msg.text && <FormattedMessage text={msg.text} />}

      {msg.error && (
        <div className={css.errorBox} role="alert">
          {msg.error}
          {onRetry && !msg.streaming && (
            <button type="button" className={css.ghostBtn} style={{ marginInlineStart: 10, height: 24 }} onClick={onRetry}>
              重连会话
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function AcpChatView() {
  const snap = useSyncExternalStore(acpStore.subscribe, acpStore.getSnapshot, acpStore.getSnapshot)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const models = snap.availableModels.length > 0 ? snap.availableModels : (snap.diagnostic?.models ?? [])
  const activeModel = models.find(m => m.id === snap.selectedModelId) ?? models[0]
  const activeModelName = activeModel?.name ?? snap.selectedModelId ?? '选择 Gemini 模型'
  const thoughtOption = snap.configOptions.find(opt => opt.id === 'thought_level')

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [snap.messages])

  useEffect(() => {
    if (snap.active) {
      queueMicrotask(() => textareaRef.current?.focus())
    }
  }, [snap.active])

  function submit() {
    if (!draft.trim() || snap.busy) return
    const text = draft
    setDraft('')
    if (textareaRef.current) textareaRef.current.style.height = '44px'
    void acpStore.sendPrompt(text)
  }

  return (
    <section className={css.acpSurface} data-antigravity-acp-chat="true" aria-label="Gemini 交互会话">
      <header className={css.topBar}>
        <div className={css.topBarLeft}>
          <span className={css.topTitle}>
            <span className={css.sparkle}><SparkleIcon size={15} /></span>
            Gemini 交互会话
          </span>
          <span className={css.cwdChip} title={snap.cwd}>{workspaceFolderName(snap.cwd)}</span>
          <span className={css.compliancePill}>本机 ACP 合规交互</span>
          {snap.starting && <span className={css.spinner} aria-label="正在连接 Antigravity CLI" />}
        </div>
        <div className={css.topActions}>
          <button
            type="button"
            className={css.ghostBtn}
            disabled={snap.busy}
            onClick={() => { void acpStore.newConversation() }}
          >
            新建对话
          </button>
          <button
            type="button"
            className={css.ghostBtn}
            onClick={() => { acpStore.closeToNormalChat() }}
          >
            返回普通会话
          </button>
        </div>
      </header>

      <div ref={scrollRef} className={css.threadScroll}>
        <div className={css.threadInner}>
          {snap.messages.length === 0 ? (
            <div className={css.heroEmpty}>
              <div className={css.heroMark}><SparkleIcon size={22} /></div>
              <h2>与 Gemini 开始本机交互</h2>
              <div className={css.heroMeta}>
                <span className={css.cwdChip}>{activeModelName}</span>
                {snap.cwd && <span className={css.cwdChip}>{snap.cwd}</span>}
              </div>
              <p className={css.heroNote}>
                当前会话通过官方 Antigravity ACP 协议在本机实时交互，仅响应当前窗口手动发送的对话，不进入后台调度、自动化脚本或远程通道。
              </p>
              {snap.error && (
                <div className={css.errorBox} role="alert">
                  {snap.error}
                  <button
                    type="button"
                    className={css.ghostBtn}
                    style={{ marginInlineStart: 10, height: 24 }}
                    onClick={() => { void acpStore.openWithModel(snap.selectedModelId, snap.cwd) }}
                  >
                    重试连接
                  </button>
                </div>
              )}
            </div>
          ) : (
            snap.messages.map((msg) => (
              msg.role === 'user' ? (
                <div key={msg.id} className={css.userRow}>
                  <div className={css.userBubble}>{msg.text}</div>
                </div>
              ) : (
                <AssistantMessage
                  key={msg.id}
                  msg={msg}
                  modelName={models.find(m => m.id === msg.modelId)?.name ?? activeModelName}
                  onRetry={() => { void acpStore.openWithModel(snap.selectedModelId, snap.cwd) }}
                />
              )
            ))
          )}
        </div>
      </div>

      <div className={css.composerWrap}>
        <div className={css.composerCard}>
          <textarea
            ref={textareaRef}
            className={css.composerTextarea}
            rows={2}
            value={draft}
            placeholder={`向 ${activeModelName} 发送消息，按 Enter 发送，Shift+Enter 换行...`}
            onChange={(e) => {
              setDraft(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <div className={css.composerRow}>
            <div className={css.composerLeft}>
              <button
                type="button"
                className={css.ghostBtn}
                style={{ height: 28 }}
                onClick={() => { acpStore.closeToNormalChat() }}
              >
                ↩ 普通会话
              </button>
              {thoughtOption?.options && thoughtOption.options.length > 0 && (
                <select
                  className={css.effortSelect}
                  aria-label="思考深度"
                  value={thoughtOption.currentValue ?? thoughtOption.options[0].value}
                  onChange={(e) => { void acpStore.setConfigOption(thoughtOption.id, e.target.value) }}
                >
                  {thoughtOption.options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.name || opt.value}</option>
                  ))}
                </select>
              )}
            </div>
            <div className={css.composerRight}>
              <GeminiModelMenu
                models={models}
                currentModelId={activeModel?.id}
                triggerLabel={activeModelName}
                activeStyle
                disabled={models.length === 0}
                onSelectModel={(modelId) => { void acpStore.switchModel(modelId) }}
                onSwitchBackToNormal={() => { acpStore.closeToNormalChat() }}
              />
              {snap.busy ? (
                <button
                  type="button"
                  className={css.sendBtn}
                  aria-label="停止生成"
                  title="停止生成"
                  onClick={() => { acpStore.cancelTurn() }}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <rect x="3.5" y="3.5" width="9" height="9" rx="2" fill="currentColor" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  className={css.sendBtn}
                  aria-label="发送消息"
                  title="发送消息"
                  disabled={!draft.trim() || snap.starting}
                  onClick={submit}
                >
                  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                    <path d="M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z" fill="currentColor" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function AcpChatFrameHoc({ children }: { hero?: boolean; children?: ReactNode }) {
  const active = useSyncExternalStore(
    acpStore.subscribe,
    () => acpStore.getSnapshot().active,
    () => acpStore.getSnapshot().active,
  )

  if (!active) return <>{children}</>

  return (
    <>
      <div className={css.hiddenChildren}>{children}</div>
      <AcpChatView />
    </>
  )
}
