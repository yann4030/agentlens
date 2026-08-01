# Contributing to AgentLens

Thank you for your interest in contributing to AgentLens!

## Development Setup

```bash
git clone <repo-url>
cd agentlens
npm install
npm run compile
```

### Running the Extension

Press **F5** in VS Code to launch the Extension Development Host with the latest code.

### Building the .vsix Package

```bash
npm run package
```

The packaged extension will be saved as `agentlens-1.0.0.vsix`.

### Testing Changes

1. Make your changes in `src/`
2. Run `npm run compile` to rebuild
3. Press **F5** to test in the Extension Development Host
4. Or install the packaged .vsix for testing in a normal VS Code window

## Project Structure

```
agentlens/
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── watcher/             # File watching (TailStream, LogFinder)
│   ├── parser/              # JSONL parsing, task extraction, file graph
│   ├── state/               # State management (StateStore)
│   ├── watchdog/            # Loop & stall detection
│   └── views/               # Webview provider
├── media/
│   ├── main.js              # Compiled React app
│   ├── webview.css          # Webview styles
│   └── icon.svg             # Activity bar icon
├── scripts/
│   └── self_check.py        # Diagnostic script
└── dist/                    # Compiled output
```

## Code Style

- Use TypeScript for all source files
- Use React for the webview UI
- Follow the existing patterns in the codebase
- Run `npm run lint` before submitting (if linting is configured)

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Ensure the extension compiles without errors: `npm run compile`
5. Submit a pull request with a clear description of the change

## Reporting Issues

When reporting bugs, please include:
- VS Code version
- Extension version
- Steps to reproduce
- Expected vs actual behavior
- Any relevant error messages from the Output panel (`View` → `Output` → `AgentLens`)

## Feature Requests

Feature requests are welcome! Please describe the use case and why it would be valuable.
