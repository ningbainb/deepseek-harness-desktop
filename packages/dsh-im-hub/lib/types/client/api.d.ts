import type { ChannelId, ChannelStatusSnapshot, DiagnosticEvent, ImHubSettings } from '../core/settings.ts';
export interface ImHubStateResponse {
    settings: ImHubSettings;
    channels: Record<ChannelId, ChannelStatusSnapshot>;
    events: DiagnosticEvent[];
    pendingApprovals: number;
    webhookEndpoints: {
        wecom: string;
        webhook: string;
    };
}
export declare function fetchImHubState(): Promise<ImHubStateResponse>;
export declare function saveImHubSettings(settings: ImHubSettings): Promise<{
    settings: ImHubSettings;
    problems: string[];
}>;
export declare function testImHubChannel(channel: ChannelId): Promise<{
    ok: boolean;
    detail: string;
}>;
export declare function restartImHubChannel(channel: ChannelId): Promise<{
    status: ChannelStatusSnapshot;
}>;
//# sourceMappingURL=api.d.ts.map