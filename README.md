# Personal Workbench

个人本地工作台的设计起点：平台壳保持稳定，周报、表格、日记以及未来的 Agent 都以可安装能力包接入。

当前已实现浏览器预览版工作台壳和 Tauri 2 桌面宿主。真实 Codex Provider 检测和 Agent 试运行已放在 Tauri command 中；周报、表格、日记等具体业务能力仍等待以能力包形式接入。

## 运行初版壳

```sh
npm install
npm run dev
```

浏览器预览会展示完整工作台壳和 Provider 配置入口，但不会读取凭据或调用模型。桌面版会由 Tauri command 检测本机 `codex`、Codex profile 和登录态，并通过 `codex exec` 提供 Agent 试运行。

## 选择 Codex 连接方式

打开“设置 → AI Provider”后可以选择：

- `Codex API key`：使用 `~/.codex/api.config.toml`，调用时对应 Codex profile `api`。
- `Codex 订阅`：使用 `~/.codex/config.toml` 和 Codex 自己管理的登录态。

工作台只保存你的选择，不读取、复制或展示 API key、access token 或 `auth.json`。切换后点击“运行健康检查”或“试运行 Agent”即可验证当前连接。

## 打包为桌面 App

项目已经包含 Tauri 2 宿主配置。首次构建需要本机安装 Rust（<https://rustup.rs>）后执行：

```sh
npm run desktop:dev
npm run desktop:build
```

`desktop:dev` 会打开独立的 Workbench 窗口；`desktop:build` 会生成可双击的 macOS App。已经构建好的 App 可以直接运行：

```sh
npm run desktop:open
```

产物位置：

- `src-tauri/target/release/bundle/macos/Workbench.app`
- `src-tauri/target/release/bundle/dmg/Workbench_0.1.0_aarch64.dmg`（运行 `npm run desktop:build:dmg` 单独生成）

安装到启动台（只需首次执行一次）：

```sh
npm run desktop:install
```

这会把 App 安装到 `/Applications/Workbench.app`。以后更新代码后，退出正在运行的 Workbench，再执行：

```sh
npm run desktop:update
```

它会重新构建前端和 Tauri 原生层，并覆盖 `/Applications/Workbench.app`。也可以手动把新的 `Workbench.app` 拖到“应用程序”文件夹并选择替换。

- 领域术语与不变量：[CONTEXT.md](CONTEXT.md)
- 第一版架构、能力契约、界面方向与里程碑：[docs/architecture.md](docs/architecture.md)
- 桌面宿主选型决策：[docs/adr/0001-tauri-as-desktop-host.md](docs/adr/0001-tauri-as-desktop-host.md)
- AI Provider 与凭据托管决策：[docs/adr/0002-platform-managed-ai-provider.md](docs/adr/0002-platform-managed-ai-provider.md)
- 前沿界面与技术栈调研：[docs/research-2026-personal-workbench.md](docs/research-2026-personal-workbench.md)
