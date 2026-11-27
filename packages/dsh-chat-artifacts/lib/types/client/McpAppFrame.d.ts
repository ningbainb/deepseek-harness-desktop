import type { PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { type McpAppDescriptor } from '../core/mcp-apps.ts';
type Translate = TranslateNS<'chat-artifacts'>;
type InputActions = PropsRuntime<'conversation.input.left'>['inputActions'];
export declare function McpAppCard({ app, t, inputActions }: {
    app: McpAppDescriptor;
    t: Translate;
    inputActions?: InputActions;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=McpAppFrame.d.ts.map