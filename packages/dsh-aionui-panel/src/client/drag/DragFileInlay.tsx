/**
 * Composer dock inlay: the drop target for explorer file drags. It mounts
 * in the official `conversation.input.dock` band (a session-scoped list
 * slot declared by the shipped ui-conversation rc.6 shell), so it stacks
 * with the git-graph chip above the composer card. While a file row is
 * dragged over the page it shows a hint strip; on drop it splices the
 * workspace-relative path into the active session's draft through the
 * conversation input facade.
 *
 * Current DSH owns ordinary OS file drops. This layer handles internal paths,
 * oversized-image preprocessing and legacy shells without generic uploads.
 * @module dsh-aionui-panel/client/drag/DragFileInlay
 */

import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  FILE_DRAG_MIME,
  ImageProcessingError,
  MAX_SAFE_IMAGE_BYTES,
  formatDroppedFilesSequentially,
  hasAnyFileDrag,
  hasFileDrag,
  isImageFile,
  isPureImageDrag,
  processImageFilesSequentially,
  type ImageProcessingPhase,
} from './file-drag.ts'
import { t } from '../locales.ts'
import dragCss from '../styles/drag.module.css'
import type { FileAttachmentQueue } from './attachments.ts'
import { FileAttachmentRail } from './FileAttachmentRail.tsx'

/** Injected business face of the drag inlay (session-routed). */
export interface DragFileInjected {
  fileQueue?: FileAttachmentQueue
  /** Splice a workspace-relative path reference or plain-text content into the active draft. */
  insertPath: (path: string) => boolean
  /** Add image files into the active session's draft image attachments. */
  addImages?: (files: readonly File[]) => boolean
  /** Present only when the official generic-file upload lifecycle is available. */
  addFiles?: (files: readonly File[]) => boolean
}

/** Composed props: the dock's runtime share (sessionId) + the injected verb. */
export type DragFileInlayProps =
  PropsRuntime<'conversation.input.dock'>
  & DragFileInjected

/**
 * The composer dock entry: a zero-height anchor that shows a hint strip
 * while a file row or non-image document is dragged over the page and inserts a path reference
 * or plain-text content on drop. It does not claim to parse binary document formats.
 * Pure image drags from the OS are yielded completely to the host's native image attachment handler.
 * @param props - the composed dock entry props.
 */
