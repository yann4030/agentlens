# AgentLens

**Real-time AI Agent Monitor for VS Code / VS Code 实时 AI Agent 监控插件**

AgentLens is a VS Code extension that mirrors what Claude Code (and Codex, Roo Code, Cursor) is doing in real time. A sidebar shows which tasks are running, which are done, and what tools the agent is using.

AgentLens 是一个 VS Code 扩展，实时镜像显示 Claude Code（以及 Codex、Roo Code、Cursor）的运行状态。侧边栏展示任务进度、工具调用和文件操作。

[![Sponsor](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub+Sponsors&color=EA4AAA)](https://github.com/sponsors/yann4030)

[Features](#features--功能) · [Installation](#installation--安装) · [Commands](#commands--命令) · [Configuration](#configuration--配置) · [Architecture](#architecture--架构) · [Contributing](#contributing--贡献)

---

## Features / 功能

### Session Status Badge / 会话状态徽章
| Badge | Meaning | 徽章 | 含义 |
|-------|---------|------|------|
| **Working** (blue, pulsing) | Agent is active | **Working**（蓝色闪烁） | Agent 正在运行 |
| **Done** (green) | Session finished | **Done**（绿色） | 会话已结束 |
| **Interrupted** (red) | Agent stalled | **Interrupted**（红色） | Agent 意外中断 |
| **No Session** (grey) | No session found | **No Session**（灰色） | 未找到会话 |

### Tasks Tab / 任务面板
Shows the current task list from the agent's last `TodoWrite`. / 显示 Agent 最近一次 `TodoWrite` 的任务列表。

| Marker | Status | 标记 | 状态 |
|--------|--------|------|------|
| Blue filled circle + pulse | In progress | 蓝色实心圆+闪烁 | 进行中 |
| Green check | Completed | 绿色勾选 | 已完成 |
| Red cross | Failed | 红色叉号 | 失败 |
| Dashed circle | Pending | 虚线圆圈 | 待处理 |

### Tools Tab / 工具面板
Lists recent tool calls (Bash, Write, Edit, Read, etc.) with elapsed time counter for the currently running tool.
列出最近的工具调用（Bash、Write、Edit、Read 等），正在运行中的工具显示耗时。

### Files Tab / 文件面板
Shows files the agent has touched: / 显示 Agent 操作过的文件：
- Yellow dot = edited (Write/Edit) / 黄色圆点 = 已编辑
- Blue dot = only read / 蓝色圆点 = 仅读取

### Token Bar / Token 进度条
| Color | Meaning | 颜色 | 含义 |
|-------|---------|------|------|
| Blue | Input tokens | 蓝色 | 输入 Token |
| Green | Output tokens | 绿色 | 输出 Token |
| Purple | Cache-read tokens | 紫色 | 缓存读取 Token |

### Watchdog Alerts / 监控告警
- **Loop Detection / 循环检测**: Detects when the agent repeats the same tool call 4+ times or enters an alternating pattern. / 检测 Agent 重复调用同一工具 4 次以上或进入交替模式。
- **Stall Detection / 卡顿检测**: Alerts when no new output appears for the active tool timeout. / 当活跃工具超时无新输出时告警。
- Both trigger VS Code popup notifications (can be disabled in settings). / 两者都会触发 VS Code 弹窗通知（可在设置中关闭）。

### Insights Tab / 数据面板
- Health score (Good / Fair / Poor) based on loop and stall counts / 健康评分（Good / Fair / Poor），基于循环和卡顿次数
- Tool usage bar chart / 工具使用频率图表
- Health metrics: loops, stalls, total tool calls / 健康指标：循环次数、卡顿次数、工具调用总数

### Session Switching / 会话切换
Automatically matches the VS Code workspace folder to the nearest session. Manual session switching available via command palette.
自动匹配 VS Code 工作区到对应会话。也可通过命令面板手动切换。

---

## Installation / 安装

### From VSIX (Recommended / 推荐方式)

```bash
code --install-extension agentlens-1.1.0.vsix
```

Or: VS Code → `Ctrl+Shift+P` → `Extensions: Install from VSIX...`
或：VS Code → `Ctrl+Shift+P` → `Extensions: Install from VSIX...`

### From Source / 源码安装

```bash
git clone https://github.com/yann4030/agentlens
cd agentlens
npm install
npm run compile
code --install-extension agentlens-1.1.0.vsix
```

Or press **F5** in VS Code to launch the Extension Development Host.
或在 VS Code 中按 **F5** 启动扩展开发主机。

---

## Commands / 命令

| Command | Action | 操作 |
|---------|--------|------|
| `AgentLens: Refresh View` | Re-scans for session files and reloads / 重新扫描会话文件并刷新 | 
| `AgentLens: Clear History` | Clears all tasks/tools/files / 清空所有任务/工具/文件 |
| `AgentLens: Switch Session` | Manually pick a session file / 手动选择会话文件 |
| `AgentLens: Full Reset` | Stops watchers, clears state, restarts / 停止监听、清空状态、重启 |

### Keyboard Shortcut / 快捷键（可选）

Add to VS Code `keybindings.json`: / 添加到 VS Code `keybindings.json`：

```json
{ "key": "ctrl+shift+f5", "command": "agentlens.reset" }
```

---

## Configuration / 配置

| Setting | Default | Description / 描述 |
|---------|---------|-------------------|
| `agentlens.idleTimeoutSeconds` | `60` | Seconds without file writes before session is marked Done / 无文件写入超过此时间标记为 Done |
| `agentlens.activeToolTimeoutSeconds` | `120` | Seconds a tool can run without output before marked Interrupted / 工具无输出超过此时间标记为 Interrupted |
| `agentlens.staleFileTimeoutSeconds` | `300` | Seconds before session is considered stale / 会话被视为过期的秒数 |
| `agentlens.staleTodoWriteSeconds` | `120` | Seconds since last TodoWrite before clearing old tasks / 超过此时间清空旧任务 |
| `agentlens.pollIntervalMs` | `5000` | How often (ms) to check the session file / 轮询会话文件的间隔（毫秒） |
| `agentlens.watchdogNotificationsEnabled` | `true` | Show VS Code popup notifications / 显示 VS Code 弹窗通知 |
| `agentlens.loopDetectionEnabled` | `true` | Detect tool-call loops / 检测工具循环 |
| `agentlens.retryScanIntervalMs` | `10000` | How often to rescan when no session found / 未找到会话时的重扫间隔 |

---

## Supported Agents / 支持的 Agent

- **Claude Code** (primary / 主要)
- **Codex** (Claude Dev)
- **Roo Code**
- **Cursor**

AgentLens watches session files in `~/.claude/projects/`.
AgentLens 监听 `~/.claude/projects/` 中的会话文件。

---

## Architecture / 架构

```
Extension Host                    Webview (React)
┌──────────────────┐            ┌──────────────────┐
│ TailStream       │            │ StatusBadge      │
│ (Chokidar)       │  vscode    │ TaskTree         │
│        ↓         │ postMessage│ ToolFeed         │
│ JSONL Parser     │ ─────────→ │ FileTree         │
│        ↓         │            │ TokenBar         │
│ StateStore       │            │ WatchdogBanner   │
│ (Observer)       │            │                  │
│        ↓         │            │                  │
│ SidebarProvider  │            │                  │
└──────────────────┘            └──────────────────┘
```

### Source Files / 源码文件

| File | Purpose / 功能 |
|------|--------------|
| `src/watcher/logFinder.ts` | Finds `.jsonl` sessions in `~/.claude/projects/` / 查找会话文件 |
| `src/watcher/tailStream.ts` | Watches the file for new lines using Chokidar / Chokidar 监听文件变更 |
| `src/parser/jsonlParser.ts` | Parses JSONL into typed events / 解析 JSONL 事件 |
| `src/state/stateStore.ts` | Immutable state machine with Observer pattern / 状态管理 |
| `src/watchdog/loopDetector.ts` | Sliding-window loop detection / 循环检测 |
| `src/watchdog/stallWatchdog.ts` | File-activity-based stall detection / 卡顿检测 |
| `src/parser/fileGraph.ts` | Tracks file edit/read counts / 文件操作计数 |

---

## Self-Check Script / 自检脚本

```bash
cd agentlens
python scripts/self_check.py
```

Scans all active sessions and reports: / 扫描所有活跃会话并报告：
- Session status / 会话状态
- Task count and status distribution / 任务数量和状态分布
- Tool call state / 工具调用状态
- Time since last event / 距上次事件时间
- Any issues found / 发现的问题

---

## Support / 支持

If AgentLens saves you time and you want to support its development, consider sponsoring:
如果 AgentLens 帮你节省了时间，欢迎赞助支持：

[![Sponsor](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub+Sponsors&color=EA4AAA)](https://github.com/sponsors/yann4030)

Your sponsorship helps keep AgentLens free and actively maintained.
您的赞助帮助 AgentLens 保持免费和维护。

---

## Contributing / 贡献

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解贡献指南。

---

## License / 许可证

[MIT](LICENSE)
