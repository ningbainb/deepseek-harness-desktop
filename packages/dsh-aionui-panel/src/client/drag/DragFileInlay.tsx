/**
 * Composer dock inlay: the drop target for explorer file drags. It mounts
 * in the official `conversation.input.dock` band (a session-scoped list
 * slot declared by the shipped ui-conversation rc.6 shell), so it stacks
 * with the git-graph chip above the composer card. While a file row is
 * dragged over the page it shows a hint strip; on drop it splices the
 * workspace-relative path into the active session's draft through the
 * conversation input facade.
 *
 * The document-level listeners only claim drags carrying our custom MIME —
 * the composer host's own drop handling (OS image files) is untouched. The
 * host's `dragover` refuses every drop it does not claim, so this inlay
 * must `preventDefault` its own drags to make the drop land.
 * @module dsh-aionui-panel/client/drag/DragFileInlay
 */

import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  FILE_DRAG_MIME,
  MAX_SAFE_IMAGE_BYTES,
  compressImageFileToFit,
  formatDroppedFile,
  hasAnyFileDrag,
  hasFileDrag,
  isImageFile,
  isPureImageDrag,
} from './file-drag.ts'
import { t } from '../locales.ts'
import dragCss from '../styles/drag.module.css'

/** Injected business face of the drag inlay (session-routed). */
export interface DragFileInjected {
  /** Splice a workspace-relative path or document text into the active session's draft. */
  insertPath: (path: string) => boolean
  /** Add image files into the active session's draft image attachments. */
  addImages?: (files: readonly File[]) => boolean
}

/** Composed props: the dock's runtime share (sessionId) + the injected verb. */
export type DragFileInlayProps =
  PropsRuntime<'conversation.input.dock'>
  & DragFileInjected

/**
 * The composer dock entry: a zero-height anchor that shows a hint strip
 * while a file row or non-image document is dragged over the page and inserts content on drop.
 * Pure image drags from the OS are yielded completely to the host's native image attachment handler.
 * @param props - the composed dock entry props.
 */
export function DragFileInlay(props: DragFileInlayProps): ReactElement {
  const [active, setActive] = useState(false)
  const depth = useRef(0)

  useEffect(() => {
    const reset = (): void => {
      depth.current = 0
      setActive(false)
    }

    const onDragEnter = (event: DragEvent): void => {
      if (!hasAnyFileDrag(event.dataTransfer?.types)) return
      if (isPureImageDrag(event.dataTransfer?.types, event.dataTransfer?.items)) {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      depth.current += 1
      setActive(true)
    }

    const onDragOver = (event: DragEvent): void => {
      if (!hasAnyFileDrag(event.dataTransfer?.types)) return
      if (isPureImageDrag(event.dataTransfer?.types, event.dataTransfer?.items)) {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy'
      }
      if (!active) setActive(true)
    }

    const onDragLeave = (event: DragEvent): void => {
      if (!hasAnyFileDrag(event.dataTransfer?.types)) return
      if (isPureImageDrag(event.dataTransfer?.types, event.dataTransfer?.items)) {
        return
      }
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setActive(false)

      const leftViewport =
        event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight
      if ((event.target === document.documentElement || event.target === document.body) && leftViewport) {
        reset()
      }
    }

    const onDrop = (event: DragEvent): void => {
      // 1. Workspace internal file drag from aionui explorer
      if (hasFileDrag(event.dataTransfer?.types)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        const path = event.dataTransfer?.getData(FILE_DRAG_MIME) ?? ''
        reset()
        if (path !== '') props.insertPath(path)
        return
      }

      if (!event.dataTransfer?.types?.includes('Files')) return

      const rawFiles = event.dataTransfer?.files
      if (!rawFiles || rawFiles.length === 0) {
        reset()
        return
      }

      const files = Array.from(rawFiles)
      const imageFiles: File[] = []
      const nonImageFiles: File[] = []

      for (const file of files) {
        if (isImageFile(file)) {
          imageFiles.push(file)
        } else {
          nonImageFiles.push(file)
        }
      }

      const anyImageNeedsCompression = imageFiles.some(
        (f) => f.size > MAX_SAFE_IMAGE_BYTES || f.size > 2 * 1024 * 1024
      )

      // Case A: Pure image drop where all images are already small -> yield to native handler
      if (imageFiles.length > 0 && nonImageFiles.length === 0 && !anyImageNeedsCompression) {
        reset()
        return
      }

      // Case B: Non-image files, mixed files, or oversized images that require auto-compression
      // Stop native handler from throwing "file too large" or "unsupported image" errors
      event.preventDefault()
      event.stopImmediatePropagation()
      reset()

      // 1. Process image files: automatically compress oversized images before adding to draft attachments
      if (imageFiles.length > 0 && props.addImages) {
        void Promise.all(
          imageFiles.map((file) => compressImageFileToFit(file))
        ).then((compressed) => {
          props.addImages?.(compressed)
        }).catch(() => {})
      }

      // 2. Format non-image files and splice into the prompt draft
      if (nonImageFiles.length > 0) {
        void Promise.all(
          nonImageFiles.map((file) => formatDroppedFile(file))
        ).then((formatted) => {
          const textToInsert = formatted.filter((item) => item !== '').join('\n\n')
          if (textToInsert !== '') {
            props.insertPath(textToInsert)
          }
        }).catch(() => {})
      }
    }

    // Auto-compress oversized images pasted directly from clipboard (Ctrl+V)
    const onPaste = (event: ClipboardEvent): void => {
      if (!props.addImages) return
      const clipboardItems = event.clipboardData?.items
      if (!clipboardItems || clipboardItems.length === 0) return

      const imageFiles: File[] = []
      for (let i = 0; i < clipboardItems.length; i++) {
        const item = clipboardItems[i]
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) imageFiles.push(file)
        }
      }

      if (imageFiles.length === 0) return

      const needsCompression = imageFiles.some(
        (f) => f.size > MAX_SAFE_IMAGE_BYTES || f.size > 2 * 1024 * 1024
      )
      if (!needsCompression) return

      event.preventDefault()
      event.stopImmediatePropagation()

      void Promise.all(
        imageFiles.map((file) => compressImageFileToFit(file))
      ).then((compressed) => {
        props.addImages?.(compressed)
      }).catch(() => {})
    }

    const onDragEnd = (): void => reset()

    document.addEventListener('dragenter', onDragEnter, true)
    document.addEventListener('dragover', onDragOver, true)
    document.addEventListener('dragleave', onDragLeave, true)
    document.addEventListener('drop', onDrop, true)
    window.addEventListener('dragend', onDragEnd, true)
    window.addEventListener('paste', onPaste, true)

    return () => {
      document.removeEventListener('dragenter', onDragEnter, true)
      document.removeEventListener('dragover', onDragOver, true)
      document.removeEventListener('dragleave', onDragLeave, true)
      document.removeEventListener('drop', onDrop, true)
      window.removeEventListener('dragend', onDragEnd, true)
      window.removeEventListener('paste', onPaste, true)
    }
  }, [props.insertPath, props.addImages])

  return (
    <div
      className={active ? `${dragCss.strip} ${dragCss.stripActive}` : dragCss.strip}
      data-testid="aionui-drag-inlay"
      aria-live="polite"
    >
      {active ? <span className={dragCss.stripText}>{t('explorer.drag.dropHint')}</span> : null}
    </div>
  )
}
