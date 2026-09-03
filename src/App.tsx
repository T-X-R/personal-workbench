import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
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
import { checkProviderHealth, getProviderStatus, getSelectedProvider, setSelectedProvider, testSelectedProvider, type ProviderKind, type ProviderStatus } from './platform'
import i18n, { type Language } from './i18n'
import workbenchIcon from './assets/workbench-icon.png'

type View = 'today' | 'capabilities' | 'settings'
type Theme = 'light' | 'dark'

type WorkbenchState = {
  view: View
  theme: Theme
  language: Language
  providerKind: ProviderKind
  setView: (view: View) => void
  setTheme: (theme: Theme) => void
  setLanguage: (language: Language) => void
  setProviderKind: (providerKind: ProviderKind) => void
}

const useWorkbench = create<WorkbenchState>()(
  persist(
    (set) => ({
      view: 'today',
      theme: 'light',
      language: 'zh',
      providerKind: 'codex-api',
      setView: (view) => set({ view }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setProviderKind: (providerKind) => set({ providerKind }),
    }),
    {
      name: 'personal-workbench-preferences',
      version: 3,
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
        const language: Language = state.language === 'en' ? 'en' : 'zh'
        return { ...state, providerKind, language }
      },
    },
  ),
)

const primaryNavItems: Array<{ id: Exclude<View, 'settings'>; hint: string; icon: typeof DashboardIcon }> = [
  { id: 'today', hint: '01', icon: DashboardIcon },
  { id: 'capabilities', hint: '—', icon: GridIcon },
]

function viewLabel(t: TFunction, view: View) {
  return view === 'today' ? t('today') : view === 'capabilities' ? t('capabilities') : t('settings')
}

function providerLabel(t: TFunction, kind: ProviderKind) {
  return kind === 'codex-api' ? t('providerApi') : kind === 'codex-subscription' ? t('providerSubscription') : t('providerCompatible')
}

function providerStateLabel(t: TFunction, state: ProviderStatus['state'] | undefined) {
  return state === 'ready' ? t('connected') : state === 'configured' ? t('configured') : state === 'error' ? t('needsAttention') : t('checking')
}

