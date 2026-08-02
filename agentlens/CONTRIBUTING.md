# Contributing to AgentLens / 贡献 AgentLens

Thank you for your interest in contributing to AgentLens!
感谢您对 AgentLens 贡献的关注！

## Development Setup / 开发环境

```bash
git clone https://github.com/yann4030/agentlens
cd agentlens
npm install
npm run compile
```

### Running the Extension / 运行扩展

Press **F5** in VS Code to launch the Extension Development Host with the latest code.
在 VS Code 中按 **F5** 启动扩展开发主机。

### Building the .vsix Package / 打包 .vsix

```bash
npm run package
```

The packaged extension will be saved as `agentlens-1.1.0.vsix`.
打包后的扩展会保存为 `agentlens-1.1.0.vsix`。

### Testing Changes / 测试更改

1. Make your changes in `src/` / 在 `src/` 中进行更改
2. Run `npm run compile` to rebuild / 运行 `npm run compile` 重新编译
3. Press **F5** to test in the Extension Development Host / 按 **F5** 在扩展开发主机中测试
4. Or install the packaged .vsix / 或安装打包好的 .vsix

## Project Structure / 项目结构

```
agentlens/
├── src/
│   ├── extension.ts          # Extension entry point / 扩展入口
│   ├── watcher/             # File watching / 文件监听
│   ├── parser/              # JSONL parsing / JSONL 解析
│   ├── state/               # State management / 状态管理
│   ├── watchdog/            # Loop & stall detection / 循环和卡顿检测
│   └── views/               # Webview provider / Webview 提供器
├── media/
│   ├── main.js              # Compiled React app / 编译后的 React 应用
│   ├── webview.css          # Webview styles / Webview 样式
│   └── icon.svg             # Activity bar icon / 活动栏图标
├── scripts/
│   └── self_check.py        # Diagnostic script / 诊断脚本
└── dist/                    # Compiled output / 编译输出
```

## Code Style / 代码风格

- Use TypeScript for all source files / 所有源码使用 TypeScript
- Use React for the webview UI / Webview UI 使用 React
- Follow the existing patterns in the codebase / 遵循代码库中的现有模式

## Pull Request Process / Pull Request 流程

1. Fork the repository / Fork 本仓库
2. Create a feature branch / 创建功能分支：`git checkout -b feature/my-feature`
3. Make your changes / 进行更改
4. Ensure the extension compiles / 确保扩展编译通过：`npm run compile`
5. Submit a pull request with a clear description / 提交清晰描述的 Pull Request

## Reporting Issues / 报告问题

When reporting bugs, please include: / 报告 Bug 时，请包含：
- VS Code version / VS Code 版本
- Extension version / 扩展版本
- Steps to reproduce / 复现步骤
- Expected vs actual behavior / 预期与实际行为
- Any relevant error messages from the Output panel / Output 面板中的相关错误信息

## Feature Requests / 功能请求

Feature requests are welcome! Please describe the use case and why it would be valuable.
欢迎提出功能请求！请描述使用场景和其价值。
