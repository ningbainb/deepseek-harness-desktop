/** Recognize complete, quote-aware HTML tags and their attributes without a DOM. */
export declare const HTML_TAG: RegExp;
export declare const HTML_ATTRIBUTE: RegExp;
export declare const ARTIFACT_URL_ATTRIBUTE: RegExp;
export declare function isArtifactResourceUrl(value: string): boolean;
export declare function isArtifactAttributeUrl(name: string, value: string): boolean;
/** Relative media in older static records remains blocked by the frame's resource CSP. */
export declare function isLegacyRelativeMediaUrl(tag: string, attribute: string, value: string): boolean;
//# sourceMappingURL=html.d.ts.map