function App() {
  const { t } = useTranslation()
  const { view, theme, language, setView, setTheme, providerKind, setProviderKind } = useWorkbench()
  const [commandOpen, setCommandOpen] = useState(false)
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    void i18n.changeLanguage(language)
  }, [language])

  useEffect(() => {
    getSelectedProvider().then(setProviderKind)
  }, [setProviderKind])

  useEffect(() => {
    setProviderStatus(null)
    getProviderStatus(providerKind, language).then(setProviderStatus)
  }, [language, providerKind])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((open) => !open)
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault()
        setView('settings')
      }
      if (event.key === 'Escape') setCommandOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setView])

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 3200)
  }

  const navigate = (nextView: View) => {
    setView(nextView)
    setCommandOpen(false)
  }

  const selectProvider = async (kind: ProviderKind) => {
    try {
      await setSelectedProvider(kind)
      setProviderKind(kind)
    } catch {
      showNotice(t('providerSaveFailed'))
    }
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
            {view === 'settings' && <SettingsPage onNotice={showNotice} providerStatus={providerStatus} onSelectProvider={selectProvider} onCheckProvider={async () => { const nextStatus = await checkProviderHealth(providerKind, language); setProviderStatus(nextStatus); return nextStatus }} />}
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
  const { t } = useTranslation()
  const { theme, setTheme, providerKind } = useWorkbench()

  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <img className="brand-mark" src={workbenchIcon} alt="" aria-hidden="true" />
        <div>
          <div className="brand-name">Workbench</div>
          <div className="brand-subtitle">{t('brandSubtitle')}</div>
        </div>
      </div>

      <button className="command-trigger" onClick={onOpenCommand}>
        <span className="command-trigger-label"><MagnifyingGlassIcon />{t('quickActions')}</span>
        <kbd>⌘ K</kbd>
      </button>

      <div className="sidebar-label">{t('workspace')}</div>
      <nav className="primary-nav" aria-label={t('mainNavigation')}>
        {primaryNavItems.map((item) => {
          const Icon = item.icon
          const active = activeView === item.id
          return (
            <button key={item.id} className={`nav-item ${active ? 'is-active' : ''}`} onClick={() => onNavigate(item.id)}>
              <span className="nav-item-main"><Icon />{viewLabel(t, item.id)}</span>
              <span className="nav-hint">{item.hint}</span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-label">{t('platformStatus')}</div>
      <button className="provider-mini" onClick={() => onNavigate('settings')}>
        <span className="provider-mini-icon"><LightningBoltIcon /></span>
        <span className="provider-mini-copy">
          <strong>{providerLabel(t, providerKind)}</strong>
          <span><i className={`status-dot status-dot-${providerStatus?.state ?? 'preview'}`} />{providerStateLabel(t, providerStatus?.state)}</span>
        </span>
        <ChevronRightIcon />
      </button>

      <button className={`nav-item sidebar-settings ${activeView === 'settings' ? 'is-active' : ''}`} onClick={() => onNavigate('settings')}>
        <span className="nav-item-main"><GearIcon />{t('settings')}</span>
        <span className="nav-hint">⌘,</span>
      </button>

      <div className="sidebar-footer">
        <button className="icon-button" aria-label={theme === 'light' ? t('switchDark') : t('switchLight')} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>
        <span className="version-label">v0.1.0 · {t('localVersion')}</span>
      </div>
    </aside>
  )
}

function Topbar({ view, onOpenCommand }: { view: View; onOpenCommand: () => void }) {
  const { t } = useTranslation()
  const label = viewLabel(t, view)
  return (
    <header className="topbar">
      <div className="breadcrumbs"><span>Workbench</span><ChevronRightIcon /><strong>{label}</strong></div>
      <div className="topbar-actions">
        <span className="local-badge"><i className="status-dot status-dot-ready" />{t('localFirst')}</span>
        <button className="topbar-search" onClick={onOpenCommand}><MagnifyingGlassIcon /><span>{t('searchWorkbench')}</span><kbd>⌘ K</kbd></button>
      </div>
    </header>
  )
}

function TodayPage({ onNavigate, onNotice, providerStatus }: { onNavigate: (view: View) => void; onNotice: (message: string) => void; providerStatus: ProviderStatus | null }) {
  const { t } = useTranslation()
  const { language, providerKind } = useWorkbench()
  const today = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
  return (
    <div className="content-column today-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">{today}</div>
          <h1>{t('todayHeadingFirst')}<br /><em>{t('todayHeadingSecond')}</em></h1>
          <p className="intro-copy">{t('todayIntro')}</p>
        </div>
        <div className="intro-actions">
          <button className="primary-button" onClick={() => onNavigate('capabilities')}><PlusIcon />{t('installFirstCapability')}</button>
          <button className="secondary-button" onClick={() => onNotice(t('commandReady'))}><KeyboardIcon />⌘ K</button>
        </div>
      </div>

      <div className="today-grid">
        <section className="surface surface-empty">
          <div className="surface-heading">
            <div><span className="section-kicker">WORKSPACE</span><h2>{t('todayStart')}</h2></div>
            <span className="count-label">{t('zeroCapabilities')}</span>
          </div>
          <div className="empty-stage">
            <div className="empty-orbit" aria-hidden="true"><span /><span /><span /></div>
            <div className="empty-stage-copy"><strong>{t('noEnabledCapabilities')}</strong><span>{t('installedCapabilitiesAppear')}</span></div>
            <button className="text-button" onClick={() => onNavigate('capabilities')}>{t('browseCapabilities')}<ArrowRightIcon /></button>
          </div>
        </section>

        <section className="surface provider-surface">
          <div className="surface-heading">
            <div><span className="section-kicker">AI PROVIDER</span><h2>{t('unifiedAi')}</h2></div>
            <LightningBoltIcon className="heading-icon" />
          </div>
          <div className="provider-status-line">
            <div className="provider-status-symbol"><LightningBoltIcon /></div>
            <div><strong>{providerStatus?.label ?? providerLabel(t, providerKind)}</strong><span>{providerStatus?.detail ?? t('providerChecking')}</span></div>
            <span className={`pill pill-${providerStatus?.state ?? 'preview'}`}>{providerStateLabel(t, providerStatus?.state)}</span>
          </div>
          <p className="provider-copy">{t('providerCopy')}</p>
          <button className="surface-link" onClick={() => onNavigate('settings')}>{t('viewProviderSettings')}<ChevronRightIcon /></button>
        </section>
      </div>

      <section className="activity-section">
        <div className="section-heading-row"><div><span className="section-kicker">ACTIVITY</span><h2>{t('recentActivity')}</h2></div><span className="muted-label">{t('waitingFirstEvent')}</span></div>
        <div className="activity-empty"><ClockIcon /><span>{t('activityWillAppear')}</span><button className="quiet-button" onClick={() => onNotice(t('activityWritten'))}>{t('learnMore')}</button></div>
      </section>
    </div>
  )
}

function CapabilitiesPage({ onNotice }: { onNotice: (message: string) => void }) {
  const { t } = useTranslation()
  const [importOpen, setImportOpen] = useState(false)
  return (
    <div className="content-column capabilities-page">
      <div className="page-header-row">
        <div><div className="eyebrow">MODULES</div><h1>{t('capabilities')}</h1><p>{t('capabilitiesIntro')}</p></div>
        <button className="primary-button" onClick={() => setImportOpen(true)}><PlusIcon />{t('importCapability')}</button>
      </div>

      <div className="capability-toolbar"><div className="filter-chip active">{t('all')} <span>0</span></div><div className="filter-chip">{t('enabled')} <span>0</span></div><div className="filter-chip">{t('disabled')} <span>0</span></div><div className="toolbar-spacer" /><button className="quiet-button" onClick={() => onNotice(t('hostValidationRequired'))}><CodeIcon />{t('developerGuide')}</button></div>

      <section className="capability-empty">
        <div className="capability-empty-art" aria-hidden="true"><div className="art-window"><span /><span /><span /></div><div className="art-plus"><PlusIcon /></div></div>
        <div className="capability-empty-copy"><h2>{t('quietWorkbench')}</h2><p>{t('capabilityModulesCopy')}</p><button className="text-button" onClick={() => setImportOpen(true)}>{t('importLocalCapability')}<ArrowRightIcon /></button></div>
      </section>

      <div className="capability-note"><LockClosedIcon /><span>{t('trustedPackagesOnly')}</span></div>

      <AnimatePresence>{importOpen && <ImportModal onClose={() => setImportOpen(false)} onNotice={onNotice} />}</AnimatePresence>
    </div>
  )
}

function ImportModal({ onClose, onNotice }: { onClose: () => void; onNotice: (message: string) => void }) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const handleSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) setSelectedName(file.name)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title" initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 6 }}>
        <div className="modal-header"><div><span className="section-kicker">{t('localInstall')}</span><h2 id="import-title">{t('importCapability')}</h2></div><button className="icon-button" onClick={onClose} aria-label={t('close')}><Cross2Icon /></button></div>
        <p className="modal-copy">{t('importCopy')}</p>
        <button className="dropzone" onClick={() => inputRef.current?.click()}><RocketIcon /><strong>{selectedName ?? t('selectLocalPackage')}</strong><span>{selectedName ? t('selectedAwaitingValidation') : t('zipSupported')}</span></button>
        <input ref={inputRef} className="visually-hidden" type="file" accept=".zip,.capability.zip,application/zip" onChange={handleSelect} />
        <div className="modal-footer"><button className="secondary-button" onClick={onClose}>{t('cancel')}</button><button className="primary-button" disabled={!selectedName} onClick={() => { onNotice(t('previewSelectionRecorded')); onClose() }}>{t('continueInstall')}<ArrowRightIcon /></button></div>
      </motion.section>
    </div>
  )
}

