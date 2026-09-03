# Personal Workbench 第一版设计方案

## 1. 目标与非目标

### 目标

第一版交付一个可长期维护的个人桌面 App 壳：

1. 没有任何能力包时也能正常使用。
2. 用户能看到能力中心、安装状态、启用/停用状态和权限说明。
3. 能力通过稳定的小接口接入，不把周报、表格、日记的业务代码写进核心。
4. 后续可以加入读取活动事件的智能代理能力，但第一版不接具体模型。
5. 本地优先、单用户、无需公开发布；更新以本地开发和手动安装为主。

### 非目标

- 第一版不实现周报、表格、日记的业务页面。
- 第一版不做远程能力市场、账号体系、多人协作和云同步。
- 第一版不默认持续采集屏幕、剪贴板或全量应用内容。
- 第一版不把模型对话框做成首页主角。
- 第一版不让能力包自行配置 API key 或直接读取 Codex 登录文件。

## 2. 推荐技术栈

### 默认方案：Tauri 2 + React + Vite + TypeScript

- **桌面宿主**：Tauri 2。提供轻量桌面窗口、文件系统和系统级能力；前端保持 Web 技术栈，后续需要原生能力时再在 Rust 层增加受控命令。
- **前端**：React + Vite + TypeScript。个人 App 不需要 SSR，Vite 的本地开发和打包路径更短，也更适合把能力界面按模块懒加载。
- **样式**：Tailwind CSS v4 + 自有 design tokens。组件采用 Radix Primitives（或等价的无障碍原语），不把某个模板库的默认外观当成产品设计。
- **动效**：Motion（`motion/react`），只用于页面切换、抽屉、命令面板和安装状态反馈；遵守 `prefers-reduced-motion`。
- **图标**：`@phosphor-icons/react`，全项目只使用一个图标家族。
- **状态**：Zustand 仅承载工作台会话状态（当前能力、命令面板、主题）；能力数据通过宿主接口访问，避免能力直接共享全局状态。
- **本地数据**：SQLite。由平台提供一个 Storage Adapter；能力只能拿到按能力 ID 隔离的命名空间。
- **包管理**：pnpm workspace。平台、能力契约、运行时和未来能力包可以分别维护，但第一版仍可只发布一个桌面 App。

### 更新与维护策略

- 平台核心和能力契约使用语义化版本；能力 manifest 声明最低平台版本。
- 平台数据只通过迁移脚本升级，禁止能力包自行改平台表。
- 日常开发使用 `pnpm dev` 热更新；需要给自己使用时再生成本地桌面包，不配置发布流水线。
- 能力包独立导入和回滚；平台升级失败时保留上一份注册表与数据备份。

### AI Provider 与统一凭据

平台增加一个全局 `Agent Host`，能力包只申请 `ai.invoke` 权限即可调用，不再保存自己的 API key。调用链为：

```text
Capability → Agent Host → Provider Resolver → Credential Broker
                                      ├─ Codex API Adapter (profile: api)
                                      └─ Codex Subscription Adapter
```

#### 两种凭据来源必须区分

1. **Codex/ChatGPT 订阅登录**：属于本机 Codex 客户端的登录会话。平台不读取或复制登录 token，而是由 `Codex Subscription Adapter` 调用本机 `codex exec`，让 Codex 自己使用默认配置和登录状态。
2. **API key**：当前通过 `Codex API Adapter` 调用 `codex exec --profile api`，让 Codex 自己加载 `~/.codex/api.config.toml`；密钥不进入前端，也不下发给能力包。

因此可以做到“配置一次、全平台和能力共享”，但不能把订阅当成通用 API key。能力包无需再次配置凭据，仍然需要声明数据权限（例如 `activity.read`）和工具权限。

平台持久化的只应是 Provider 引用，而不是秘密本身，例如：

```ts
type ProviderProfile = {
  id: string;
  kind: 'codex-api' | 'codex-subscription' | 'compatible-api';
  codexHome?: string;
  profile?: string;
  model?: string;
  baseUrl?: string;
  credentialRef?: string; // OS keychain / environment reference
};
```

#### 对现有本机 Codex 配置的兼容方式

平台启动时可以发现 `CODEX_HOME` 和用户选择的 Codex profile，读取模型、provider、base URL 等非敏感字段。当前桌面版提供两个 Codex 入口：`codex-api` 映射 `~/.codex/api.config.toml`（调用时传 `--profile api`），`codex-subscription` 使用默认的 `~/.codex/config.toml` 和 Codex 登录态。随后按来源处理：

- 订阅/登录态：直接走 `codex exec`，不复制 auth 文件。
- 环境变量或密钥链中的 API key：由 API Adapter 直接使用，无需再次填写。
- 若 API key 只以内联明文存在于某个自定义配置文件：首次导入时明确提示并写入系统密钥链，成功后清理临时副本；不做静默读取，也不把该文件纳入平台数据库。

