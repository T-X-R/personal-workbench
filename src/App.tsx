import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  ArrowRightIcon,
  CheckCircledIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CodeIcon,
  KeyboardIcon,
  Cross2Icon,
  DashboardIcon,
  EnterIcon,
  FileTextIcon,
  GearIcon,
  GlobeIcon,
  GridIcon,
  LightningBoltIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PlusIcon,
  ReloadIcon,
  RocketIcon,
  SunIcon,
  UpdateIcon,
} from '@radix-ui/react-icons'
import { getProviderStatus, runAgent, type ProviderKind, type ProviderStatus } from './platform'
import workbenchIcon from './assets/workbench-icon.png'

type View = 'today' | 'capabilities' | 'settings'
type Theme = 'light' | 'dark'

type WorkbenchState = {
  view: View
  theme: Theme
  providerKind: ProviderKind
  setView: (view: View) => void
  setTheme: (theme: Theme) => void
  setProviderKind: (providerKind: ProviderKind) => void
}

const useWorkbench = create<WorkbenchState>()(
  persist(
    (set) => ({
      view: 'today',
      theme: 'light',
      providerKind: 'codex-api',
      setView: (view) => set({ view }),
      setTheme: (theme) => set({ theme }),
      setProviderKind: (providerKind) => set({ providerKind }),
    }),
    {
      name: 'personal-workbench-preferences',
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as Partial<WorkbenchState>
        const previousKind = state.providerKind as string | undefined
        const providerKind: ProviderKind = previousKind === 'codex-cli'
          ? 'codex-subscription'
          : previousKind === 'openai-api'
            ? 'codex-api'
            : previousKind === 'codex-subscription' || previousKind === 'compatible-api'
              ? previousKind
              : 'codex-api'
        return { ...state, providerKind }
      },
    },
  ),
)

const navItems: Array<{ id: View; label: string; hint: string; icon: typeof DashboardIcon }> = [
  { id: 'today', label: '今日', hint: '01', icon: DashboardIcon },
  { id: 'capabilities', label: '能力中心', hint: '—', icon: GridIcon },
  { id: 'settings', label: '设置', hint: '⌘,', icon: GearIcon },
]

const providerLabels: Record<ProviderKind, string> = {
  'codex-api': 'Codex API key',
  'codex-subscription': 'Codex 订阅',
  'compatible-api': '兼容端点',
}

