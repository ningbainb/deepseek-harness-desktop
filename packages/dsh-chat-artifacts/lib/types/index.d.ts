/**
 * Host half of Chat Artifact.
 *
 * The tool validates and records a self-contained HTML fragment. The durable
 * model-facing result is a short text summary; the full artifact is carried by
 * presentationMeta so the browser renderer can recover it on live and replay
 * paths without putting HTML into the assistant's normal markdown stream.
 *
 * @module @ningbainb/dsh-chat-artifacts
 */
import type { Context } from '@deepseek-ai/cordis';
import type { GenericCallView } from '@deepseek-ai/dsh-tools';
import { type ArtifactRecord, type RenderArtifactArgs } from './core/types.ts';
export { ARTIFACT_DEFAULT_HEIGHT, ARTIFACT_KINDS, ARTIFACT_MAX_BYTES, ARTIFACT_MAX_HEIGHT, ARTIFACT_MIN_HEIGHT, ArtifactValidationError, artifactSourceFromMeta, isArtifactRecord, normalizeArtifactArgs, utf8ByteLength, validateArtifactHtml, } from './core/types.ts';
export type { ArtifactKind, ArtifactRecord, NormalizedArtifactArgs, RenderArtifactArgs, } from './core/types.ts';
export { CHAT_ARTIFACTS_PLUGIN_ID, CHAT_ARTIFACTS_TOOL_NAME } from './invariant.ts';
export declare const name = "chat-artifacts";
export declare const inject: string[];
/** Order inside the model tool-guidance band. */
export declare const CHAT_ARTIFACTS_SECTION_ORDER = 230;
/**
 * Model-facing guidance. It intentionally describes when not to use the tool:
 * visual output should reduce cognitive load, not decorate every response.
 */
export declare const CHAT_ARTIFACTS_GUIDANCE: string;
/** Build the canonical value persisted in presentationMeta. */
export declare function createArtifactRecord(args: RenderArtifactArgs): ArtifactRecord;
/** Pending row intent for the official generic fallback. */
export declare function renderArtifactCallView(args: Pick<RenderArtifactArgs, 'title' | 'kind'>): GenericCallView;
/** Register the model tool and the automatic-use guidance section. */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map