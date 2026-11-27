import type { Edit } from '@ast-grep/napi';
import { type CodeSelection } from './code-files.ts';
type BuiltinLanguage = 'TypeScript' | 'Tsx' | 'JavaScript' | 'Html' | 'Css';
type AdditionalLanguage = 'c' | 'cpp' | 'csharp' | 'go' | 'java' | 'json' | 'python' | 'rust';
type Language = BuiltinLanguage | AdditionalLanguage;
type Position = {
    line: number;
    column: number;
    index: number;
};
export interface SyntaxNode {
    kind(): string;
    text(): string;
    range(): {
        start: Position;
        end: Position;
    };
    children(): SyntaxNode[];
    parent(): SyntaxNode | null;
    field(name: string): SyntaxNode | null;
    findAll(pattern: string | {
        rule: {
            kind: string;
        };
    }): SyntaxNode[];
    getMatch(name: string): SyntaxNode | null;
    getMultipleMatches(name: string): SyntaxNode[];
    replace(text: string): Edit;
    commitEdits(edits: Edit[]): string;
}
interface SyntaxApi {
    parse: (language: Language, source: string) => {
        root(): SyntaxNode;
    };
    supports(language: Language): boolean;
}
export declare function languageFor(path: string): Language | undefined;
export declare function isNativeAstAvailable(): Promise<boolean>;
export declare function loadSyntaxApi(): Promise<SyntaxApi | undefined>;
export interface OutlineSymbol {
    name: string;
    kind: string;
    signature: string;
    visibility: 'exported' | 'public' | 'private' | 'protected' | 'local';
    startLine: number;
    endLine: number;
    level: number;
}
export declare function outlineSource(path: string, text: string, api: SyntaxApi | undefined, max: number): {
    parser: "ast";
    symbols: OutlineSymbol[];
} | {
    parser: "fallback";
    symbols: OutlineSymbol[];
};
export declare function outlineWorkspace(root: string, params: CodeSelection & {
    maxSymbols?: number;
}, signal?: AbortSignal): Promise<{
    ok: boolean;
    error: string;
    files?: undefined;
    bounded?: undefined;
} | {
    ok: boolean;
    files: ({
        parser: "ast";
        symbols: OutlineSymbol[];
        path: string;
        revision: string;
    } | {
        parser: "fallback";
        symbols: OutlineSymbol[];
        path: string;
        revision: string;
    })[];
    bounded: boolean;
    error?: undefined;
}>;
export {};
//# sourceMappingURL=ast-outline.d.ts.map