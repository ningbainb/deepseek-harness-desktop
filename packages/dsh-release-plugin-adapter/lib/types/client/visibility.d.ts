export declare const VISIBILITY_KEY = "dsh-release-plugin-adapter.dafeiyu-visible";
export declare const VISIBILITY_EVENT = "dsh-dafeiyu-visibility";
type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;
type AttributeTarget = Pick<Element, 'getAttribute' | 'setAttribute' | 'removeAttribute'>;
export declare function companionVisibleInDocument(visible: boolean, search: string): boolean;
/** The patched community widget owns its resources; the adapter only signals policy. */
export declare function notifyCompanionLifecycle(target: Pick<Window, 'dispatchEvent'>, visible: boolean): void;
export declare function readVisible(storage: Reader): boolean;
/** False means the current page can change but persistence was denied. */
export declare function writeVisible(storage: Writer, visible: boolean): boolean;
/** Own exactly one attribute; the CSS targets only the vendor's dafeiyu root. */
export declare function installVisibility(target: AttributeTarget, initial: boolean): {
    set: (visible: boolean) => void;
    dispose(): void;
};
export {};
