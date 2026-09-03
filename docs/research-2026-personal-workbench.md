# 2026 Personal Workbench：一手资料索引与设计归纳

- 调研日期：2026-09-03
- 范围：单人、本地优先、桌面生产力 App；关注界面结构、交互语言、可维护的前端/桌面技术栈。
- 资料策略：优先记录官方设计规范、官方框架文档和官方产品/开发者文档。当前执行环境无法解析外部域名，因此以下链接作为一手资料索引，发布前应在可联网环境逐条复核版本与页面内容。

## 一手资料

### 界面与交互

1. Apple Human Interface Guidelines：<https://developer.apple.com/design/human-interface-guidelines/>
   - 关注平台原生导航、层级、可访问性、窗口与材料表达。
2. Apple Liquid Glass（Apple 平台材料规范）：<https://developer.apple.com/design/human-interface-guidelines/liquid-glass>
   - 可借鉴层级、透材质和焦点变化；不能把 Apple 平台材料规范直接当成 Web CSS 规范。
3. Material 3 Adaptive Design：<https://m3.material.io/foundations/adaptive-design/overview>
   - 关注窗口尺寸变化、导航形态切换和内容密度适配。
4. Radix Primitives：<https://www.radix-ui.com/primitives/docs/overview/introduction>
   - 提供无障碍交互原语，适合自有视觉令牌而不是套用模板。
5. Raycast Developer Docs：<https://developers.raycast.com/>
   - 展示以命令、快捷键和可安装扩展为中心的桌面工具模型。
6. Linear Method / Product surface：<https://linear.app/method>
   - 作为“高信息密度但保持层级和留白”的产品界面参考；这是产品参考，不是规范。

### 桌面与工程

1. Tauri 2：<https://v2.tauri.app/>
   - 官方桌面宿主、命令调用、窗口和安全能力文档。
2. Electron：<https://www.electronjs.org/docs/latest/>
   - 官方 Chromium + Node 桌面运行时文档，作为替代宿主的比较基线。
3. Vite：<https://vite.dev/guide/>
   - 官方前端开发与构建文档；个人桌面 App 不需要 SSR 时路径短。
4. Tailwind CSS v4：<https://tailwindcss.com/blog/tailwindcss-v4>
   - 官方 v4 设计令牌与 CSS-first 配置说明。
5. Motion for React：<https://motion.dev/docs/react-quick-start>
   - 官方 React 动效 API，适合少量、可关闭的界面过渡。
6. pnpm Workspaces：<https://pnpm.io/workspaces>
   - 官方多包工作区能力，支持平台、契约和能力包分开维护。
7. SQLite：<https://sqlite.org/whentouse.html>
   - 官方对 SQLite 适用场景的说明；与本地优先单用户模型匹配。

### OpenAI/Codex 相关

1. OpenAI Codex 文档入口：<https://developers.openai.com/codex/>
   - 平台集成前应核对 Codex CLI 的登录、配置和非交互执行边界。
2. OpenAI API Responses 参考：<https://platform.openai.com/docs/api-reference/responses>
   - 只有 API key Provider 走 API 调用；不能把 ChatGPT/Codex 订阅登录态当成通用 API key。

本机只读检查（Codex CLI `0.153.0`）还观察到：`codex login` 支持 API key、access token 和 device auth 入口；`codex exec` 支持 profile、JSON 输出、ephemeral 会话以及 read-only/workspace-write 等沙箱选项。这里仅证明本机 CLI 存在可复用的进程边界，不代表平台可以读取或复制其 auth 文件。

## 设计归纳（推论，不是单一来源的市场统计）

从以上一手资料可以提炼出适合本项目的五个方向：

1. **命令优先**：全局搜索/命令面板、快捷键和可发现的动作比把所有入口堆在首页更适合桌面个人工具。
2. **空间优先**：窄导航 rail + 中央工作区 + 按需上下文面板，比永久三栏 KPI 看板更容易维持层级。
3. **材料克制**：可以借鉴透明层和焦点变化，但不复制 Liquid Glass 的营销效果；保持实色回退和高对比度。
4. **自有令牌**：使用无障碍原语，自己控制颜色、密度、圆角和动效，避免默认组件库外观同质化。
5. **本地优先**：离线可用、数据目录可见、导入/备份可控；Agent 只在显式授权时读取活动事件。

这些归纳支持 `docs/architecture.md` 的视觉和工程选择，但不意味着“2026 年所有 App 都这样设计”。上线前如果需要竞品量化，应另做带截图与版本号的产品审计。

## 对本项目的选型结论

| 关注点 | 建议 | 取舍 |
|---|---|---|
| 桌面宿主 | Tauri 2 | 更轻；需要少量 Rust Adapter |
| 前端 | React + Vite + TypeScript | 无 SSR 负担，适合懒加载能力包 |
| UI 基础 | Tailwind v4 + Radix Primitives + 自有 tokens | 可控且无障碍；需要自己做视觉系统 |
| 动效 | Motion | 只做导航、抽屉、安装反馈；避免持续动画 |
| 数据 | SQLite，经平台 Storage Adapter 暴露 | 能力数据隔离；需维护迁移 |
| 模块维护 | pnpm workspace + 独立 capability package | 平台与能力可分别迭代；首版不做远程市场 |

## 待联网复核

- Tauri 2、Vite、Tailwind v4、Motion 在目标机器上的当前稳定版本。
- Apple Liquid Glass 页面在 2026 年的具体平台适用范围。
- 是否需要 Electron 的 Node 原生生态；若不需要，不应为插件市场提前承受其运行时成本。
