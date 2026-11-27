import type { MemoryLocaleKey } from './locales.ts';
type Translate = (key: MemoryLocaleKey) => string;
export declare function LocalSearchPanel({ t, onSuggest, onOpenSession }: {
    t: Translate;
    onSuggest: (sessionId: string) => void;
    onOpenSession?: (sessionId: string) => void;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=LocalSearchPanel.d.ts.map