import type { Context } from '@deepseek-ai/cordis';
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection';
import { type PluginAssessment } from './core/contracts.ts';
export declare const name = "release-plugin-adapter";
export declare const inject: string[];
/** The existing Connection carrier applies owner authentication before dispatch. */
export declare function makeStatusRoute(snapshot: () => PluginAssessment[]): ConnectionFetchRoute;
/** Supplement vendor rows; never duplicate their tools, projections, routes, or client factories. */
export declare function apply(ctx: Context): void;
