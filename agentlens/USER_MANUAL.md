# AgentLens User Manual

## What is AgentLens

AgentLens is a VS Code extension that mirrors what Claude Code is doing in real time. A sidebar shows which tasks are running, which are done, and what tools the agent is using.

## Installation

1. Open the `agentlens/` folder in VS Code
2. Run `npm install` then `npm run compile`
3. Press `F5` to launch the Extension Development Host
4. In the new window that opens, click the **AgentLens** icon in the left Activity Bar

## What you see

### Session Status (top-right badge)

| Badge | Meaning |
|-------|---------|
| **Working** (blue, pulsing) | Claude Code is active and writing to the session file |
| **Done** (green) | Session has finished — no writes for over 30 seconds |
| **No Session** (grey) | No matching Claude Code session found for this workspace |

### Tasks Tab

Shows the current task list from Claude Code's last `TodoWrite`:

| Marker | Badge | Meaning |
|--------|-------|---------|
| Blue filled circle + pulse | `进行中` | Task is currently running |
| Green check | `完成` | Task completed |
| Red cross | `失败` | Task failed |
| Dashed circle | `待处理` | Task not started yet |

The task list is the **exact** task list Claude Code last reported — nothing added, nothing guessed.

### Tools Tab

Lists recent tool calls (Bash, Write, Edit, Read, etc). The currently running tool appears at the top with an elapsed time counter.

### Files Tab

Shows files the agent has touched, sorted by edit frequency:
- Yellow dot = files that were edited (Write/Edit)
- Blue dot = files that were only read

### Token Bar

A colored bar below the stats line shows token usage:
- Blue = input tokens
- Green = output tokens
- Purple = cache-read tokens

## Commands

| Command | Action |
|---------|--------|
| `AgentLens: Refresh View` | Re-scans for session files and reloads |
| `AgentLens: Clear History` | Clears all tasks/tools/files from history |
| `AgentLens: Switch Session` | Manually pick which session file to watch |

## Behavior Details

### Startup

When AgentLens activates, it:
1. Finds the Claude Code session matching your current VS Code workspace
2. Reads the entire session file to rebuild state
3. Starts watching for new lines in real time

If the session has already finished (no activity for > 5 min), all tasks are marked completed automatically. Old tasks from a previous Claude Code session are cleared so you start fresh.

### Real-time Updates

AgentLens watches the Claude Code session file (`~/.claude/projects/<hash>/<uuid>.jsonl`) and updates the sidebar immediately when Claude Code writes new lines. This takes 500ms-1s depending on the Chokidar polling interval.

### Empty Task List

If the task list is empty but the status is **Working**, Claude Code is active but hasn't issued a `TodoWrite` yet (or has just finished all tasks and cleared the list). This is normal during exploratory work.

### Why old tasks sometimes show on reload

Claude Code writes the TodoWrite into its session file. When you reload AgentLens, it replays the entire file. AgentLens shows the last TodoWrite that exists — it shows what **was** reported, not what "should" be there. If Claude Code hasn't posted a new TodoWrite yet, the old one stays.

### Switching Projects

AgentLens automatically matches the VS Code workspace folder to the nearest Claude Code session by comparing working directories. If you open a different VS Code project, AgentLens in that window watches the session for that project.

If AgentLens picks the wrong session, use `Ctrl+Shift+P` → `AgentLens: Switch Session` to manually select.

## Self-Check Script

Run the diagnostic script to verify session state:

```bash
cd agentlens
python scripts/self_check.py
```

This scans all active Claude Code sessions and reports:
- Session status (Working/Done)
- Task count and status distribution
- Tool call state (active tools, orphan detection)
- Time since last event
- Any issues found

## Architecture

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

- **logFinder.ts** — Finds `.jsonl` sessions in `~/.claude/projects/`
- **tailStream.ts** — Watches the file for new lines using Chokidar
- **jsonlParser.ts** — Parses JSONL into typed events (tool_start, tool_end, heartbeat)
- **stateStore.ts** — Immutable state machine with Observer pattern
- **loopDetector.ts** — Sliding-window loop detection (Pattern A/B)
- **stallWatchdog.ts** — File-activity-based stall detection
- **fileGraph.ts** — Tracks file edit/read counts

### State Model

```
SessionStatus: 'no_session' | 'working' | 'done' | 'interrupted'
TaskStatus:    'pending'    | 'in_progress' | 'completed' | 'failed'

Session lifecycle:
  no_session → [session found] → working → [file idle] → done
  working   → [file idle + active tool] → interrupted
```
