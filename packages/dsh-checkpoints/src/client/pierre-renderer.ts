import { FileDiff, parsePatchFiles } from '@pierre/diffs'

export interface CheckpointRenderOptions {
  patch: string
  mode: 'split' | 'unified'
  dark: boolean
  ready: () => void
}

export function mountCheckpointDiff(container: HTMLElement, { patch, mode, dark, ready }: CheckpointRenderOptions): () => void {
  const parsed = parsePatchFiles(patch, undefined, true)
  if (parsed.length !== 1 || parsed[0].files.length !== 1) throw new Error('Expected a single-file patch')
  const fileDiff = parsed[0].files[0]
  const renderer = new FileDiff({
    diffStyle: mode,
    themeType: dark ? 'dark' : 'light',
    disableFileHeader: true,
    hunkSeparators: 'simple',
    lineDiffType: 'none',
    tokenizeMaxLineLength: 1600,
    tokenizeMaxLength: 200_000,
    disableErrorHandling: true,
    onPostRender(node, _, phase) {
      if (phase !== 'unmount' && node.shadowRoot?.querySelector('pre')) ready()
    },
  })
  const dispose = () => {
    renderer.cleanUp()
    container.replaceChildren()
  }
  try {
    renderer.render({ containerWrapper: container, fileDiff })
    return dispose
  } catch (error) {
    dispose()
    throw error
  }
}
