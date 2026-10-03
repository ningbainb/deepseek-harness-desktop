export type AgentWslPermission = 'off' | 'ask' | 'allow';
/** Missing settings retain the original per-call approval. Corrupt settings fail closed. */
export declare function parseAgentWslPermission(raw?: string): AgentWslPermission;
export declare function currentAgentWslPermission(environment?: NodeJS.ProcessEnv): AgentWslPermission;