function App() {
  const { view, theme, setView, setTheme, providerKind } = useWorkbench()
  const [commandOpen, setCommandOpen] = useState(false)
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    getProviderStatus(providerKind).then(setProviderStatus)
  }, [providerKind])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((open) => !open)
      }
      if (event.key === 'Escape') setCommandOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 3200)
  }

  const navigate = (nextView: View) => {
    setView(nextView)
    setCommandOpen(false)
  }

  return (
    <div className="app-shell">
      <Sidebar activeView={view} onNavigate={navigate} onOpenCommand={() => setCommandOpen(true)} providerStatus={providerStatus} />
      <main className="app-main">
        <Topbar view={view} onOpenCommand={() => setCommandOpen(true)} />
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            className="page-wrap"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {view === 'today' && <TodayPage onNavigate={navigate} onNotice={showNotice} providerStatus={providerStatus} />}
            {view === 'capabilities' && <CapabilitiesPage onNotice={showNotice} />}
            {view === 'settings' && <SettingsPage onNotice={showNotice} providerStatus={providerStatus} onRefreshStatus={async () => { const nextStatus = await getProviderStatus(providerKind); setProviderStatus(nextStatus); return nextStatus }} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <AnimatePresence>
        {notice && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <CheckCircledIcon />
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {commandOpen && (
          <CommandPalette
            onClose={() => setCommandOpen(false)}
            onNavigate={navigate}
            onNotice={showNotice}
            theme={theme}
            onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function Sidebar({ activeView, onNavigate, onOpenCommand, providerStatus }: { activeView: View; onNavigate: (view: View) => void; onOpenCommand: () => void; providerStatus: ProviderStatus | null }) {
  const { theme, setTheme, providerKind } = useWorkbench()

  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <img className="brand-mark" src={workbenchIcon} alt="" aria-hidden="true" />
        <div>
          <div className="brand-name">Workbench</div>
          <div className="brand-subtitle">Personal edition</div>
        </div>
      </div>

      <button className="command-trigger" onClick={onOpenCommand}>
        <span className="command-trigger-label"><MagnifyingGlassIcon />快速操作</span>
        <kbd>⌘ K</kbd>
      </button>

      <div className="sidebar-label">工作区</div>
      <nav className="primary-nav" aria-label="主导航">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = activeView === item.id
          return (
            <button key={item.id} className={`nav-item ${active ? 'is-active' : ''}`} onClick={() => onNavigate(item.id)}>
              <span className="nav-item-main"><Icon />{item.label}</span>
              <span className="nav-hint">{item.hint}</span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-label">平台状态</div>
      <button className="provider-mini" onClick={() => onNavigate('settings')}>
        <span className="provider-mini-icon"><LightningBoltIcon /></span>
        <span className="provider-mini-copy">
          <strong>{providerLabels[providerKind]}</strong>
          <span><i className={`status-dot status-dot-${providerStatus?.state ?? 'preview'}`} />{providerStatus?.state === 'ready' ? '已连接' : providerStatus?.state === 'error' ? '需要处理' : '检查中'}</span>
        </span>
        <ChevronRightIcon />
      </button>

      <div className="sidebar-footer">
        <button className="icon-button" aria-label={theme === 'light' ? '切换深色模式' : '切换浅色模式'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>
        <span className="version-label">v0.1.0 · local</span>
      </div>
    </aside>
  )
}

function Topbar({ view, onOpenCommand }: { view: View; onOpenCommand: () => void }) {
  const label = navItems.find((item) => item.id === view)?.label ?? '今日'
  return (
    <header className="topbar">
      <div className="breadcrumbs"><span>Workbench</span><ChevronRightIcon /><strong>{label}</strong></div>
      <div className="topbar-actions">
        <span className="local-badge"><i className="status-dot status-dot-ready" />本地优先</span>
        <button className="topbar-search" onClick={onOpenCommand}><MagnifyingGlassIcon /><span>搜索工作台</span><kbd>⌘ K</kbd></button>
      </div>
    </header>
  )
}

function TodayPage({ onNavigate, onNotice, providerStatus }: { onNavigate: (view: View) => void; onNotice: (message: string) => void; providerStatus: ProviderStatus | null }) {
  const today = new Intl.DateTimeFormat('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(2026, 8, 3))
  return (
    <div className="content-column today-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">{today}</div>
          <h1>把今天留在<br /><em>一个安静的地方。</em></h1>
          <p className="intro-copy">工作台只保留你主动安装的能力。先装一个，之后的工作会在这里聚拢。</p>
        </div>
        <div className="intro-actions">
          <button className="primary-button" onClick={() => onNavigate('capabilities')}><PlusIcon />安装第一个能力</button>
          <button className="secondary-button" onClick={() => onNotice('命令面板已准备好，按 ⌘ K 随时打开。')}><KeyboardIcon />⌘ K</button>
        </div>
      </div>

      <div className="today-grid">
        <section className="surface surface-empty">
          <div className="surface-heading">
            <div><span className="section-kicker">WORKSPACE</span><h2>今天从这里开始</h2></div>
            <span className="count-label">0 个能力</span>
          </div>
          <div className="empty-stage">
            <div className="empty-orbit" aria-hidden="true"><span /><span /><span /></div>
            <div className="empty-stage-copy"><strong>还没有启用的能力</strong><span>安装能力后，它们的入口会出现在这里。</span></div>
            <button className="text-button" onClick={() => onNavigate('capabilities')}>浏览能力中心<ArrowRightIcon /></button>
          </div>
        </section>

        <section className="surface provider-surface">
          <div className="surface-heading">
            <div><span className="section-kicker">AI PROVIDER</span><h2>统一的 AI 入口</h2></div>
            <LightningBoltIcon className="heading-icon" />
          </div>
          <div className="provider-status-line">
            <div className="provider-status-symbol"><LightningBoltIcon /></div>
            <div><strong>{providerStatus?.label ?? 'Codex API key'}</strong><span>{providerStatus?.detail ?? '正在检查宿主状态'}</span></div>
            <span className={`pill pill-${providerStatus?.state ?? 'preview'}`}>{providerStatus?.state === 'ready' ? '已连接' : providerStatus?.state === 'error' ? '需要处理' : '检查中'}</span>
          </div>
          <p className="provider-copy">平台统一托管 Provider。以后安装的能力只申请 AI 权限，不需要再次填写 key。</p>
          <button className="surface-link" onClick={() => onNavigate('settings')}>查看 Provider 设置<ChevronRightIcon /></button>
        </section>
      </div>

      <section className="activity-section">
        <div className="section-heading-row"><div><span className="section-kicker">ACTIVITY</span><h2>最近活动</h2></div><span className="muted-label">等待第一个事件</span></div>
        <div className="activity-empty"><ClockIcon /><span>活动事件会在你使用能力后出现在这里。</span><button className="quiet-button" onClick={() => onNotice('活动记录会由已启用的能力写入。')}>了解更多</button></div>
      </section>
    </div>
  )
}

function CapabilitiesPage({ onNotice }: { onNotice: (message: string) => void }) {
  const [importOpen, setImportOpen] = useState(false)
  return (
    <div className="content-column capabilities-page">
      <div className="page-header-row">
        <div><div className="eyebrow">MODULES</div><h1>能力中心</h1><p>只安装你真正需要的能力，工作台保持轻盈。</p></div>
        <button className="primary-button" onClick={() => setImportOpen(true)}><PlusIcon />导入能力包</button>
      </div>

      <div className="capability-toolbar"><div className="filter-chip active">全部 <span>0</span></div><div className="filter-chip">已启用 <span>0</span></div><div className="filter-chip">已停用 <span>0</span></div><div className="toolbar-spacer" /><button className="quiet-button" onClick={() => onNotice('能力包需要由桌面宿主进行校验。')}><CodeIcon />开发者说明</button></div>

      <section className="capability-empty">
        <div className="capability-empty-art" aria-hidden="true"><div className="art-window"><span /><span /><span /></div><div className="art-plus"><PlusIcon /></div></div>
        <div className="capability-empty-copy"><h2>你的工作台还很安静</h2><p>能力包是独立安装的功能模块。周报、表格、日记和 Agent 都会从这里进入。</p><button className="text-button" onClick={() => setImportOpen(true)}>导入本地能力包<ArrowRightIcon /></button></div>
      </section>

      <div className="capability-note"><LockClosedIcon /><span>第一版只允许导入本机信任的能力包。权限会在安装前展示，能力不会直接拿到平台凭据。</span></div>

      <AnimatePresence>{importOpen && <ImportModal onClose={() => setImportOpen(false)} onNotice={onNotice} />}</AnimatePresence>
    </div>
  )
}

function ImportModal({ onClose, onNotice }: { onClose: () => void; onNotice: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const handleSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) setSelectedName(file.name)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title" initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 6 }}>
        <div className="modal-header"><div><span className="section-kicker">LOCAL INSTALL</span><h2 id="import-title">导入能力包</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><Cross2Icon /></button></div>
        <p className="modal-copy">选择一个 `.capability.zip` 或本地能力目录。桌面宿主会在安装前检查版本、入口和权限。</p>
        <button className="dropzone" onClick={() => inputRef.current?.click()}><RocketIcon /><strong>{selectedName ?? '选择一个本地能力包'}</strong><span>{selectedName ? '已选择，等待桌面宿主校验' : '支持 .capability.zip'}</span></button>
        <input ref={inputRef} className="visually-hidden" type="file" accept=".zip,.capability.zip,application/zip" onChange={handleSelect} />
        <div className="modal-footer"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!selectedName} onClick={() => { onNotice('预览模式已记录选择，桌面宿主接入后完成安装。'); onClose() }}>继续安装<ArrowRightIcon /></button></div>
      </motion.section>
    </div>
  )
}

function SettingsPage({ onNotice, providerStatus, onRefreshStatus }: { onNotice: (message: string) => void; providerStatus: ProviderStatus | null; onRefreshStatus: () => Promise<ProviderStatus> }) {
  const { theme, setTheme, providerKind, setProviderKind } = useWorkbench()
  const [checking, setChecking] = useState(false)
  const [testingAgent, setTestingAgent] = useState(false)

  const runCheck = async () => {
    setChecking(true)
    const nextStatus = await onRefreshStatus()
    setChecking(false)
    onNotice(nextStatus.state === 'ready' ? 'Provider 连接正常。' : nextStatus.state === 'error' ? 'Provider 需要处理，请检查对应配置。' : 'Provider 检查尚未完成。')
  }

  const testAgent = async () => {
    setTestingAgent(true)
    try {
      await runAgent('只返回“Agent Host ready”，不要调用工具。', providerKind)
      onNotice('Agent 已返回，Provider 连接正常。')
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Agent 试运行失败。')
    } finally {
      setTestingAgent(false)
    }
  }

  return (
    <div className="content-column settings-page">
      <div className="page-header-row"><div><div className="eyebrow">PREFERENCES</div><h1>设置</h1><p>平台级的偏好和 AI Provider 都在这里管理。</p></div></div>

      <section className="settings-section"><div className="settings-section-heading"><span className="settings-number">01</span><div><h2>AI Provider</h2><p>配置一次，所有能力共享。能力包永远不会读取原始凭据。</p></div></div>
        <div className="provider-options">
          {(['codex-api', 'codex-subscription', 'compatible-api'] as ProviderKind[]).map((kind) => <button key={kind} className={`provider-option ${providerKind === kind ? 'selected' : ''}`} onClick={() => setProviderKind(kind)}><span className="provider-option-icon">{kind === 'compatible-api' ? <GlobeIcon /> : kind === 'codex-api' ? <LightningBoltIcon /> : <CodeIcon />}</span><span><strong>{providerLabels[kind]}</strong><small>{kind === 'codex-api' ? '使用 ~/.codex/api.config.toml（profile: api）' : kind === 'codex-subscription' ? '使用 ~/.codex/config.toml 和订阅登录态' : '连接 OpenAI-compatible endpoint'}</small></span>{providerKind === kind && <CheckIcon className="selected-check" />}</button>)}
        </div>
        <div className="provider-detail"><div className="detail-icon"><UpdateIcon /></div><div><strong>{providerStatus?.label ?? 'Codex API key'} · {providerStatus?.state === 'ready' ? '已连接' : providerStatus?.state === 'error' ? '需要处理' : '检查中'}</strong><span>{providerStatus?.detail ?? '正在读取状态'}</span></div><div className="provider-detail-actions"><button className="quiet-button" onClick={runCheck} disabled={checking}>{checking ? '检查中…' : '运行健康检查'}<ReloadIcon className={checking ? 'spin' : ''} /></button><button className="quiet-button" onClick={testAgent} disabled={testingAgent}>{testingAgent ? '试运行中…' : '试运行 Agent'}<ArrowRightIcon /></button></div></div>
        <div className="settings-callout"><LockClosedIcon /><div><strong>凭据保持在宿主层</strong><span>订阅模式使用 Codex 登录态；API key 模式使用 ~/.codex/api.config.toml。工作台只保存 Provider 选择，不读取或展示密钥。</span></div></div>
      </section>

      <section className="settings-section"><div className="settings-section-heading"><span className="settings-number">02</span><div><h2>外观</h2><p>浅色界面优先，深色模式沿用同一套强调色。</p></div></div><div className="theme-options"><button className={`theme-option ${theme === 'light' ? 'selected' : ''}`} onClick={() => setTheme('light')}><span className="theme-preview theme-preview-light"><SunIcon /></span><span><strong>浅色</strong><small>清晰、安静、适合白天</small></span>{theme === 'light' && <CheckIcon className="selected-check" />}</button><button className={`theme-option ${theme === 'dark' ? 'selected' : ''}`} onClick={() => setTheme('dark')}><span className="theme-preview theme-preview-dark"><MoonIcon /></span><span><strong>深色</strong><small>低亮度、适合夜间</small></span>{theme === 'dark' && <CheckIcon className="selected-check" />}</button></div></section>

      <section className="settings-section"><div className="settings-section-heading"><span className="settings-number">03</span><div><h2>本地数据</h2><p>数据默认留在当前设备，平台未来通过 SQLite 管理迁移和备份。</p></div></div><div className="data-row"><div className="data-row-icon"><FileTextIcon /></div><div><strong>默认工作区</strong><span>Personal workspace · 本地</span></div><span className="data-row-value">准备就绪</span><ChevronRightIcon /></div></section>
    </div>
  )
}

function CommandPalette({ onClose, onNavigate, onNotice, theme, onToggleTheme }: { onClose: () => void; onNavigate: (view: View) => void; onNotice: (message: string) => void; theme: Theme; onToggleTheme: () => void }) {
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])

  const commands = useMemo(() => [
    { label: '打开今日', hint: '导航', icon: DashboardIcon, action: () => onNavigate('today') },
    { label: '打开能力中心', hint: '导航', icon: GridIcon, action: () => onNavigate('capabilities') },
    { label: '打开设置', hint: '导航', icon: GearIcon, action: () => onNavigate('settings') },
    { label: theme === 'light' ? '切换到深色模式' : '切换到浅色模式', hint: '外观', icon: theme === 'light' ? MoonIcon : SunIcon, action: () => { onToggleTheme(); onClose() } },
    { label: '查看平台状态', hint: '系统', icon: LightningBoltIcon, action: () => { onNavigate('settings'); onNotice('已定位到 AI Provider 设置。') } },
  ].filter((command) => command.label.toLowerCase().includes(query.toLowerCase())), [onNavigate, onNotice, onToggleTheme, onClose, query, theme])

  useEffect(() => setHighlightedIndex(0), [query])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlightedIndex((index) => commands.length ? (index + 1) % commands.length : 0)
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlightedIndex((index) => commands.length ? (index - 1 + commands.length) % commands.length : 0)
      }
      if (event.key === 'Enter' && commands[highlightedIndex]) {
        event.preventDefault()
        commands[highlightedIndex].action()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commands, highlightedIndex])

  return <div className="palette-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><motion.section className="command-palette" role="dialog" aria-modal="true" initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.99 }}><div className="palette-search"><MagnifyingGlassIcon /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入一个动作…" /><kbd>ESC</kbd></div><div className="palette-list">{commands.length > 0 ? commands.map((command, index) => { const Icon = command.icon; return <button key={command.label} className={`palette-item ${index === highlightedIndex ? 'is-highlighted' : ''}`} onMouseEnter={() => setHighlightedIndex(index)} onClick={command.action}><span className="palette-item-icon"><Icon /></span><span>{command.label}</span><small>{command.hint}</small><ChevronRightIcon /></button> }) : <div className="palette-no-results">没有匹配的动作</div>}</div><div className="palette-footer"><span><KeyboardIcon /> 使用方向键选择</span><span><EnterIcon /> 回车执行</span></div></motion.section></div>
}

export { App }
