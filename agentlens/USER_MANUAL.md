# AgentLens User Manual / AgentLens 用户手册

## What is AgentLens / AgentLens 是什么

AgentLens is a VS Code extension that mirrors what Claude Code is doing in real time. A sidebar shows which tasks are running, which are done, and what tools the agent is using.

AgentLens 是一个 VS Code 扩展，实时镜像显示 Claude Code 的运行状态。侧边栏展示任务进度、工具调用和文件操作。

## Installation / 安装

1. Open the `agentlens/` folder in VS Code / 在 VS Code 中打开 `agentlens/` 文件夹
2. Run `npm install` then `npm run compile` / 运行 `npm install` 然后 `npm run compile`
3. Press **F5** to launch the Extension Development Host / 按 **F5** 启动扩展开发主机
4. In the new window, click the **AgentLens** icon in the left Activity Bar / 在新窗口中，点击左侧活动栏的 **AgentLens** 图标

## What you see / 功能界面

### Session Status (top-right badge) / 会话状态（右上角徽章）

| Badge | Meaning | 徽章 | 含义 |
|-------|---------|------|------|
| **Working** (blue, pulsing) | Claude Code is active | **Working**（蓝色闪烁） | Claude Code 正在运行 |
| **Done** (green) | Session finished | **Done**（绿色） | 会话已结束 |
| **No Session** (grey) | No matching session | **No Session**（灰色） | 未找到匹配的会话 |

### Tasks Tab / 任务面板

Shows the current task list from Claude Code's last `TodoWrite`:
显示 Claude Code 最近一次 `TodoWrite` 的任务列表：

| Marker | Badge | Meaning | 标记 | 状态 | 含义 |
|--------|-------|---------|------|------|------|
| Blue filled circle + pulse | 进行中 | In progress | 蓝色实心圆+闪烁 | 进行中 | 正在执行 |
| Green check | 完成 | Completed | 绿色勾选 | 完成 | 已完成 |
| Red cross | 失败 | Failed | 红色叉号 | 失败 | 执行失败 |
| Dashed circle | 待处理 | Pending | 虚线圆圈 | 待处理 | 等待执行 |

The task list is the **exact** task list Claude Code last reported.
任务列表是 Claude Code 最近一次上报的**精确**任务列表。

### Tools Tab / 工具面板

Lists recent tool calls (Bash, Write, Edit, Read, etc.). The currently running tool appears at the top with an elapsed time counter.
列出最近的工具调用（Bash、Write、Edit、Read 等）。正在运行中的工具显示在顶部并有耗时计数。

### Files Tab / 文件面板

Shows files the agent has touched: / 显示 Agent 操作过的文件：
- Yellow dot = files that were edited (Write/Edit) / 黄色圆点 = 已编辑的文件
- Blue dot = files that were only read / 蓝色圆点 = 仅读取的文件

### Token Bar / Token 进度条

A colored bar below the stats line shows token usage: / 统计行下方的彩色进度条显示 Token 使用情况：
- Blue = input tokens / 蓝色 = 输入 Token
- Green = output tokens / 绿色 = 输出 Token
- Purple = cache-read tokens / 紫色 = 缓存读取 Token

## Commands / 命令

| Command | Action | 操作 |
|---------|--------|------|
| `AgentLens: Refresh View` | Re-scans for session files and reloads / 重新扫描会话文件并刷新 | |
| `AgentLens: Clear History` | Clears all tasks/tools/files from history / 清空所有任务/工具/文件历史 |
| `AgentLens: Switch Session` | Manually pick which session file to watch / 手动选择要监视的会话文件 |
| `AgentLens: Full Reset` | Stops all watchers, clears all state, restarts from scratch / 停止所有监听、清空全部状态、从头重启 |

## Reset Button / 重置按钮

The sidebar header includes a **↻ Reset button** for quick access to the Full Reset function. This is useful when AgentLens gets stuck or you need a clean restart.

侧边栏标题栏包含 **↻ 重置按钮**，可快速执行完全重置。当 AgentLens 卡住或需要全新开始时非常有用。

Click the ↻ button in the top-right of the AgentLens sidebar header, or use `Ctrl+Shift+P` → `AgentLens: Full Reset`.
点击 AgentLens 侧边栏标题栏右上角的 ↻ 按钮，或使用 `Ctrl+Shift+P` → `AgentLens: Full Reset`。

