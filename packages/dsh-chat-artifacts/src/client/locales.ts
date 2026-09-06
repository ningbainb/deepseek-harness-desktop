/**
 * Client copy for the conversation artifact card.
 *
 * The zh dictionary defines the key set; the en dictionary is checked against
 * it so a replayed session cannot lose labels after a locale switch.
 */

export const zh = {
  'card.expand': '展开',
  'card.collapse': '收起',
  'card.viewSource': '查看源码',
  'card.hideSource': '隐藏源码',
  'card.copy': '复制 HTML',
  'card.copied': '已复制',
  'card.copyFailed': '复制失败',
  'card.generating': '生成中',
  'card.unavailable': '可视化内容无法渲染',
  'card.invalid': '可视化内容校验失败',
  'card.source': 'HTML 源码',
  'card.frameUnloaded': '已暂时卸载，滚动回来后重新加载',
  'card.unknownError': '工具调用失败',
  'card.bytes': '字节',
  'card.artifactId': 'Artifact ID',
  'kind.architecture': '架构图',
  'kind.flow': '流程图',
  'kind.timeline': '时间轴',
  'kind.comparison': '比较矩阵',
  'kind.roadmap': '路线图',
  'kind.dashboard': 'Dashboard',
  'kind.table': '表格',
  'kind.wireframe': '线框图',
  'kind.report': '报告',
  'kind.other': '可视化',
} as const

export const en: Record<keyof typeof zh, string> = {
  'card.expand': 'Expand',
  'card.collapse': 'Collapse',
  'card.viewSource': 'View source',
  'card.hideSource': 'Hide source',
  'card.copy': 'Copy HTML',
  'card.copied': 'Copied',
  'card.copyFailed': 'Copy failed',
  'card.generating': 'Generating',
  'card.unavailable': 'Visualization could not be rendered',
  'card.invalid': 'Visualization validation failed',
  'card.source': 'HTML source',
  'card.frameUnloaded': 'Temporarily unloaded; it will reload when you scroll back',
  'card.unknownError': 'Tool call failed',
  'card.bytes': 'bytes',
  'card.artifactId': 'Artifact ID',
  'kind.architecture': 'Architecture',
  'kind.flow': 'Flow',
  'kind.timeline': 'Timeline',
  'kind.comparison': 'Comparison',
  'kind.roadmap': 'Roadmap',
  'kind.dashboard': 'Dashboard',
  'kind.table': 'Table',
  'kind.wireframe': 'Wireframe',
  'kind.report': 'Report',
  'kind.other': 'Visualization',
}

export type ChatArtifactsKey = keyof typeof zh

export const dictionaries = { zh, en }
