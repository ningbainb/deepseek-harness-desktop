import type { ValueModeConfig, ValueModeRole } from './config.ts';
export declare const VALUE_MODE_SECTION_NAME = "value-mode:guidance";
export declare const VALUE_MODE_SECTION_ORDER = 145;
export declare function buildSystemPromptGuidance(config: ValueModeConfig, options?: {
    role?: ValueModeRole;
}): string;
export declare function buildExpertSystemPrompt(purpose: string): string;
//# sourceMappingURL=policy.d.ts.map