## Behavior Details / 行为说明

### Startup / 启动

When AgentLens activates, it: / AgentLens 激活时：
1. Finds the Claude Code session matching your current VS Code workspace / 查找匹配当前 VS Code 工作区的 Claude Code 会话
2. Reads the entire session file to rebuild state / 读取整个会话文件重建状态
3. Starts watching for new lines in real time / 实时监听新行写入

If the session has already finished (no activity for > 5 min), all tasks are marked completed automatically. Old tasks from a previous Claude Code session are cleared so you start fresh.
如果会话已结束（超过 5 分钟无活动），所有任务会自动标记为已完成。旧任务会被清空以确保新会话状态干净。

### Real-time Updates / 实时更新

AgentLens watches the Claude Code session file (`~/.claude/projects/<hash>/<uuid>.jsonl`) and updates the sidebar immediately when Claude Code writes new lines.
AgentLens 监听 Claude Code 会话文件（`~/.claude/projects/<hash>/<uuid>.jsonl`），当 Claude Code 写入新行时立即更新侧边栏。

### Empty Task List / 任务列表为空

If the task list is empty but the status is **Working**, Claude Code is active but hasn't issued a `TodoWrite` yet (or has just finished all tasks and cleared the list). This is normal during exploratory work.
如果任务列表为空但状态显示 **Working**，说明 Claude Code 正在运行但尚未发出 `TodoWrite`（或刚完成任务并清空了列表）。这在探索性工作时是正常的。

### Switching Projects / 切换项目

AgentLens automatically matches the VS Code workspace folder to the nearest Claude Code session by comparing working directories. If you open a different VS Code project, AgentLens in that window watches the session for that project.
AgentLens 通过比对工作目录自动匹配 VS Code 工作区到最近的 Claude Code 会话。打开不同项目时，AgentLens 会监听对应项目的会话。

If AgentLens picks the wrong session, use `Ctrl+Shift+P` → `AgentLens: Switch Session` to manually select.
如果 AgentLens 匹配了错误的会话，使用 `Ctrl+Shift+P` → `AgentLens: Switch Session` 手动选择。

## Self-Check Script / 自检脚本

Run the diagnostic script to verify session state: / 运行诊断脚本验证会话状态：

```bash
cd agentlens
python scripts/self_check.py
```

This scans all active Claude Code sessions and reports: / 扫描所有活跃 Claude Code 会话并报告：
- Session status (Working/Done) / 会话状态（Working/Done）
- Task count and status distribution / 任务数量和状态分布
- Tool call state (active tools, orphan detection) / 工具调用状态
- Time since last event / 距上次事件时间
- Any issues found / 发现的问题

## Architecture / 架构

```
Extension Host                    Webview (React)
┌─────────────────┐              ┌──────────────────┐
│ TailStream       │              │ StatusBadge       │
│ (Chokidar)       │   vscode     │ TaskTree          │
│        ↓         │  postMessage │ ToolFeed          │
│ JSONL Parser     │ ───────────→ │ FileTree          │
│        ↓         │              │ TokenBar          │
│ StateStore       │              │ WatchdogBanner    │
│ (Observer)       │              │                   │
│        ↓         │              │                   │
│ SidebarProvider  │              │                   │
└─────────────────┘              └──────────────────┘
```

- **logFinder.ts** — Finds `.jsonl` sessions in `~/.claude/projects/` / 查找会话文件
- **tailStream.ts** — Watches the file for new lines using Chokidar / Chokidar 监听文件变更
- **jsonlParser.ts** — Parses JSONL into typed events (tool_start, tool_end, heartbeat) / 解析 JSONL 事件
- **stateStore.ts** — Immutable state machine with Observer pattern / 状态管理
- **loopDetector.ts** — Sliding-window loop detection (Pattern A/B) / 循环检测
- **stallWatchdog.ts** — File-activity-based stall detection / 卡顿检测
- **fileGraph.ts** — Tracks file edit/read counts / 文件操作计数

### State Model / 状态模型

```
SessionStatus: 'no_session' | 'working' | 'done' | 'interrupted'
TaskStatus:    'pending'    | 'in_progress' | 'completed' | 'failed'

Session lifecycle: / 会话生命周期：
  no_session → [session found] → working → [file idle] → done
  working   → [file idle + active tool] → interrupted
```
