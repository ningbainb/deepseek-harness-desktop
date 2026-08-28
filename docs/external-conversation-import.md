# 从其他 AI 工具继续工作 (Context Handoff Import)

DeepSeek Harness Desktop 支持从其他 AI Coding Agent（如 Claude Code、Codex）安全导入会话工作上下文，并生成合法的 DSH 会话继续未完成的任务。

## 核心架构与设计原则

```
External Agent Sources (Read-Only)
    │
    ├── ClaudeCodeAdapter (扫描 ~/.claude/projects, ~/.claude/sessions)
    │
    └── CodexAdapter (扫描 ~/.codex/sessions, ~/.codex/history.jsonl)
            │
            ↓
    ExternalConversationV1 (标准化中间 IR)
            │
            ↓
    Import Planner (scan -> preview -> plan -> confirm -> apply -> verify -> commit)
            │
    ┌───────┴────────────────────────┐
    ↓                                ↓
Project Matcher            Context Reconstructor + ImportTokenBudgeter + Redactor
(精确 CWD、Git root、      (提炼主要任务、技术决策、关联文件、命令产物、
 远程仓库匹配、版本比对)    错误拦截、完成状态、最近尾部对话、脱敏、Token 预算)
    │                                │
    └───────────────┬────────────────┘
                    ↓
            Handoff Context (<external-agent-handoff> 提示词)
                    ↓
            DSH Session Bridge (官方通道创建合法会话并写入上下文)
                    ↓
            Import Ledger (atomic state/external-conversation-imports-v1.json)
                    ↓
            自动导航至主窗口新会话
```

## 功能特点

1. **只读安全发现**:
   - 严格以只读模式访问外部工具数据目录，不对 `~/.claude` 或 `~/.codex` 产生任何写操作。
   - 内置路径穿越防护与符号链接转义拦截。

2. **容错流式解析**:
   - 逐行流式解析 JSONL，支持最大单行与文件大小上限。
   - 自动跳过截断尾行、未知事件类型、内部推理（Thinking/Reasoning）链与非用户可见轨迹。

3. **严格凭据脱敏**:
   - 自动识别并脱敏 API Key、OAuth Bearer Token、JWT、私钥、密码及环境配置中的敏感数据，替换为 `[REDACTED_*]` 占位符。

4. **项目智能对齐与版本比对**:
   - 优先通过规范真实路径（Canonical realpath）与 Git Root / Remote 匹配当前工作区。
   - 智能比对历史会话时的 Git Commit 与当前 HEAD 版本，代码版本变更时自动在上下文注入变动提示。

5. **Token 严格受控**:
   - 目标 Token 预算控制在 4,000 ~ 8,000 Tokens，硬上限 10,000 Tokens。
   - 保留核心工作状态结构提要与最近轮次对话尾部，确保为后续对话预留充足上下文空间。

6. **防重复导入与增量检测**:
   - 使用原子账本（`external-conversation-imports-v1.json`）记录导入指纹。
   - 当源会话发生更新时，提示用户「源会话有更新」，支持将最新状态导入为新会话。

7. **原生官方会话桥接**:
   - 完全基于 DSH 官方会话创建通道与事件机制，不直接读写私有持久化文件，不伪造工具执行事件或运行时能力声明。
