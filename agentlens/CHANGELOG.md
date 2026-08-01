# Changelog

All notable changes to AgentLens will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.1.0] - Unreleased

### Added
- **Full Reset Command** (`AgentLens: Full Reset`): Stops all watchers, clears state (file graph + session state), restarts from scratch. Accessible via command palette and the ↻ button in the sidebar header.
- **Reset Button**: Added ↻ button to the sidebar header for quick access to the Full Reset command.

## [1.0.0] - 2024

### Added
- **Session Status Monitoring**: Real-time badge showing Working / Done / Interrupted / No Session states
- **Task Tracking**: Parses `TodoWrite` events to display task list with status markers
- **Tool Feed**: Lists recent tool calls with elapsed time for the active tool
- **File Tracking**: Shows files edited (Write/Edit) and read (Read) with colored dots
- **Token Bar**: Visual bar showing input/output/cache token breakdown
- **Insights Tab**: Health score, tool usage bar chart, loop/stall metrics
- **Watchdog Alerts**: Loop detection (Pattern A/B) and stall detection with VS Code notifications
- **Session Switching**: Manual session picker via command palette
- **Auto Session Matching**: Automatically matches VS Code workspace to the nearest session file
- **Self-Check Script**: Diagnostic tool at `scripts/self_check.py` for validating session state
- **Support for Multiple Agents**: Claude Code, Codex, Roo Code, Cursor

### Configuration
- `idleTimeoutSeconds` (default: 60)
- `activeToolTimeoutSeconds` (default: 120)
- `staleFileTimeoutSeconds` (default: 300)
- `staleTodoWriteSeconds` (default: 120)
- `pollIntervalMs` (default: 5000)
- `watchdogNotificationsEnabled` (default: true)
- `loopDetectionEnabled` (default: true)
- `retryScanIntervalMs` (default: 10000)
