import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CliModel } from '../config.ts'
import css from './AcpChat.module.css'

export interface GeminiModelMenuProps {
  models: readonly CliModel[]
  currentModelId?: string
  triggerLabel: string
  activeStyle?: boolean
  disabled?: boolean
  onSelectModel: (modelId: string) => void
  onSwitchBackToNormal?: () => void
}

function isGeminiModel(model: CliModel): boolean {
  return /gemini|orchestrator/iu.test(model.id) || /gemini|orchestrator/iu.test(model.name)
}

export function SparkleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M8 1.2c.3 2.8 1.2 4.3 2.5 5.3 1.2.9 2.7 1.3 4.3 1.5-1.6.2-3.1.6-4.3 1.5-1.3 1-2.2 2.5-2.5 5.3-.3-2.8-1.2-4.3-2.5-5.3-1.2-.9-2.7-1.3-4.3-1.5 1.6-.2 3.1-.6 4.3-1.5C6.8 5.5 7.7 4 8 1.2Z" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4.5 6 8l3.5-3.5" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m2.5 6.5 2.5 2.5 5-5" />
    </svg>
  )
}

export function GeminiModelMenu({
  models,
  currentModelId,
  triggerLabel,
  activeStyle = false,
  disabled = false,
  onSelectModel,
  onSwitchBackToNormal,
}: GeminiModelMenuProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const orderedModels = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? models.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      : [...models]
    return filtered.sort((a, b) => Number(isGeminiModel(b)) - Number(isGeminiModel(a)))
  }, [models, query])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useLayoutEffect(() => {
    const menu = menuRef.current
    const trigger = triggerRef.current
    if (!open || !menu || !trigger) return
    const supportsPopover = typeof menu.showPopover === 'function' && typeof menu.hidePopover === 'function'
    if (supportsPopover) {
      menu.setAttribute('popover', 'manual')
      try { menu.showPopover() } catch {}
    }

    const position = () => {
      const anchor = trigger.getBoundingClientRect()
      const menuW = menu.offsetWidth || 296
      const menuH = menu.offsetHeight || 280
      const left = Math.max(8, Math.min(anchor.right - menuW, window.innerWidth - menuW - 8))
      const top = anchor.top >= menuH + 12
        ? anchor.top - menuH - 6
        : Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - menuH - 8))
      menu.style.left = `${left}px`
      menu.style.top = `${top}px`
    }

    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      if (supportsPopover && menu.isConnected && menu.matches?.(':popover-open')) {
        try { menu.hidePopover() } catch {}
      }
    }
  }, [open, orderedModels.length])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${css.composerTrigger} ${activeStyle ? css.composerTriggerActive : ''} ${open ? css.composerTriggerOpen : ''}`}
        disabled={disabled}
        data-antigravity-gemini-trigger=""
        aria-haspopup="listbox"
        aria-expanded={open}
        title="通过本机 Antigravity ACP 人工交互协议选择 Gemini 模型"
        onClick={() => {
          setQuery('')
          setOpen(prev => !prev)
        }}
      >
        <span className={css.sparkle}><SparkleIcon size={13} /></span>
        <span className={css.triggerText}>{triggerLabel}</span>
        <span className={`${css.chevron} ${open ? css.chevronOpen : ''}`}><ChevronDownIcon /></span>
      </button>

      {open && (
        <div
          ref={menuRef}
          className={css.menuPopover}
          role="listbox"
          aria-label="Gemini 交互模型列表"
          data-antigravity-gemini-menu=""
        >
          <div className={css.menuHeader}>
            <span className={css.menuTitle}>Gemini 模型 · 本机交互</span>
            <span className={css.menuBadge}>ACP 合规通道</span>
          </div>
          {models.length > 8 && (
            <div className={css.searchWrap}>
              <input
                type="search"
                className={css.searchInput}
                placeholder="搜索模型名称或 ID..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
          )}
          <div className={css.menuList}>
            {orderedModels.length === 0 ? (
              <div className={css.menuEmpty}>没有匹配的模型</div>
            ) : (
              orderedModels.map((model) => {
                const selected = model.id === currentModelId
                return (
                  <button
                    key={model.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`${css.menuItem} ${selected ? css.menuItemSelected : ''}`}
                    onClick={() => {
                      setOpen(false)
                      onSelectModel(model.id)
                    }}
                  >
                    <span className={css.menuItemMeta}>
                      <span className={css.menuItemName}>{model.name}</span>
                      {model.name !== model.id && <span className={css.menuItemId}>{model.id}</span>}
                    </span>
                    {selected && <span className={css.checkIcon}><CheckIcon /></span>}
                  </button>
                )
              })
            )}
          </div>
          {onSwitchBackToNormal && (
            <div className={css.menuFooter}>
              <button
                type="button"
                className={css.switchBackBtn}
                onClick={() => {
                  setOpen(false)
                  onSwitchBackToNormal()
                }}
              >
                ↩ 切回普通会话（DeepSeek / API 模型）
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