这样“平台和能力包不用额外配置”成立，同时避免把 Codex 的私有认证存储耦合进工作台。

#### 推荐的 Provider 策略

- 设置页提供一个可切换的 Provider：`Codex API key`、`Codex 订阅` 或自定义兼容端点。
- 支持导入 Codex 的非敏感配置（模型、provider、base URL、profile）；认证仍交给 Codex CLI 或密钥链，不解析 auth 文件。
- Provider 健康检查只返回“可用/不可用/原因”，不回显 token、请求头或完整错误中的密钥。
- 默认调用使用 Codex CLI 的 `--ephemeral` 和受限沙箱；涉及文件写入或外部命令时按次请求确认，不允许能力包自行打开危险模式。
- 默认不自动在 Provider 之间切换；用户能在每次 Agent 任务中看到实际 Provider、模型和数据范围。
- `Codex CLI Adapter` 使用参数数组和显式 `CODEX_HOME`/profile 启动子进程，不拼接 shell 字符串；超时、取消和非零退出统一映射为平台错误。

#### Agent Host 的最小接口

```ts
type AgentRequest = {
  capabilityId: string;
  task: string;
  inputRefs: string[];              // 活动事件/能力数据引用，不直接传平台数据库句柄
  tools?: Array<'activity.read' | 'files.read' | 'files.write'>;
  outputSchema?: unknown;
};

type AgentResult = {
  runId: string;
  providerId: string;
  model: string;
  output: unknown;
  inputRefs: string[];
};

interface AgentHost {
  run(request: AgentRequest): Promise<AgentResult>;
}
```

这个接口的关键点是：能力提交任务，不接触凭据；平台负责 Provider 选择、权限审计、取消、重试和调用记录。

### 为什么不是默认 Electron

Electron 的 Node 生态更宽，但它会把浏览器和 Node 运行时一起打进应用，内存与包体成本更高。这个项目主要是本地生产力界面，不需要 Node 原生插件，因此优先 Tauri。若未来的能力包必须大量依赖 Node 原生 SDK，再把宿主层替换为 Electron，而不改变能力契约。

### 为什么不先做纯 Web/PWA

纯 Web/PWA 可以最快出页面，但本地 SQLite、文件导入导出、系统快捷键和离线数据隔离会被浏览器权限牵制。它可以作为将来的只读伴侣端，不作为当前主宿主。

### 如果明确只支持 macOS

可以把 SwiftUI + AppKit 作为另一条路线：原生窗口、快捷键和系统材料的还原度最高，但能力包动态安装、跨版本契约和 Web 能力复用的成本更高。除非你确认永远只维护 macOS 且愿意把能力也写成 Swift 模块，否则仍建议 Tauri 2。

## 3. 总体结构

```text
apps/desktop
├── shell                 # 导航、布局、命令面板、空状态、设置
├── platform              # Tauri 命令、SQLite、文件/路径、日志
└── runtime               # 能力发现、校验、安装、启停、路由挂载

packages/capability-contract
└── manifest + host interface + shared value types

capabilities/             # 第一版为空；后续每个能力一个独立包
└── weekly-report/
```

核心依赖方向只有一条：

```text
Shell → Runtime → Capability Contract
Platform Adapter ────────────────┘
Capability Package → Host Interface（不能反向依赖 Shell 内部）
```

## 4. 可插拔能力契约

能力对平台只暴露一个注册入口，平台把复杂度藏在 Runtime 和 Host Interface 后面：

```ts
export type CapabilityManifest = {
  id: string;                 // stable reverse-domain id
  version: string;
  name: string;
  description: string;
  icon: string;
  entrypoints: Array<'page' | 'command' | 'widget' | 'job'>;
  permissions: Array<'storage' | 'activity.read' | 'activity.write' | 'ai.invoke'>;
  minPlatformVersion: string;
};

export type CapabilityModule = {
  manifest: CapabilityManifest;
  register(host: CapabilityHost): void | Promise<void>;
};

export type CapabilityHost = {
  storage: CapabilityStorage;       // 能力自己的命名空间
  commands: CapabilityCommands;     // 注册/执行可见命令
  activity: CapabilityActivity;     // 受权限控制的活动读写
  ui: CapabilityUi;                 // 注册页面、首页小组件和设置项
};
```

设计约束：

- 能力不直接 import `@tauri-apps/api`、SQLite 客户端或 Shell 页面。
- `register` 必须可重复调用，停用时由 Runtime 撤销该能力的路由、命令和任务。
- Manifest 是安装审核的依据；权限在安装时展示，在运行时再次校验。
- 能力包带版本和平台最低版本；不兼容时显示原因，不尝试静默加载。
- 首版支持本地目录/压缩包导入，远程下载和签名校验留到能力市场阶段。

## 5. 生命周期与状态

```text
发现 → 校验 → 已安装 → 启用 → 运行
                    ↘ 停用
已安装/停用 → 卸载（能力包与用户数据分开确认）
```

