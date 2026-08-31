/**
 * Structural validation for a bundled `agent.cordis.yml`.
 *
 * Deliberately dependency-free: it parses only the flat row metadata the sync
 * and the dsh agent-presets loader rely on. Every top-level row is written as
 * `- id: <id>` at column zero, with the `name`/`group`/`disabled` keys at two
 * spaces of indentation. Nested `config:` and `isolate:` bodies are opaque to
 * this validator — the dsh loader checks their semantics.
 *
 * Returns the list of problems found; an empty array means the document is
 * structurally valid.
 */
/**
 * Validate the structural contract of an `agent.cordis.yml` document.
 * @param text - the raw YAML document text.
 * @returns a list of human-readable problems; empty means valid.
 */
export declare function validateAgentCordis(text: string): string[];
//# sourceMappingURL=preset-schema.d.ts.map