import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
import { type MemoryRequestContext, type MemoryService } from './core/service.ts';
import { toPublicMemoryItem } from './core/schema.ts';
export interface MemoryToolOptions {
    enabled: () => boolean;
    contextForSession?: (session: Session) => MemoryRequestContext | undefined;
    eventsForSession?: (session: Session) => Promise<readonly SessionEvent[]>;
}
/** Model-facing search/suggestion tool; it has no direct persistence operation. */
export declare function createMemoryTool(service: MemoryService, options: MemoryToolOptions): import("@deepseek-ai/dsh-tools").ToolDefinition;
export { toPublicMemoryItem };
//# sourceMappingURL=tools.d.ts.map