/**
 * Sidebar footer-seat wrapper for the remote-control entry.
 *
 * Current dsh web shells declare `sidebar.footer.action` (the seat beside the
 * settings trigger) instead of the legacy `sidebar.remote` seat this plugin
 * was written against. The renderer supplies the same global standard hooks
 * (`useWorkspaces`/`useSessions`) to both root-scoped seats, so this wrapper
 * keeps the current workspace in the pair issue payload just like the legacy
 * entry.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { RemoteEntry, type RemoteEntryServices } from './RemoteEntry.tsx'

/** Entry props: footer owner props plus the renderer's global standard kit. */
export type FooterRemoteEntryProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'remote'> & RemoteEntryServices

/**
 * Render the remote-control trigger + pairing panel from the footer seat.
 * @param props - composed slot props (footer seat subset).
 * @returns the entry element tree.
 */
export function FooterRemoteEntry(props: FooterRemoteEntryProps) {
  return <RemoteEntry {...props} />
}

