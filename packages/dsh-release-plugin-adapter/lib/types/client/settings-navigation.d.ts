type Owner = '@local/dsh-prompt-pilot' | 'dsh-builtin-browser';
interface NavigationTarget {
    location: {
        search: string;
    };
    dispatchEvent(event: Event): boolean;
    dshDesktop?: {
        selectDockSetting?(id: string, owner: string): Promise<unknown>;
    };
}
/** Prefer Dock document navigation, then use the existing narrow Desktop contract. */
export declare function openPluginSettings(owner: Owner, target: NavigationTarget): Promise<void>;
export {};
