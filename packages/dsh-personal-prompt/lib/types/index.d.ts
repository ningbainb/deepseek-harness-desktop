import type { Context } from '@deepseek-ai/cordis';
import z from 'schemastery';
import { type PersonalPromptConfig, type PromptProfileScope } from './core/config.ts';
export declare const name = "personal-prompt";
export declare const inject: string[];
export * from './core/config.ts';
export declare const Config: z<PersonalPromptConfig>;
/** Register the owner-safe Personal Prompt section and variable. */
export declare function apply(ctx: Context, initialConfig?: PersonalPromptConfig): void;
export type { PromptProfileScope };
//# sourceMappingURL=index.d.ts.map