/**
 * The mobile remote-control panel body: status card (state text + badge),
 * the QR code, the open-on-phone hint with the link text, and the three
 * actions (stop / refresh / copy). Pure presentation — all state and
 * actions arrive through props from the entry's behavior component.
 */
import clsx from 'clsx'
import { QRCodeSVG } from 'qrcode.react'
import {
  IconCloseOutlineMedium, IconCopyOutlineMedium, IconLinkOutlineMedium, IconRefreshOutlineMedium, IconStopFillMedium,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopAvailability, LocalLanGatewayStatus } from '@linxin666/dsh-desktop-client'
import type { PairingPhase } from '../pairing.ts'
import { formatClock, type TunnelStatusFrame } from './pair-api.ts'
import css from './remote.module.css'

/** The panel's view state, owned by the entry component. */
export type PanelState =
  | { kind: 'lan-required' }
  | { kind: 'loopback-required' }
  | { kind: 'unreachable' }
  | {
      kind: 'ready'
      url: string
      expiresAt: number
      expired: boolean
      phase: PairingPhase
      deviceCount: number
      onlineCount: number
      /** The LAN literal the current QR was built from. */
      address: string
      /** Every constructible LAN literal (interface order). */
      lanAddresses: string[]
      /** Whether this QR is built on the configured public (tunneled) base. */
      public: boolean
      /** The configured public (tunneled) base URL, when present. */
      publicBaseUrl?: string
      /** Auto-tunnel status, while the auto-tunnel feature is active. */
      tunnel?: TunnelStatusFrame
    }

/** Full panel props: copy + view state + actions. */
export interface RemotePanelProps {
  t: TranslateNS<'remote'>
  state: PanelState
  copied: boolean
  onClose(): void
  onStop(): void
  onRefresh(): void
  onCopy(): void
  /** Re-mint the QR against a different LAN address. */
  onPickAddress(address: string): void
  /** Re-mint the QR against the configured public (tunneled) base. */
  onPickPublic(): void
  lanGateway?: LocalLanGatewayStatus | DesktopAvailability
  lanGatewayBusy?: boolean
  selectedLanAddress?: string
  onSelectLanAddress?(address: string): void
  onEnableLan?(): void
  onDisableLan?(): void
}

/** Badge text + tone per phase (ready states only). */
function statusOf(
  t: TranslateNS<'remote'>,
  state: Extract<PanelState, { kind: 'ready' }>,
): { text: string; tone: 'waiting' | 'connected' | 'disconnected' | 'stopped' } {
  switch (state.phase) {
    case 'connected': return { text: t('status.connected', { n: state.onlineCount }), tone: 'connected' }
    case 'disconnected': return { text: t('status.disconnected'), tone: 'disconnected' }
    case 'stopped': return { text: t('status.stopped'), tone: 'stopped' }
    case 'lan-required': return { text: t('status.lanRequired'), tone: 'stopped' }
    case 'waiting': return { text: t('status.waiting'), tone: 'waiting' }
  }
}

/**
 * Render the pairing panel.
 * @param props - copy, state, and actions.
 * @returns the panel element tree.
 */