export function DragFileInlay(props: DragFileInlayProps): ReactElement {
  const [active, setActive] = useState(false)
  const [phase, setPhase] = useState<'idle' | ImageProcessingPhase | 'submitting' | 'failed' | 'directory'>('idle')
  const depth = useRef(0)
  const imageBatch = useRef<AbortController | null>(null)
  const generation = useRef(0)

  useEffect(() => {
    let mounted = true
    const reset = (): void => {
      depth.current = 0
      setActive(false)
    }

    const setCurrentPhase = (batch: number, next: typeof phase): void => {
      if (mounted && batch === generation.current) setPhase(next)
    }

    const processImages = (files: readonly File[], nativeBatch?: readonly File[]): void => {
      if (files.length === 0) return
      if (!props.addImages) {
        generation.current += 1
        setPhase('failed')
        return
      }
      imageBatch.current?.abort()
      const controller = new AbortController()
      const batch = ++generation.current
      imageBatch.current = controller
      setCurrentPhase(batch, 'validating')
      void processImageFilesSequentially(files, {
        signal: controller.signal,
        onPhase: next => setCurrentPhase(batch, next),
      }).then(processed => {
        if (controller.signal.aborted || batch !== generation.current) return
        setCurrentPhase(batch, 'submitting')
        let imageIndex = 0
        const accepted = nativeBatch
          ? props.addFiles?.(nativeBatch.map(file => isImageFile(file) ? processed[imageIndex++]! : file))
          : props.addImages?.(processed)
        if (!accepted) throw new Error('attachment submission was rejected')
        setCurrentPhase(batch, 'idle')
      }).catch(reason => {
        if (reason instanceof ImageProcessingError && reason.code === 'aborted') {
          setCurrentPhase(batch, 'idle')
          return
        }
        setCurrentPhase(batch, 'failed')
      }).finally(() => {
        if (imageBatch.current === controller) imageBatch.current = null
      })
    }

    const onDragEnter = (event: DragEvent): void => {
      if (event.target instanceof Element && event.target.closest('[data-dsh-panel-host], [data-aionui-explorer-col], [data-aionui-preview-col], [role="dialog"]')) return
      if (!hasAnyFileDrag(event.dataTransfer?.types)) return
      if ((props.addFiles && !hasFileDrag(event.dataTransfer?.types)) || isPureImageDrag(event.dataTransfer?.types, event.dataTransfer?.items)) {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      depth.current += 1
      setActive(true)
    }

    const onDragOver = (event: DragEvent): void => {
      if (event.target instanceof Element && event.target.closest('[data-dsh-panel-host], [data-aionui-explorer-col], [data-aionui-preview-col], [role="dialog"]')) return
      if (!hasAnyFileDrag(event.dataTransfer?.types)) return
      if ((props.addFiles && !hasFileDrag(event.dataTransfer?.types)) || isPureImageDrag(event.dataTransfer?.types, event.dataTransfer?.items)) {
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
      if ((props.addFiles && !hasFileDrag(event.dataTransfer?.types)) || isPureImageDrag(event.dataTransfer?.types, event.dataTransfer?.items)) {
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
      if (event.target instanceof Element && event.target.closest('[data-dsh-panel-host], [data-aionui-explorer-col], [data-aionui-preview-col], [role="dialog"]')) return
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

      const items = Array.from(event.dataTransfer.items ?? [])
      if (items.some(item => item.webkitGetAsEntry?.()?.isDirectory)) {
        event.preventDefault(); event.stopImmediatePropagation(); reset()
        window.dispatchEvent(new Event('dragend'))
        setPhase('directory')
        return
      }
      setPhase('idle')
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

      // Native DSH owns all ordinary picks, including mixed image/document drops.
      if (!anyImageNeedsCompression && (props.addFiles || imageFiles.length > 0 && nonImageFiles.length === 0)) {
        reset()
        return
      }

      // Case B: Non-image files, mixed files, or oversized images that require auto-compression
      // Stop native handler from throwing "file too large" or "unsupported image" errors
      event.preventDefault()
      event.stopImmediatePropagation()
      reset()
      // The native attachment surface observed dragenter before this capture-phase
      // handler learned that the image needed preprocessing. It cannot observe the
      // stopped drop, so explicitly close every drag overlay before async work.
      window.dispatchEvent(new Event('dragend'))

      if (props.addFiles) {
        // Admit the complete batch once, in its original order, after compression.
        processImages(imageFiles, files)
        return
      }

      // Process images serially; a new batch or session teardown cancels stale work.
      processImages(imageFiles)

      // Format non-image files serially to bound FileReader memory.
      if (nonImageFiles.length > 0) {
        if (props.fileQueue) { props.fileQueue.add(nonImageFiles); return }
        void formatDroppedFilesSequentially(nonImageFiles).then((formatted) => {
          if (!mounted) return
          const textToInsert = formatted.filter((item) => item !== '').join('\n\n')
          if (textToInsert !== '') {
            props.insertPath(textToInsert)
          }
        }).catch(() => { if (mounted) setPhase('failed') })
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

      processImages(imageFiles)
    }

    const onDragEnd = (): void => reset()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || imageBatch.current === null) return
      event.preventDefault()
      imageBatch.current.abort()
    }

    document.addEventListener('dragenter', onDragEnter, true)
    document.addEventListener('dragover', onDragOver, true)
    document.addEventListener('dragleave', onDragLeave, true)
    document.addEventListener('drop', onDrop, true)
    window.addEventListener('dragend', onDragEnd, true)
    window.addEventListener('paste', onPaste, true)
    window.addEventListener('keydown', onKeyDown, true)

    return () => {
      mounted = false
      generation.current += 1
      imageBatch.current?.abort()
      imageBatch.current = null
      document.removeEventListener('dragenter', onDragEnter, true)
      document.removeEventListener('dragover', onDragOver, true)
      document.removeEventListener('dragleave', onDragLeave, true)
      document.removeEventListener('drop', onDrop, true)
      window.removeEventListener('dragend', onDragEnd, true)
      window.removeEventListener('paste', onPaste, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [props.insertPath, props.addImages, props.addFiles, props.fileQueue])

  const statusText = phase === 'idle'
    ? t('explorer.drag.dropHint')
    : phase === 'directory' ? t('attachment.directory')
    : phase === 'failed'
      ? t('explorer.drag.imageFailed')
      : phase === 'submitting'
        ? t('explorer.drag.imageSubmitting')
        : t('explorer.drag.imageProcessing')
  const visible = active || phase !== 'idle'

  return (
    <><div
      className={visible ? `${dragCss.strip} ${dragCss.stripActive}` : dragCss.strip}
      data-testid="aionui-drag-inlay"
      data-phase={phase}
      aria-live="polite"
      aria-busy={phase !== 'idle' && phase !== 'failed' && phase !== 'directory'}
    >
      {visible ? <span className={dragCss.stripText}>{statusText}</span> : null}
    </div>
    {props.fileQueue && <FileAttachmentRail queue={props.fileQueue} nativeUploads={!!props.addFiles} addImages={files => {
      if (!files.length) return
      const controller = new AbortController()
      imageBatch.current?.abort(); imageBatch.current = controller
      const batch = ++generation.current
      setPhase('validating')
      void processImageFilesSequentially(files, { signal: controller.signal }).then(images => {
        if (controller.signal.aborted || batch !== generation.current) return
        if (!props.addImages?.(images)) throw new Error('image admission failed')
        setPhase('idle')
      }).catch(() => { if (batch === generation.current) setPhase('failed') })
    }} />}</>
  )
}
