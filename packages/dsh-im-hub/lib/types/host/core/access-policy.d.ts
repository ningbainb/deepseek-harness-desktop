import type { ChannelAccessPolicy } from '../../core/settings.ts';
import type { InboundMessage } from './types.ts';
export interface AccessEvaluation {
    allowed: boolean;
    reason?: 'sender-not-allowed' | 'group-not-allowed' | 'mention-required';
}
export declare function evaluateAccess(message: InboundMessage, policy: ChannelAccessPolicy): AccessEvaluation;
export declare function isApprovalAuthorized(senderId: string, policy: ChannelAccessPolicy): boolean;
//# sourceMappingURL=access-policy.d.ts.map