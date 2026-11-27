declare const THEME_TOKENS: {
    readonly '--ui-bg': readonly [readonly ["--dsw-bg", "--dsw-alias-bg-base"], "#ffffff", "#17191d"];
    readonly '--ui-surface': readonly [readonly ["--dsw-surface", "--dsw-alias-bg-layer-1"], "#f8fafc", "#22262c"];
    readonly '--ui-surface-elevated': readonly [readonly ["--dsw-surface-elevated", "--dsw-alias-bg-layer-2"], "#ffffff", "#2c3139"];
    readonly '--ui-text': readonly [readonly ["--dsw-text", "--dsw-alias-label-primary"], "#1f2329", "#f2f4f7"];
    readonly '--ui-text-muted': readonly [readonly ["--dsw-text-muted", "--dsw-alias-label-secondary"], "#667085", "#98a2b3"];
    readonly '--ui-border': readonly [readonly ["--dsw-border-subtle", "--dsw-alias-border-l1"], "#dce1e8", "#3e4652"];
    readonly '--ui-accent': readonly [readonly ["--dsw-accent", "--dsw-alias-brand-primary"], "#4f46e5", "#a5b4fc"];
    readonly '--ui-accent-soft': readonly [readonly ["--dsw-accent-soft", "--dsw-alias-bg-multi-select"], "#e0e7ff", "#303b60"];
    readonly '--ui-success': readonly [readonly ["--dsw-success", "--dsw-alias-state-success-primary"], "#15803d", "#86efac"];
    readonly '--ui-warning': readonly [readonly ["--dsw-warning", "--dsw-alias-state-warning-primary"], "#a16207", "#fde68a"];
    readonly '--ui-danger': readonly [readonly ["--dsw-danger", "--dsw-alias-state-error-primary"], "#b91c1c", "#fca5a5"];
    readonly '--ui-radius': readonly [readonly ["--dsw-radius-md", "--dsw-radius-lg"], "10px", "10px"];
};
type ThemeToken = keyof typeof THEME_TOKENS;
type StyleReader = Pick<CSSStyleDeclaration, 'getPropertyValue'>;
export type ArtifactTheme = {
    scheme: 'light' | 'dark';
    tokens: Readonly<Record<ThemeToken, string>>;
};
export declare function readArtifactTheme(style: StyleReader | undefined, dark: boolean): ArtifactTheme;
export declare function artifactThemeCss(theme: ArtifactTheme): string;
export declare const ARTIFACT_DEFAULT_THEME_CSS: string;
export declare function useArtifactTheme(active: boolean): ArtifactTheme;
export {};
//# sourceMappingURL=theme-bridge.d.ts.map