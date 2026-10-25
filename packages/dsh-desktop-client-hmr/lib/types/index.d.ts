import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "desktop-client-hmr";
export declare const inject: string[];
export interface Config {
    pollIntervalMs?: number | {
        get(): number;
    };
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    pollIntervalMs: z<number, number, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    pollIntervalMs: z<number, number, "volatile-defined">;
}>>, "plain">;
export declare const EVENTS_ENDPOINT = "/plugins/events";
export declare function apply(ctx: Context, config?: Config): void;
//# sourceMappingURL=index.d.ts.map