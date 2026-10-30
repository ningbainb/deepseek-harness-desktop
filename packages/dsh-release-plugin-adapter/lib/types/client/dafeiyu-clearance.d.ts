export interface ClearanceRect {
    left: number;
    top: number;
    width: number;
    height: number;
}
export interface DafeiyuPosition extends ClearanceRect {
    minTop: number;
}
export type DafeiyuProjector = (position: DafeiyuPosition) => {
    left: number;
    top: number;
};
declare global {
    interface Window {
        __dshDafeiyuProjectPosition?: DafeiyuProjector;
    }
}
export declare const CLEARANCE_REFRESH = "dsh-dafeiyu-clearance-refresh";
/** Display coordinates only. Vendor anchors and persistence remain vendor-owned. */
export declare function projectDafeiyuPosition(position: DafeiyuPosition, viewport: ClearanceRect, obstacles: readonly ClearanceRect[]): {
    left: number;
    top: number;
};
/** One disposable observer lease. The vendor's render path reads cached geometry. */
export declare function installDafeiyuClearance(host: Window & typeof globalThis, document: Document): () => void;