function SettingsPage({ onNotice, providerStatus, onSelectProvider, onCheckProvider }: { onNotice: (message: string) => void; providerStatus: ProviderStatus | null; onSelectProvider: (kind: ProviderKind) => Promise<void>; onCheckProvider: () => Promise<ProviderStatus> }) {
  const { t } = useTranslation()
  const { theme, setTheme, language, setLanguage, providerKind } = useWorkbench()
  const [checking, setChecking] = useState(false)
  const [testingProvider, setTestingProvider] = useState(false)

  const runCheck = async () => {
    setChecking(true)
    const nextStatus = await onCheckProvider()
    setChecking(false)
    onNotice(nextStatus.state === 'ready' ? t('providerHealthy') : nextStatus.state === 'error' ? t('providerNeedsAttention') : t('providerCheckIncomplete'))
  }

  const testProvider = async () => {
    setTestingProvider(true)
    try {
      const result = await testSelectedProvider(language)
      onNotice(`${result.provider} · ${result.model} ${t('providerReturned')}`)
    } catch (error) {
      onNotice(error instanceof Error ? error.message : t('providerTestFailed'))
    } finally {
      setTestingProvider(false)
    }
  }

  return (
    <div className="content-column settings-page">
      <div className="page-header-row"><div><div className="eyebrow">{t('preferences')}</div><h1>{t('settings')}</h1><p>{t('settingsIntro')}</p></div></div>

      <section className="settings-section"><div className="settings-section-heading"><span className="settings-number">01</span><div><h2>AI Provider</h2><p>{t('providerShared')}</p></div></div>
        <div className="provider-options">
          {(['codex-api', 'codex-subscription', 'compatible-api'] as ProviderKind[]).map((kind) => (
            <button key={kind} className={`provider-option ${providerKind === kind ? 'selected' : ''}`} onClick={() => void onSelectProvider(kind)}>
              <span className="provider-option-icon">{kind === 'compatible-api' ? <GlobeIcon /> : kind === 'codex-api' ? <LightningBoltIcon /> : <CodeIcon />}</span>
              <span><strong>{providerLabel(t, kind)}</strong><small>{kind === 'codex-api' ? t('apiDescription') : kind === 'codex-subscription' ? t('subscriptionDescription') : t('compatibleDescription')}</small></span>
              {providerKind === kind && <CheckIcon className="selected-check" />}
            </button>
          ))}
        </div>
        <div className="provider-detail"><div className="detail-icon"><UpdateIcon /></div><div><strong>{providerStatus?.label ?? providerLabel(t, providerKind)} · {providerStateLabel(t, providerStatus?.state)}</strong><span>{providerStatus?.detail ?? t('providerStatusLoading')}</span></div><div className="provider-detail-actions"><button className="quiet-button" onClick={runCheck} disabled={checking}>{checking ? t('checkingEllipsis') : t('healthCheck')}<ReloadIcon className={checking ? 'spin' : ''} /></button><button className="quiet-button" onClick={testProvider} disabled={testingProvider}>{testingProvider ? t('testingEllipsis') : t('testCall')}<ArrowRightIcon /></button></div></div>
        <div className="settings-callout"><LockClosedIcon /><div><strong>{t('credentialsStayInHost')}</strong><span>{t('credentialsCopy')}</span></div></div>
      </section>

      <section className="settings-section"><div className="settings-section-heading"><span className="settings-number">02</span><div><h2>{t('appearance')}</h2><p>{t('appearanceIntro')}</p></div></div><div className="theme-options"><button className={`theme-option ${theme === 'light' ? 'selected' : ''}`} onClick={() => setTheme('light')}><span className="theme-preview theme-preview-light"><SunIcon /></span><span><strong>{t('light')}</strong><small>{t('lightDescription')}</small></span>{theme === 'light' && <CheckIcon className="selected-check" />}</button><button className={`theme-option ${theme === 'dark' ? 'selected' : ''}`} onClick={() => setTheme('dark')}><span className="theme-preview theme-preview-dark"><MoonIcon /></span><span><strong>{t('dark')}</strong><small>{t('darkDescription')}</small></span>{theme === 'dark' && <CheckIcon className="selected-check" />}</button></div></section>

      <section className="settings-section"><div className="settings-section-heading"><span className="settings-number">03</span><div><h2>{t('language')}</h2><p>{t('languageIntro')}</p></div></div><div className="theme-options language-options"><button className={`theme-option ${language === 'zh' ? 'selected' : ''}`} onClick={() => setLanguage('zh')}><span className="language-preview">中</span><span><strong>{t('chinese')}</strong><small>{t('chineseDescription')}</small></span>{language === 'zh' && <CheckIcon className="selected-check" />}</button><button className={`theme-option ${language === 'en' ? 'selected' : ''}`} onClick={() => setLanguage('en')}><span className="language-preview">EN</span><span><strong>{t('english')}</strong><small>{t('englishDescription')}</small></span>{language === 'en' && <CheckIcon className="selected-check" />}</button></div></section>

      <section className="settings-section"><div className="settings-section-heading"><span className="settings-number">04</span><div><h2>{t('localData')}</h2><p>{t('localDataIntro')}</p></div></div><div className="data-row"><div className="data-row-icon"><FileTextIcon /></div><div><strong>{t('defaultWorkspace')}</strong><span>{t('personalWorkspaceLocal')}</span></div><span className="data-row-value">{t('ready')}</span><ChevronRightIcon /></div></section>
    </div>
  )
}