export function RemotePanel({
  t,
  state,
  copied,
  onClose,
  onStop,
  onRefresh,
  onCopy,
  onPickAddress,
  onPickPublic,
  lanGateway,
  lanGatewayBusy = false,
  selectedLanAddress,
  onSelectLanAddress = () => {},
  onEnableLan = () => {},
  onDisableLan = () => {},
}: RemotePanelProps) {
  const localGateway = lanGateway !== undefined && !('available' in lanGateway) ? lanGateway : undefined
  return (
    <div className={css.panel} role="dialog" aria-modal="true" aria-label={t('title')}>
      <div className={css.header}>
        <div className={css.heading}>
          <h2 className={css.title}>{t('title')}</h2>
          <p className={css.subtitle}>{t('subtitle')}</p>
        </div>
        <button type="button" className={css.close} aria-label={t('close.label')} onClick={onClose}>
          <IconCloseOutlineMedium size={14} />
        </button>
      </div>

      {state.kind === 'lan-required' ? (
        <div className={css.banner} role="alert">
          <p className={css.bannerTitle}>{t('status.lanRequired')}</p>
          <p className={css.bannerHint}>{t('status.lanRequiredHint')}</p>
          {localGateway !== undefined && localGateway.availableAddresses.length > 0 ? (
            <div className={css.lanSetup}>
              <label className={css.lanSetupLabel} htmlFor="dsh-local-lan-address">{t('lan.address')}</label>
              <select
                id="dsh-local-lan-address"
                className={css.lanSelect}
                value={selectedLanAddress ?? localGateway.availableAddresses[0]}
                disabled={lanGatewayBusy}
                onChange={event => { onSelectLanAddress(event.target.value) }}
              >
                {localGateway.availableAddresses.map(address => <option key={address} value={address}>{address}</option>)}
              </select>
              <button type="button" className={css.action} disabled={lanGatewayBusy} onClick={onEnableLan}>
                {t(lanGatewayBusy ? 'lan.enabling' : 'lan.enable')}
              </button>
              <p className={css.addressHint}>{t('lan.enableHint')}</p>
            </div>
          ) : localGateway !== undefined ? <p className={css.tunnelFailed}>{t('lan.noAddress')}</p> : null}
        </div>
      ) : state.kind === 'loopback-required' ? (
        <div className={css.banner} role="alert">
          <p className={css.bannerTitle}>{t('status.loopbackRequired')}</p>
          <p className={css.bannerHint}>{t('status.loopbackRequiredHint')}</p>
        </div>
      ) : state.kind === 'unreachable' ? (
        <div className={css.banner} role="alert">
          <p className={css.bannerTitle}>{t('status.unreachable')}</p>
          <p className={css.bannerHint}>{t('status.unreachableHint')}</p>
        </div>
      ) : (
        <>
          <div className={css.card}>
            <div className={css.cardHeader}>
              <span className={css.cardTitle}>{t('card.title')}</span>
              <span className={css.badges}>
                {state.public && <span className={clsx(css.badge, css.badgePublic)}>{t('public.badge')}</span>}
                <span className={clsx(css.badge, css[`badge-${statusOf(t, state).tone}`])}>
                  {statusOf(t, state).text}
                </span>
              </span>
            </div>
            <div className={css.qrWrap} data-testid="remote-qr">
              <QRCodeSVG value={state.url} size={184} level="M" marginSize={1} className={css.qr} />
            </div>
            {state.expired
              ? <p className={css.expired}>{t('pair.expired')}</p>
              : <p className={css.expiry}>{t('pair.expires', { time: formatClock(state.expiresAt) })}</p>}
          </div>

          <p className={css.hint}>{state.public ? t('pair.publicHint') : t('pair.hint')}</p>
          <p className={css.link} title={state.url}>{state.url}</p>
          {state.phase === 'stopped' && <p className={css.stoppedHint}>{t('stopped.hint')}</p>}
          {state.tunnel !== undefined && state.tunnel.state !== 'running' && (
            <p className={state.tunnel.state === 'failed' ? css.tunnelFailed : css.tunnelNote} role="status">
              {state.tunnel.state === 'failed'
                ? t('tunnel.failed', { error: state.tunnel.error ?? t('tunnel.unknownError') })
                : t('tunnel.starting')}
            </p>
          )}

          {(state.publicBaseUrl !== undefined || state.lanAddresses.length > 1) && (
            <fieldset className={css.addresses}>
              <legend>{t('address.label')}</legend>
              {state.publicBaseUrl !== undefined && (
                <label key="public" className={css.address}>
                  <input
                    type="radio"
                    name="lan-address"
                    aria-label={t('address.public')}
                    checked={state.public}
                    onChange={onPickPublic}
                  />
                  <span>{t('address.public')}</span>
                  <code className={css.addressValue}>{state.publicBaseUrl}</code>
                </label>
              )}
              {state.lanAddresses.map(address => (
                <label key={address} className={css.address}>
                  <input
                    type="radio"
                    name="lan-address"
                    aria-label={address}
                    checked={!state.public && address === state.address}
                    onChange={() => onPickAddress(address)}
                  />
                  <span>{t('address.lan')}</span>
                  <code className={css.addressValue}>{address}</code>
                </label>
              ))}
              <p className={css.addressHint}>{t('address.hint')}</p>
            </fieldset>
          )}

          <div className={css.actions}>
            <button type="button" className={css.action} onClick={onStop}>
              <IconStopFillMedium size={14} />
              {t('action.stop')}
            </button>
            <button type="button" className={css.action} onClick={onRefresh}>
              <IconRefreshOutlineMedium size={14} />
              {t('action.refresh')}
            </button>
            <button type="button" className={css.action} onClick={onCopy}>
              {copied ? <IconCopyOutlineMedium size={14} /> : <IconLinkOutlineMedium size={14} />}
              {copied ? t('action.copied') : t('action.copy')}
            </button>
            {localGateway?.enabled === true && (
              <button type="button" className={css.action} disabled={lanGatewayBusy} onClick={onDisableLan}>
                {t(lanGatewayBusy ? 'lan.disabling' : 'lan.disable')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
