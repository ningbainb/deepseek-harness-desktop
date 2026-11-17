import { useState } from 'react'
import { openDesktopSurface } from '@linxin666/dsh-desktop-client'

/** Official Models footer seat; editing stays in one dedicated runtime form. */
export function ModelAdvancedEntry() {
  const [failed, setFailed] = useState(false)
  const open = async () => {
    setFailed(false)
    try { setFailed(!await openDesktopSurface('extensions', { setting: 'value-mode' })) }
    catch { setFailed(true) }
  }
  return <details data-model-advanced-entry>
    <summary>高级</summary>
    <p>性价比模式：配置主控、执行模型与成本策略。团队协作操作位于会话中。</p>
    <button type="button" onClick={() => { void open() }}>性价比模式 (Value Mode)</button>
    <p>Agent 高级提示词 (P2)：独立启停，保留普通回复偏好 (P1)。</p>
    <button type="button" onClick={() => { void open() }}>Agent 高级提示词 (P2)</button>
    {failed && <p role="alert">无法打开模型高级设置，请重试。</p>}
  </details>
}
