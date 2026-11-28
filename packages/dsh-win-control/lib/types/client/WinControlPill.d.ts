import { type WinControlStateResponse } from './api.ts';
import type { WinControlLocaleKey } from './locales.ts';
export interface WinControlPillProps {
    sessionId?: string;
    t: (key: WinControlLocaleKey) => string;
}
export interface WinControlMenuOptionProps {
    sessionId?: string;
    locked?: boolean;
    t: (key: WinControlLocaleKey) => string;
}
export declare function shouldShowWinControlPill(state: Pick<WinControlStateResponse, 'bridgedToolCount' | 'sessionGranted'> | null): boolean;
export declare function shouldShowWinControlMenuOption(state: Pick<WinControlStateResponse, 'bridgedToolCount'> | null): boolean;
export declare function WinControlPill({ sessionId, t }: WinControlPillProps): import("react").JSX.Element | null;
export declare function WinControlMenuOption({ sessionId, locked, t }: WinControlMenuOptionProps): import("react").JSX.Element | null;
//# sourceMappingURL=WinControlPill.d.ts.map