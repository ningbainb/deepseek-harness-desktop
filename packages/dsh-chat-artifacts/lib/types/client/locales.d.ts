/**
 * Client copy for the conversation artifact card.
 *
 * The zh dictionary defines the key set; the en dictionary is checked against
 * it so a replayed session cannot lose labels after a locale switch.
 */
export declare const zh: {
    readonly 'card.expand': "展开";
    readonly 'card.collapse': "收起";
    readonly 'card.viewSource': "查看源码";
    readonly 'card.hideSource': "隐藏源码";
    readonly 'card.copy': "复制 HTML";
    readonly 'card.copied': "已复制";
    readonly 'card.copyFailed': "复制失败";
    readonly 'card.generating': "生成中";
    readonly 'card.unavailable': "可视化内容无法渲染";
    readonly 'card.invalid': "可视化内容校验失败";
    readonly 'card.source': "HTML 源码";
    readonly 'card.frameUnloaded': "已暂时卸载，滚动回来后重新加载";
    readonly 'card.unknownError': "工具调用失败";
    readonly 'card.bytes': "字节";
    readonly 'card.artifactId': "Artifact ID";
    readonly 'kind.architecture': "架构图";
    readonly 'kind.flow': "流程图";
    readonly 'kind.timeline': "时间轴";
    readonly 'kind.comparison': "比较矩阵";
    readonly 'kind.roadmap': "路线图";
    readonly 'kind.dashboard': "Dashboard";
    readonly 'kind.table': "表格";
    readonly 'kind.wireframe': "线框图";
    readonly 'kind.report': "报告";
    readonly 'kind.other': "可视化";
};
export declare const en: Record<keyof typeof zh, string>;
export type ChatArtifactsKey = keyof typeof zh;
export declare const dictionaries: {
    zh: {
        readonly 'card.expand': "展开";
        readonly 'card.collapse': "收起";
        readonly 'card.viewSource': "查看源码";
        readonly 'card.hideSource': "隐藏源码";
        readonly 'card.copy': "复制 HTML";
        readonly 'card.copied': "已复制";
        readonly 'card.copyFailed': "复制失败";
        readonly 'card.generating': "生成中";
        readonly 'card.unavailable': "可视化内容无法渲染";
        readonly 'card.invalid': "可视化内容校验失败";
        readonly 'card.source': "HTML 源码";
        readonly 'card.frameUnloaded': "已暂时卸载，滚动回来后重新加载";
        readonly 'card.unknownError': "工具调用失败";
        readonly 'card.bytes': "字节";
        readonly 'card.artifactId': "Artifact ID";
        readonly 'kind.architecture': "架构图";
        readonly 'kind.flow': "流程图";
        readonly 'kind.timeline': "时间轴";
        readonly 'kind.comparison': "比较矩阵";
        readonly 'kind.roadmap': "路线图";
        readonly 'kind.dashboard': "Dashboard";
        readonly 'kind.table': "表格";
        readonly 'kind.wireframe': "线框图";
        readonly 'kind.report': "报告";
        readonly 'kind.other': "可视化";
    };
    en: Record<"card.expand" | "card.collapse" | "card.viewSource" | "card.hideSource" | "card.copy" | "card.copied" | "card.copyFailed" | "card.generating" | "card.unavailable" | "card.invalid" | "card.source" | "card.frameUnloaded" | "card.unknownError" | "card.bytes" | "card.artifactId" | "kind.architecture" | "kind.flow" | "kind.timeline" | "kind.comparison" | "kind.roadmap" | "kind.dashboard" | "kind.table" | "kind.wireframe" | "kind.report" | "kind.other", string>;
};
//# sourceMappingURL=locales.d.ts.map