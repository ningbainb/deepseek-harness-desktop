import { defineTool } from '@deepseek-ai/dsh-tools';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { isCompleteModelRoute, isEffectivelyActive, resolveEffectiveConfig, resolveResolvedConfig, resolveSessionConfig } from "./config.js";
import { buildExpertSystemPrompt } from "./policy.js";
import { valueModeState } from "./state.js";
function readDefaultExpert(ctx) {
    const service = ctx.agentDefaultModel;
    try {
        const selection = service?.currentSelection?.();
        return isCompleteModelRoute(selection) ? { ...selection } : undefined;
    }
    catch {
        return undefined;
    }
}
export function consultExpertCallView(args) {
    const purposeLabels = {
        architecture: '架构分析 (Architecture)',
        plan: '方案规划 (Plan)',
        debug: '疑难排查 (Debug)',
        review: '代码审查 (Review)',
    };
    return {
        card: 'generic',
        title: `兼容专家咨询 · ${purposeLabels[args.purpose] || args.purpose}`,
        kind: 'read',
        rawInput: args,
    };
}
export function parseExpertResponse(rawText, purpose) {
    const clean = rawText.trim();
    if (!clean) {
        return {
            summary: '专家未返回有效文本',
            recommendation: '请由主力模型继续尝试或检查专家模型配置。',
        };
    }
    // Extract common sections if structured markdown headings exist
    const rootCauseMatch = clean.match(/(?:###?\s*(?:Root Cause|根因|原因分析|Problem Analysis)[\s\S]*?)(?=###?|$)/i);
    const recommendationMatch = clean.match(/(?:###?\s*(?:Recommendations?|建议|解决方案|Proposed Solution)[\s\S]*?)(?=###?|$)/i);
    const risksMatch = clean.match(/(?:###?\s*(?:Risks?|风险|注意事项|Tradeoffs?)[\s\S]*?)(?=###?|$)/i);
    const verificationMatch = clean.match(/(?:###?\s*(?:Verification|验证|测试建议|Validation)[\s\S]*?)(?=###?|$)/i);
    const reviewMatch = clean.match(/(?:###?\s*(?:Review Findings|审查意见|审查结论|Code Review)[\s\S]*?)(?=###?|$)/i);
    const summary = clean.length > 500 ? clean.slice(0, 500) + '...' : clean;
    return {
        summary,
        recommendation: recommendationMatch ? recommendationMatch[0].trim() : clean,
        ...(rootCauseMatch ? { rootCause: rootCauseMatch[0].trim() } : {}),
        ...(risksMatch ? { risks: risksMatch[0].trim() } : {}),
        ...(verificationMatch ? { verification: verificationMatch[0].trim() } : {}),
        ...(reviewMatch || purpose === 'review' ? { reviewFindings: reviewMatch ? reviewMatch[0].trim() : clean } : {}),
    };
}
export function createConsultExpertTool(ctx, getConfig) {
    return defineTool({
        name: 'consult_expert',
        description: 'Legacy compatibility tool for integrations that still request a bounded expert consultation. ' +
            'Normal Value Mode routing already uses the expert model as the top-level controller and the executor model ' +
            'for delegated child agents; do not call this tool for ordinary routing. The consultant does not execute tools. ' +
            'Provide a concise, bounded brief of facts, critical code snippets, and specific questions in `context`.',
        parameters: {
            purpose: {
                type: 'string',
                required: true,
                enum: ['architecture', 'plan', 'debug', 'review'],
                description: 'The explicit purpose of the expert consultation: architecture, plan, debug, or review.',
            },
            question: {
                type: 'string',
                required: true,
                description: 'The exact question or analytical problem for the expert to solve.',
            },
            context: {
                type: 'string',
                required: true,
                description: 'A compact Expert Brief containing only relevant facts, key errors, constraints, and necessary code snippets (bounded size).',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    success: { type: 'boolean', required: true },
                    purpose: { type: 'string', required: true },
                    summary: { type: 'string', required: true },
                    recommendation: { type: 'string', required: true },
                    rootCause: { type: 'string' },
                    risks: { type: 'string' },
                    verification: { type: 'string' },
                    reviewFindings: { type: 'string' },
                    model: { type: 'string', required: true },
                    fallbackNote: { type: 'string' },
                },
            },
            render: (_args, value) => {
                const val = value;
                const lines = [`**兼容专家咨询结论 (${val.model})**`, ''];
                if (val.fallbackNote) {
                    lines.push(`> 提示: ${val.fallbackNote}`, '');
                }
                lines.push(val.summary);
                if (val.rootCause) {
                    lines.push('', '---', '**根因分析:**', val.rootCause);
                }
                if (val.recommendation && val.recommendation !== val.summary) {
                    lines.push('', '---', '**方案建议:**', val.recommendation);
                }
                if (val.risks) {
                    lines.push('', '---', '**风险评估:**', val.risks);
                }
                if (val.verification) {
                    lines.push('', '---', '**验证建议:**', val.verification);
                }
                return [{ type: 'text', text: lines.join('\n') }];
            },
        },
        presentCall: consultExpertCallView,
        async execute(rawArgs, exec) {
            const args = rawArgs;
            const globalConfig = getConfig();
            const sessionId = exec?.sessionId || 'default';
            const effectiveConfig = resolveEffectiveConfig(resolveSessionConfig(globalConfig, valueModeState.getSessionOverride(sessionId)), readDefaultExpert(ctx));
            const resolved = resolveResolvedConfig(effectiveConfig);
            // Guardrail 1: Check if Value Mode is effectively active
            if (!isEffectivelyActive(effectiveConfig)) {
                return {
                    success: false,
                    purpose: args.purpose,
                    summary: '性价比模式未开启或专家模型未配置完整。',
                    recommendation: '请由主力模型直接进行分析与实现。',
                    model: 'none',
                    fallbackNote: 'Value Mode is not active or missing expert configuration.',
                };
            }
            // Guardrail 2: Hard recursion depth limit
            const currentDepth = valueModeState.getDepth(sessionId);
            if (currentDepth >= resolved.maxDepth) {
                return {
                    success: false,
                    purpose: args.purpose,
                    summary: '已达到专家调用最大递归深度，禁止嵌套调用专家。',
                    recommendation: '由当前模型直接执行，避免循环递归调用。',
                    model: resolved.expert.model || 'expert',
                    fallbackNote: `Maximum consultation depth (${resolved.maxDepth}) reached.`,
                };
            }
            // Guardrail 3: Hard context bound
            let boundedContext = args.context ?? '';
            if (boundedContext.length > resolved.maxContextChars) {
                boundedContext =
                    boundedContext.slice(0, resolved.maxContextChars) +
                        `\n\n[Context truncated: exceeded maxContextChars limit of ${resolved.maxContextChars}]`;
            }
            const expertProvider = resolved.expert.provider;
            const expertModel = resolved.expert.model;
            const systemPrompt = buildExpertSystemPrompt(args.purpose);
            const userPrompt = `[Expert Consultation Request]\n` +
                `Purpose: ${args.purpose}\n` +
                `Question: ${args.question}\n\n` +
                `[Expert Brief Context]\n` +
                `${boundedContext}`;
            const userMessage = createUserMessage({
                content: [{ type: 'text', text: userPrompt }],
                source: { kind: 'user' },
            });
            const generateOptions = {
                provider: expertProvider,
                model: expertModel,
                system: systemPrompt,
                messages: [userMessage],
                maxTokens: resolved.maxOutputTokens,
                signal: exec.signal,
            };
            valueModeState.enterExpertCall(sessionId);
            const startTime = Date.now();
            let fullText = '';
            let usage;
            try {
                const stream = ctx.llm.stream(generateOptions);
                for await (const chunk of stream) {
                    if (chunk.type === 'text-delta') {
                        fullText += chunk.text;
                    }
                    else if (chunk.type === 'usage') {
                        usage = chunk.usage;
                    }
                }
                const durationMs = Date.now() - startTime;
                valueModeState.recordExpertCall(sessionId, undefined, usage);
                const parsed = parseExpertResponse(fullText, args.purpose);
                // Record into history
                valueModeState.recordConsultation(sessionId, {
                    purpose: args.purpose,
                    question: args.question,
                    summary: parsed.summary,
                    tokens: {
                        inputTokens: usage?.inputTokens ?? 0,
                        outputTokens: usage?.outputTokens ?? 0,
                    },
                    durationMs,
                });
                return {
                    success: true,
                    purpose: args.purpose,
                    ...parsed,
                    model: `${expertProvider}/${expertModel}`,
                };
            }
            catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                return {
                    success: false,
                    purpose: args.purpose,
                    summary: `专家模型咨询失败: ${errorMessage}`,
                    recommendation: '专家服务暂时不可用，本次请由主力模型直接根据现有上下文继续完成任务。',
                    model: `${expertProvider}/${expertModel}`,
                    fallbackNote: `Expert call failed: ${errorMessage}. Falling back to primary executor.`,
                };
            }
            finally {
                valueModeState.exitExpertCall(sessionId);
            }
        },
    });
}
