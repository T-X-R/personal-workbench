import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { CapabilityLanguage, CapabilityManifest, CapabilityModule, CapabilityPageProps } from '../../packages/capability-contract/src'
import manifestJson from './manifest.json'
import { migrateDiaryEntriesToLibrary, persistDiaryEntry, type DiaryEntry } from './diary-store'
import './styles.css'

const manifest: CapabilityManifest = manifestJson

const messages = {
  zh: {
    eyebrow: '私人记录',
    title: '日记',
    subtitle: '给今天留一点安静的空间。',
    newEntry: '＋ 新日记',
    recent: '最近记录',
    emptyList: '还没有记录',
    emptyListHint: '从今天开始。',
    untitled: '无题',
    emptyEntry: '空白日记',
    titlePlaceholder: '今天想记下什么？',
    contentPlaceholder: '写下此刻的想法、见闻或感受…',
    localOnly: '只保存在你的设备上',
    delete: '删除',
    save: '保存日记',
    saving: '保存中…',
    loading: '正在打开日记…',
    writeBeforeSave: '写下一点内容再保存。',
    saved: '已保存',
    saveFailed: '保存失败，请稍后重试。',
    deleted: '已删除',
    deleteFailed: '删除失败，请稍后重试。',
    listLabel: '日记列表',
    titleLabel: '日记标题',
    contentLabel: '日记内容',
  },
  en: {
    eyebrow: 'PRIVATE NOTES',
    title: 'Journal',
    subtitle: 'Leave a quiet space for today.',
    newEntry: '+ New entry',
    recent: 'Recent entries',
    emptyList: 'No entries yet',
    emptyListHint: 'Start with today.',
    untitled: 'Untitled',
    emptyEntry: 'Blank entry',
    titlePlaceholder: 'What would you like to remember?',
    contentPlaceholder: 'Write down a thought, a moment, or how today felt…',
    localOnly: 'Saved only on this device',
    delete: 'Delete',
    save: 'Save entry',
    saving: 'Saving…',
    loading: 'Opening your journal…',
    writeBeforeSave: 'Write something before saving.',
    saved: 'Saved',
    saveFailed: 'Could not save. Please try again.',
    deleted: 'Deleted',
    deleteFailed: 'Could not delete. Please try again.',
    listLabel: 'Journal entries',
    titleLabel: 'Entry title',
    contentLabel: 'Entry content',
  },
} satisfies Record<CapabilityLanguage, Record<string, string>>

type Notice = 'writeBeforeSave' | 'saved' | 'saveFailed' | 'deleted' | 'deleteFailed'

function todayKey() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function formatDate(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', weekday: 'short' }).format(new Date(`${date}T12:00:00`))
}

function createEntry(): DiaryEntry {
  const now = new Date().toISOString()
  return { id: `${Date.now()}`, date: todayKey(), title: '', content: '', updatedAt: now }
}

function DiaryPage({ host }: CapabilityPageProps) {
  const environment = useSyncExternalStore(host.environment.subscribe, host.environment.getSnapshot, host.environment.getSnapshot)
  const copy = messages[environment.language]
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DiaryEntry>(() => createEntry())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    let cancelled = false
    host.storage.get<DiaryEntry[]>('entries').then((saved) => {
      if (cancelled) return
      const nextEntries = Array.isArray(saved) ? saved : []
      setEntries(nextEntries)
      if (nextEntries[0]) {
        setSelectedId(nextEntries[0].id)
        setDraft(nextEntries[0])
      }
      void migrateDiaryEntriesToLibrary(host, nextEntries, environment.language).catch(() => undefined)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [host])

  const sortedEntries = useMemo(() => [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [entries])

  const selectEntry = (entry: DiaryEntry) => {
    setSelectedId(entry.id)
    setDraft(entry)
    setNotice(null)
  }

  const newEntry = () => {
    setSelectedId(null)
    setDraft(createEntry())
    setNotice(null)
  }

  const saveEntry = async () => {
    if (!draft.title.trim() && !draft.content.trim()) {
      setNotice('writeBeforeSave')
      return
    }
    setSaving(true)
    const nextEntry = { ...draft, title: draft.title.trim(), updatedAt: new Date().toISOString() }
    try {
      const nextEntries = await persistDiaryEntry(host, entries, nextEntry, copy.untitled)
      setEntries(nextEntries)
      setSelectedId(nextEntry.id)
      setDraft(nextEntry)
      setNotice('saved')
    } catch {
      setNotice('saveFailed')
    } finally {
      setSaving(false)
    }
  }

  const deleteEntry = async () => {
    if (!selectedId) return
    const nextEntries = entries.filter((entry) => entry.id !== selectedId)
    try {
      await host.storage.set('entries', nextEntries)
      setEntries(nextEntries)
      if (nextEntries[0]) {
        setSelectedId(nextEntries[0].id)
        setDraft(nextEntries[0])
      } else {
        setSelectedId(null)
        setDraft(createEntry())
      }
      setNotice('deleted')
    } catch {
      setNotice('deleteFailed')
    }
  }

  if (loading) return <div className="diary-loading" lang={environment.locale} data-theme={environment.theme}>{copy.loading}</div>

  return (
    <div className="diary-page" lang={environment.locale} data-theme={environment.theme}>
      <header className="diary-header">
        <div><span className="diary-eyebrow">{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.subtitle}</p></div>
        <button className="diary-new-button" onClick={newEntry}>{copy.newEntry}</button>
      </header>
      <div className="diary-layout">
        <aside className="diary-list" aria-label={copy.listLabel}>
          <div className="diary-list-heading"><span>{copy.recent}</span><small>{entries.length}</small></div>
          {sortedEntries.length === 0 && <div className="diary-list-empty">{copy.emptyList}<br />{copy.emptyListHint}</div>}
          {sortedEntries.map((entry) => <button key={entry.id} className={`diary-list-item ${selectedId === entry.id ? 'selected' : ''}`} onClick={() => selectEntry(entry)}><strong>{entry.title || copy.untitled}</strong><span>{formatDate(entry.date, environment.locale)}</span><small>{entry.content || copy.emptyEntry}</small></button>)}
        </aside>
        <section className="diary-editor">
          <div className="diary-editor-meta"><span>{formatDate(draft.date, environment.locale)}</span>{notice && <em>{copy[notice]}</em>}</div>
          <input className="diary-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={copy.titlePlaceholder} aria-label={copy.titleLabel} />
          <textarea className="diary-content" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder={copy.contentPlaceholder} aria-label={copy.contentLabel} />
          <div className="diary-editor-footer"><span>{copy.localOnly}</span><div>{selectedId && <button className="diary-delete" onClick={() => void deleteEntry()}>{copy.delete}</button>}<button className="diary-save" onClick={() => void saveEntry()} disabled={saving}>{saving ? copy.saving : copy.save}</button></div></div>
        </section>
      </div>
    </div>
  )
}

const diaryCapability: CapabilityModule = {
  manifest,
  Page: (props: CapabilityPageProps) => <DiaryPage {...props} />,
}

export default diaryCapability

export { DiaryPage, manifest }
