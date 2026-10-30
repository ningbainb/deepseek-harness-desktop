export declare const PLUGIN_IDS: readonly ["prompt-pilot", "dafeiyu-pet", "builtin-browser"];
export type PluginId = typeof PLUGIN_IDS[number];
export declare const STATUS_PATH = "/api/desktop-release-plugins";
export declare const REQUIREMENTS: Record<PluginId, readonly string[]>;
export interface PluginAssessment {
    id: PluginId;
    status: 'waiting' | 'contracts-present';
    missing: string[];
}
/** Read capability shape only: never call a model, tool, credential or session method. */
export declare function assessPlugin(id: PluginId, services: Record<string, unknown>): PluginAssessment;