function CommandPalette({ onClose, onNavigate, onNotice, theme, onToggleTheme }: { onClose: () => void; onNavigate: (view: View) => void; onNotice: (message: string) => void; theme: Theme; onToggleTheme: () => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])

  const commands = useMemo(() => [
    { label: t('openToday'), hint: t('navigation'), icon: DashboardIcon, action: () => onNavigate('today') },
    { label: t('openCapabilities'), hint: t('navigation'), icon: GridIcon, action: () => onNavigate('capabilities') },
    { label: t('openSettings'), hint: t('navigation'), icon: GearIcon, action: () => onNavigate('settings') },
    { label: theme === 'light' ? t('switchToDark') : t('switchToLight'), hint: t('appearanceHint'), icon: theme === 'light' ? MoonIcon : SunIcon, action: () => { onToggleTheme(); onClose() } },
    { label: t('viewPlatformStatus'), hint: t('system'), icon: LightningBoltIcon, action: () => { onNavigate('settings'); onNotice(t('providerLocated')) } },
  ].filter((command) => command.label.toLowerCase().includes(query.toLowerCase())), [onNavigate, onNotice, onToggleTheme, onClose, query, t, theme])

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

  return <div className="palette-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><motion.section className="command-palette" role="dialog" aria-modal="true" initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.99 }}><div className="palette-search"><MagnifyingGlassIcon /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('actionPlaceholder')} /><kbd>ESC</kbd></div><div className="palette-list">{commands.length > 0 ? commands.map((command, index) => { const Icon = command.icon; return <button key={command.label} className={`palette-item ${index === highlightedIndex ? 'is-highlighted' : ''}`} onMouseEnter={() => setHighlightedIndex(index)} onClick={command.action}><span className="palette-item-icon"><Icon /></span><span>{command.label}</span><small>{command.hint}</small><ChevronRightIcon /></button> }) : <div className="palette-no-results">{t('noMatchingActions')}</div>}</div><div className="palette-footer"><span><KeyboardIcon /> {t('arrowKeysToSelect')}</span><span><EnterIcon /> {t('enterToRun')}</span></div></motion.section></div>
}

export { App }
