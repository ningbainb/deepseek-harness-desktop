import type { MemoryLocaleKey } from './locales.ts';
type Translate = (key: MemoryLocaleKey) => string;
export declare function openQuickSearch(): void;
export declare function toggleQuickSearch(): void;
export declare function QuickSearchDialog({ t, onOpenSession }: {
    t: Translate;
    onOpenSession?: (sessionId: string) => void;
}): import("react").JSX.Element | null;
export declare function QuickSearchSidebarEntry({ wide, t, onOpenSession }: {
    wide: boolean;
    t: Translate;
    onOpenSession?: (sessionId: string) => void;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=QuickSearchDialog.d.ts.map