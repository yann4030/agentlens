# AgentLens

**Real-time AI Agent Monitor for VS Code**

AgentLens is a VS Code extension that mirrors what Claude Code (and Codex, Roo Code, Cursor) is doing in real time. A sidebar shows which tasks are running, which are done, and what tools the agent is using.

[![Sponsor](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub+Sponsors&color=EA4AAA)](https://github.com/sponsors/yann4030)

[Features](#features) · [Installation](#installation) · [Commands](#commands) · [Configuration](#configuration) · [Architecture](#architecture) · [Contributing](#contributing)

---

## Features

### Session Status Badge
| Badge | Meaning |
|-------|---------|
| **Working** (blue, pulsing) | Agent is active and writing to the session file |
| **Done** (green) | Session finished — no writes for the idle timeout |
| **Interrupted** (red) | Agent stalled with an active tool running |
| **No Session** (grey) | No matching session found for this workspace |

### Tasks Tab
Shows the current task list from the agent's last `TodoWrite`:
- Blue filled circle + pulse = in progress
- Green check = completed
- Red cross = failed
- Dashed circle = pending

### Tools Tab
Lists recent tool calls (Bash, Write, Edit, Read, etc.) with elapsed time counter for the currently running tool.

### Files Tab
Shows files the agent has touched, sorted by edit frequency:
- Yellow dot = files that were edited (Write/Edit)
- Blue dot = files that were only read

### Token Bar
A colored bar showing token usage:
- Blue = input tokens
- Green = output tokens
- Purple = cache-read tokens

### Watchdog Alerts
- **Loop Detection**: Detects when the agent repeats the same tool call 4+ times or enters an alternating pattern
- **Stall Detection**: Alerts when no new output appears for the active tool timeout
- Both trigger VS Code popup notifications (can be disabled in settings)

### Insights Tab
- Health score (Good / Fair / Poor) based on loop and stall counts
- Tool usage bar chart
- Health metrics: loops detected, stalls detected, total tool calls

### Session Switching
Automatically matches the VS Code workspace folder to the nearest session. Manual session switching available via command palette.

---

## Installation

### From VSIX (Recommended for Testing)

```bash
code --install-extension agentlens-1.0.0.vsix
```

Or open VS Code → `Ctrl+Shift+P` → `Extensions: Install from VSIX...` → select the `.vsix` file.

### From Marketplace (Once Published)

Coming soon. Install directly from the VS Code Extensions tab.

### From Source

```bash
git clone <repo-url>
cd agentlens
npm install
npm run compile
code --install-extension agentlens-1.0.0.vsix
```

Or press **F5** in VS Code to launch the Extension Development Host.

---

## Commands

| Command | Action |
|---------|--------|
| `AgentLens: Refresh View` | Re-scans for session files and reloads |
| `AgentLens: Clear History` | Clears all tasks/tools/files from history |
| `AgentLens: Switch Session` | Manually pick which session file to watch |
| `AgentLens: Full Reset` | Stops all watchers, clears state, restarts from scratch |

### Keyboard Shortcut (Optional)

Add to VS Code `keybindings.json`:
```json
{ "key": "ctrl+shift+f5", "command": "agentlens.reset" }
```

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `agentlens.idleTimeoutSeconds` | `60` | Seconds without file writes before session is marked Done |
| `agentlens.activeToolTimeoutSeconds` | `120` | Seconds a tool can run without new output before marked Interrupted |
| `agentlens.staleFileTimeoutSeconds` | `300` | Seconds without file writes before session is considered stale and tasks auto-completed |
| `agentlens.staleTodoWriteSeconds` | `120` | Seconds since last TodoWrite before old tasks are cleared at startup |
| `agentlens.pollIntervalMs` | `5000` | How often (ms) the activity monitor checks the session file |
| `agentlens.watchdogNotificationsEnabled` | `true` | Show VS Code popup notifications for watchdog alerts |
| `agentlens.loopDetectionEnabled` | `true` | Detect tool-call loops (4 identical calls or alternating patterns) |
| `agentlens.retryScanIntervalMs` | `10000` | When no session is found, how often (ms) to rescan |

---

## Supported Agents

- **Claude Code** (primary)
- **Codex** (Claude Dev)
- **Roo Code**
- **Cursor**

AgentLens watches session files in `~/.claude/projects/` and detects the agent type from session metadata.

---

## Behavior Details

### Startup

When AgentLens activates, it:
1. Finds the session matching your current VS Code workspace (by working directory)
2. Falls back to the most recently modified session if no match found
3. Reads the entire session file to rebuild state
4. Starts watching for new lines in real time

If the session has already finished (no activity for > 5 min), all tasks are marked completed automatically.

### Real-time Updates

AgentLens watches the session file (`~/.claude/projects/<hash>/<uuid>.jsonl`) and updates the sidebar immediately when the agent writes new lines.

### Empty Task List

If the task list is empty but the status is **Working**, the agent is active but hasn't issued a `TodoWrite` yet. This is normal during exploratory work.

---

## Architecture

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

### Source Files

| File | Purpose |
|------|---------|
| `src/watcher/logFinder.ts` | Finds `.jsonl` sessions in `~/.claude/projects/` |
| `src/watcher/tailStream.ts` | Watches the file for new lines using Chokidar |
| `src/parser/jsonlParser.ts` | Parses JSONL into typed events (tool_start, tool_end, heartbeat) |
| `src/state/stateStore.ts` | Immutable state machine with Observer pattern |
| `src/watchdog/loopDetector.ts` | Sliding-window loop detection (Pattern A/B) |
| `src/watchdog/stallWatchdog.ts` | File-activity-based stall detection |
| `src/parser/fileGraph.ts` | Tracks file edit/read counts |

---

## Self-Check Script

Run the diagnostic script to verify session state:

```bash
cd agentlens
python scripts/self_check.py
```

This scans all active sessions and reports:
- Session status (Working/Done)
- Task count and status distribution
- Tool call state (active tools, orphan detection)
- Time since last event
- Any issues found

---

## Support

If AgentLens saves you time and you want to support its development, consider sponsoring:

[![Sponsor](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub+Sponsors&color=EA4AAA)](https://github.com/sponsors/yann4030)

Your sponsorship helps keep AgentLens free and actively maintained.

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

[MIT](LICENSE)
