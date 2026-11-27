import type { Context } from '@deepseek-ai/cordis';
import type { GenerateOptions, StreamChunk, ToolSchema } from '@deepseek-ai/dsh-llm';
/**
 * A bounded, argument-free account of a compatibility decision. The raw tool
 * payload can contain source code, paths, or credentials, so it must never be
 * copied into Desktop's diagnostic log.
 */
export interface ToolCallNormalizationDiagnostic {
    readonly outcome: 'normalized' | 'rejected';
    readonly reason: ToolCallNormalizationReason;
    readonly provider: string;
    readonly model: string;
    readonly tool: string;
    readonly callId: string;
    readonly source: 'block-end' | 'stream-delta';
}
/** Reasons an exact one-key `arguments` envelope was accepted or left intact. */
export type ToolCallNormalizationReason = 'schema-validated-envelope' | 'redundant-full-access-escalation' | 'unknown-tool' | 'duplicate-tool-schema' | 'unsupported-tool-schema' | 'nested-arguments-not-object' | 'nested-arguments-invalid' | 'ambiguous-outer-and-inner-valid';
export interface ToolCallArgumentNormalization {
    readonly arguments: string;
    readonly diagnostic?: Omit<ToolCallNormalizationDiagnostic, 'provider' | 'model' | 'tool' | 'callId' | 'source'>;
}
/**
 * Recover the one transport defect reported by Desktop users without changing
 * the tool contract: `{ "arguments": { ...valid tool arguments... } }`.
 *
 * A field called `arguments` can be legitimate for a third-party tool. We
 * therefore unwrap only when all of these hold:
 *
 * 1. The outer value is a JSON object with exactly one own `arguments` key.
 * 2. Its nested value is an object (one level only; no recursive guessing).
 * 3. The currently advertised schema accepts the nested value.
 * 4. The same schema rejects the original outer value.
 *
 * Conditions 3 and 4 make a valid-but-ambiguous tool contract fail closed.
 * Every other input is handed to the ordinary DSH schema validator unchanged.
 */
export declare function normalizeWrappedToolCallArguments(raw: string, tool: ToolSchema | undefined): ToolCallArgumentNormalization;
/**
 * Desktop's trusted Runtime already runs with the permission selected by the
 * host. Some models still copy an escalation field into shell calls. When the
 * current mode is `danger-full-access`, every declared sandbox target is equal
 * or narrower and therefore cannot be an escalation. Remove only that one
 * optional field, and only when the advertised tool schema still accepts the
 * resulting arguments. All commands, paths, and other options remain exact.
 */
export declare function normalizeRedundantSandboxEscalation(raw: string, tool: ToolSchema | undefined, currentMode: string | undefined): ToolCallArgumentNormalization;
/**
 * Normalize model tool-call payloads before dsh-agent-loop parses raw JSON.
 * Complete `block-end` calls are transformed in place. Delta-only calls are
 * held until they close for envelope recovery, while canonical Artifact
 * arguments stream live. Non-recovered deltas are preserved byte-for-byte.
 */
export declare function normalizeToolCallArgumentStream(options: GenerateOptions, source: AsyncIterable<StreamChunk>, diagnostic?: (diagnostic: ToolCallNormalizationDiagnostic) => void, permissionMode?: string | undefined): AsyncGenerator<StreamChunk>;
/** Install the Desktop-only stream compatibility hook through the public SDK. */
export declare function installToolCallArgumentNormalization(ctx: Context): void;