`Capability Registry` 至少记录：`id`、`version`、`source`、`installedAt`、`enabled`、`manifestHash`、`lastError`。

安装流程必须是可解释的：

1. 选择本地能力包。
2. 展示名称、版本、入口和权限。
3. 校验 manifest、平台版本和 ID 冲突。
4. 安装到应用数据目录并写入注册表。
5. 用户明确点击“启用”后才挂载入口。

### 能力包形态与信任级别

能力包建议采用一个可导入的压缩包，内部至少包含 `manifest.json`、已构建的 ESM 入口和静态资源。第一版只允许用户从本机导入“受信任能力”，在同一个 WebView 进程中运行；这满足个人 App 的维护成本和深度集成需求，但不把它误称为安全沙箱。

未来若开放下载第三方能力，再增加独立的沙箱运行级别（例如独立 WebView/iframe、签名校验和更细的权限代理）。在没有这层隔离前，不应把远程能力市场或他人代码安装列入产品承诺。

## 6. 第一版界面

### 信息架构

- **今日**：默认首页。没有能力时显示“能力中心”空状态和最近平台活动。
- **能力中心**：已安装/未启用/不可用三种状态；第一版提供本地导入入口和安装说明。
- **设置**：外观、数据目录、备份与诊断信息。
- **AI 设置**：全局 Provider 来源、当前模型、健康检查和凭据状态；不在能力页面重复出现。
- **命令面板**：`⌘K` / `Ctrl+K` 打开；第一版只放导航、主题切换和能力中心入口。

### 视觉方向

- 默认浅色：冷灰背景、近黑文字、单一电蓝强调色；深色模式复用同一色相，不引入第二个彩色系统。
- 左侧窄 rail + 中央工作区 + 必要时的右侧上下文抽屉；不使用永久三栏数据看板。
- 用分隔线、留白和列表层级表达关系，卡片只用于真正可操作的安装/权限对象。
- 圆角统一采用 12–14px 级别；按钮用紧凑的触觉反馈，页面切换动效控制在 160–220ms。
- 空状态要说明“为什么这里为空”和“下一步做什么”，而不是只放一个插画。
- 首页首屏只保留一个主要动作：安装第一个能力。

### 必须覆盖的状态

- 首次启动、无能力包。
- 能力包导入中、校验失败、权限确认、安装成功。
- 已安装但停用、启用失败、版本不兼容。
- 数据目录不可写、SQLite 锁定、能力运行错误。
- 无活动事件时的智能代理空状态（第一版仅占位，不调用模型）。
- Agent 调用中的 Provider、模型、输入数据范围、取消、重试和失败状态。

## 7. 活动事件与 Agent 预留

平台只定义事实记录，不定义“总结算法”：

```ts
type ActivityEvent = {
  id: string;
  occurredAt: string;
  source: string;       // shell or capability id
  type: string;
  title: string;
  payload: unknown;
  sensitivity: 'normal' | 'private';
};
```

未来的“每日总结”能力通过 `activity.read` 查询时间范围内事件，经过用户确认后调用 `ai.invoke`，输出带来源事件 ID 的草稿。默认不后台运行、不上传原始数据，模型供应商和提示词属于该能力自己的实现，不进入平台核心。

## 8. 第一版里程碑与验收

### M0：可运行壳

- 启动桌面窗口、主题切换、路由、命令面板。
- 无能力时的首页和能力中心空状态。
- 设置页预留全局 AI Provider 状态（第一版可以只显示未配置，不执行模型调用）。

验收：删除所有未来能力目录后仍可启动；刷新后主题与当前页面不丢失。

### M1：能力注册表（不交付具体能力）

- manifest 类型与校验器。
- 本地导入、安装、启用、停用、卸载能力包。
- 安装审核页显示权限与版本信息。

验收：用一个测试能力包完成完整生命周期；停用后其页面、命令和任务都不可见；卸载能力包不会误删用户数据。

### M2：数据与诊断基础

- SQLite Storage Adapter、迁移、备份导出。
- 统一错误展示和诊断日志。
- `Agent Host`、Codex CLI Adapter、API Adapter 和 Provider 健康检查。

验收：重启后注册表和设置可恢复；模拟数据库锁定时给出可操作错误提示；测试能力只调用 `AgentHost.run`，无法读取凭据；平台能复用已登录 Codex CLI 或已配置的 API key。

### M3：第一个真实能力

推荐先做“日记”而不是周报：它能验证编辑、存储、活动事件和后续 Agent 输入，但不会先引入复杂表格交互。

## 9. 需要刻意避免的决策

- 不把每个能力做成一个独立窗口或独立数据库。
- 不让能力直接读平台数据库表。
- 不在平台核心预置周报/表格/日记的业务模型。
- 不为了“未来插件市场”第一天就实现远程账号、支付、签名服务。
- 不把 AI 紫色渐变、全屏聊天和密集 KPI 卡片作为默认首页语言。
