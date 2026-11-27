/**
 * The Git button in the conversation composer toolbar.
 * @module dsh-git-graph/client/chips/Chip
 */

import type { ReactNode, RefObject } from 'react'
import css from './context.module.css'

/** Join conditional class names (the dependency-free clsx stand-in). */
export function cx(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ')
}

/** Props of one context chip. */
export interface ChipProps {
  icon: ReactNode
  label: string
  ariaLabel: string
  open: boolean
  onClick: () => void
  /** @deprecated Composer controls use the same style in every session phase. */
  hero?: boolean
  buttonRef?: RefObject<HTMLButtonElement>
}

/** An icon-only branch control with an accessible name and a native tooltip. */
export function Chip({ icon, label, ariaLabel, open, onClick, buttonRef }: ChipProps) {
  return (
    <button
      type="button"
      data-gitgraph-chip
      ref={buttonRef}
      className={cx(css.chip, open && css.chipOpen)}
      title={label}
      aria-haspopup="menu"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={open}
    >
      {icon}
    </button>
  )
}

/** Full-screen transparent backdrop closing the open popover/dialog on click. */
export function Backdrop({ onClose }: { onClose: () => void }) {
  return <div className={css.backdrop} onClick={onClose} />
}
