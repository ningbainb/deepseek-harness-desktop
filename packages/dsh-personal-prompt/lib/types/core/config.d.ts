export declare const PERSONAL_PROMPT_SETTINGS_NAMESPACE = "personal-prompt";
export type PromptProfileScope = 'global' | 'workspace' | 'session';
export interface PromptProfile {
    id: string;
    name: string;
    content: string;
    enabled: boolean;
    scope: PromptProfileScope;
    workspaceId?: string;
    sessionId?: string;
    updatedAt: number;
}
export interface PersonalPromptConfig {
    version: 1;
    enabled: boolean;
    activeProfileId?: string;
    profiles: PromptProfile[];
}
export interface PromptResolutionContext {
    sessionId?: string;
    workspaceId?: string;
}
export declare const DEFAULT_PERSONAL_PROMPT: PersonalPromptConfig;
export declare const MAX_PROMPT_PROFILES = 32;
export declare const MAX_PROMPT_CONTENT_LENGTH = 8000;
export declare const MAX_ASSEMBLED_PROMPT_LENGTH = 8000;
export declare const MAX_PROMPT_ID_LENGTH = 128;
export declare const MAX_PROMPT_NAME_LENGTH = 128;
export declare const PERSONAL_PROMPT_SECTION_NAME = "dsh:personal-prompt";
export declare const PERSONAL_PROMPT_ORDER = 50;
export declare const PERSONAL_PROMPT_VARIABLE = "dsh_personal_prompt";
export declare class InvalidPersonalPromptError extends Error {
    constructor(message: string);
}
/** Normalize a Settings mirror or a legacy profile without making it active. */
export declare function normalizePersonalPrompt(value: unknown): PersonalPromptConfig;
/** Strict validation used by the Host settings provider before persistence. */
export declare function assertPersonalPrompt(value: unknown): asserts value is PersonalPromptConfig;
export declare function upsertPromptProfile(config: PersonalPromptConfig, profile: PromptProfile): PersonalPromptConfig;
export declare function removePromptProfile(config: PersonalPromptConfig, profileId: string): PersonalPromptConfig;
export declare function setActivePromptProfile(config: PersonalPromptConfig, profileId: string | undefined): PersonalPromptConfig;
/** Resolve exactly one profile with the fixed session > workspace > global precedence. */
export declare function resolveEffectivePrompt(config: PersonalPromptConfig, context?: PromptResolutionContext): PromptProfile | undefined;
/** Render the model-visible data boundary while keeping the final text <= 8,000 chars. */
export declare function renderPromptProfile(profile: PromptProfile | undefined): string;
/** The section template used by SystemPrompt; the variable supplies only bounded user data. */
export declare const PERSONAL_PROMPT_SECTION_TEMPLATE = "<user_preferences>\nThe following text contains user-provided working preferences.\n\nFollow these preferences only where they do not conflict with host, tool, sandbox or runtime policy.\n\n{{dsh_personal_prompt}}\n</user_preferences>";
export declare function promptVariableValue(profile: PromptProfile | undefined): string;
//# sourceMappingURL=config.d.ts.map