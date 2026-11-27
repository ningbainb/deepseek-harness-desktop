export declare function findMermaidBlock(html: string): {
    markup: string;
    text: string;
} | undefined;
export declare function findInlineSvg(html: string): string | undefined;
export declare function sanitizeExportSvg(source: string): string;
export declare function renderOfflineMermaid(text: string, dark: boolean): Promise<string>;
export declare function downloadDiagram(fileName: string, blob: Blob): void;
export declare function rasterizeDiagram(svg: Blob): Promise<Blob>;
//# sourceMappingURL=diagram-export.d.ts.map