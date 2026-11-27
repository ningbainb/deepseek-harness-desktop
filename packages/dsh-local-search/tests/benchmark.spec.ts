import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { SearchDocument } from '../src/core/search.ts'
import { PrincipalIndex } from '../src/host/index-store.ts'

const topics = [
  ['AcpAgentManager', '管理外部智能体进程', ['acp agent manager', 'AcpAgentManager', 'agent manager 管理', '外部智能体', '智能体进程']],
  ['RemoteSessionRevocation', '撤销远程设备后清理连接', ['remote session revocation', 'RemoteSessionRevocation', '远程设备', 'session revocation 清理', '撤销连接']],
  ['WorkspacePathMigration', '工作项目换目录保留历史', ['workspace path migration', 'WorkspacePathMigration', '项目换目录', 'path migration 历史', '保留历史']],
  ['ModelDirectoryCache', '模型目录切换与失效', ['model directory cache', 'ModelDirectoryCache', '模型目录', 'directory cache 切换', '模型失效']],
  ['QuickSettingsPanel', '拓展坞的快捷设置', ['quick settings panel', 'QuickSettingsPanel', '拓展坞快捷设置', 'settings panel 快捷', '拓展坞']],
  ['BoundedDocumentParser', '本地办公文档提取', ['bounded document parser', 'BoundedDocumentParser', '办公文档提取', 'document parser 本地', '文档提取']],
  ['HistoryTurnCheckpoint', '历史轮次快照与回滚', ['history turn checkpoint', 'HistoryTurnCheckpoint', '轮次快照', 'turn checkpoint 回滚', '历史回滚']],
  ['PluginInstallRollback', '插件安装失败后恢复', ['plugin install rollback', 'PluginInstallRollback', '插件安装失败', 'install rollback 恢复', '安装失败后恢复']],
  ['TokenBudgetCompression', '终端输出压缩和分页', ['token budget compression', 'TokenBudgetCompression', '终端输出压缩', 'budget compression 分页', '输出分页']],
  ['OwnerScopeIsolation', '跨用户的访问隔离', ['owner scope isolation', 'OwnerScopeIsolation', '访问隔离', 'scope isolation 用户', '跨用户隔离']],
] as const

function legacyTokens(value: string): Set<string> {
  const words = value.normalize('NFKC').toLowerCase().match(/[\p{Script=Han}]+|[\p{L}\p{N}_]+/gu) ?? []
  const tokens = words.flatMap(word => /^\p{Script=Han}+$/u.test(word)
    ? [...word].slice(1).map((_, index) => word.slice(index, index + 2))
    : word.length > 1 ? [word] : [])
  return new Set(tokens)
}

test('improves mixed-language Top-5 recall and keeps fresh SQLite queries within the local budget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-search-evidence-'))
  const baselineRss = process.memoryUsage.rss()
  let peakRss = baselineRss
  const now = Date.now()
  const targets: SearchDocument[] = topics.map(([name, text]) => ({
    id: name, title: name, text: name + ' ' + text, scope: 'global', updatedAt: now,
  }))
  try {
    const index = new PrincipalIndex(root, 'benchmark', { nativeVector: false })
    try {
      index.replace('knowledge', 'targets', '1', targets)
      for (let start = 0; start < 9990; start += 100) {
        const size = Math.min(100, 9990 - start)
        index.replace('knowledge', 'filler-' + start, '1', Array.from({ length: size }, (_, offset) => ({
          id: 'noise-' + (start + offset), title: '会议与采购 ' + offset, scope: 'global', updatedAt: now,
          text: '办公会议预算和报表统计，记录各组差旅开支。 Meeting budget and travel costs for each group.',
        })))
        peakRss = Math.max(peakRss, process.memoryUsage.rss())
      }
      expect(index.status().engine).toBe('fts5')
      expect(index.status().counts.knowledge).toBe(10_000)
    } finally {
      index.close()
    }
    const durations: number[] = []
    let found = 0
    let legacyFound = 0
    for (const [expected, , queries] of topics) for (const query of queries) {
      const fresh = new PrincipalIndex(root, 'benchmark', { nativeVector: false })
      try {
        const start = performance.now()
        const result = fresh.search(query, { namespace: 'knowledge', now, limit: 5 })
        durations.push(performance.now() - start)
        if (result.some(row => row.id === expected)) found++
      } finally { fresh.close() }
      const terms = legacyTokens(query)
      const old = targets.map(row => ({ row, score: [...legacyTokens(row.text)].filter(term => terms.has(term)).length }))
        .filter(row => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 5)
      if (old.some(({ row }) => row.id === expected)) legacyFound++
    }
    durations.sort((a, b) => a - b)
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1]!
    const rssMiB = (peakRss - baselineRss) / (1024 * 1024)
    console.info(`Local search benchmark: Top-5 ${found}/50 vs ${legacyFound}/50, cold P95 ${p95.toFixed(2)}ms, indexing RSS +${rssMiB.toFixed(2)}MiB`)
    expect(durations).toHaveLength(50)
    expect(found).toBeGreaterThanOrEqual(45)
    expect(found - legacyFound).toBeGreaterThanOrEqual(8)
    expect(p95).toBeLessThan(35)
    expect(rssMiB).toBeLessThan(60)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
