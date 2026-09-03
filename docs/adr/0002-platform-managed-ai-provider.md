# ADR 0002：平台统一托管 AI Provider，能力包不持有凭据

- 状态：提议
- 日期：2026-09-03

## 背景

工作台和多个能力都可能需要 Agent。若每个能力自行配置 API key，会产生重复配置、密钥泄露和调用审计困难。用户希望当前本机 Codex 配置一次后，平台及能力直接复用。

## 决策

在平台核心提供 `Agent Host` 和 `Credential Broker`：

- 能力只申请 `ai.invoke`，通过 `AgentHost.run()` 发起任务。
- `Codex API Adapter` 通过 `codex exec --profile api` 复用本机 `~/.codex/api.config.toml`。
- `Codex Subscription Adapter` 通过默认 `codex exec` 复用本机 `~/.codex/config.toml` 和登录状态。
- `OpenAI/API Adapter` 从环境变量或操作系统密钥链获取 API key，并在受控进程中调用 API。
- 前端和能力包永远不会拿到原始 token、API key 或 Codex auth 文件。

对现有 Codex profile 只导入非敏感 provider 配置；订阅登录由 CLI 自己使用。若用户确认导入配置文件中的明文 API key，平台只把它迁移到系统密钥链，不保留原文。

## 关键区分

Codex/ChatGPT 订阅登录与 OpenAI API key 不是同一种凭据。订阅登录只能由支持该登录态的 Codex 客户端使用；API key 才是面向 API 调用的凭据。平台可以统一托管两种 Provider，但不能把订阅 token 当作 API key 转发给任意 HTTP 客户端。

## 安全默认值

- 默认使用 `codex exec --ephemeral`，Agent 任务使用受限沙箱。
- 文件写入、外部命令、网络访问按能力权限和每次任务确认。
- 不自动在 Provider 之间切换，不在错误消息中回显请求头或密钥。
- 当前 Provider 由用户在设置页选择，选择结果只保存为 Provider 类型，不复制两个配置文件或认证内容。
- 每次调用记录能力 ID、Provider、模型、输入引用、耗时和结果状态；不默认记录原始凭据。

## 代价与缓解

- 通过 Codex CLI 运行需要处理进程生命周期、JSON 输出和取消：封装在单一 Adapter，并用 fake CLI 做契约测试。
- API key 的密钥链实现需要按 macOS/Windows/Linux 分别适配：第一版可先支持环境变量和当前桌面平台的系统密钥链。
- 能力仍可能把敏感内容提交给模型：用 `activity.read`、`files.read` 等数据权限单独控制，并在任务开始前显示数据范围。

## 不在本 ADR 中决定

- 具体模型、温度、提示词和 Agent 编排框架。
- 是否以后支持本地 Ollama/LM Studio；若增加，只需新增 Provider Adapter。
