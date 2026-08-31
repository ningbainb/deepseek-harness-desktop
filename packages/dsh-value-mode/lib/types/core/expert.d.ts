import type { Context } from '@deepseek-ai/cordis';
import { type GenericCallView, type ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { ValueModeConfig } from './config.ts';
export interface ConsultExpertArgs {
    purpose: 'architecture' | 'plan' | 'debug' | 'review';
    question: string;
    context: string;
}
export interface ConsultExpertOutput {
    success: boolean;
    purpose: string;
    summary: string;
    recommendation: string;
    rootCause?: string;
    risks?: string;
    verification?: string;
    reviewFindings?: string;
    model: string;
    fallbackNote?: string;
}
export declare function consultExpertCallView(args: ConsultExpertArgs): GenericCallView;
export declare function parseExpertResponse(rawText: string, purpose: string): Omit<ConsultExpertOutput, 'success' | 'purpose' | 'model'>;
export declare function createConsultExpertTool(ctx: Context, getConfig: () => ValueModeConfig): ToolDefinition;
//# sourceMappingURL=expert.d.ts.map