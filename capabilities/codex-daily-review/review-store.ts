import type { AiInvocationResult, CapabilityHost, CapabilityLanguage } from '../../packages/capability-contract/src'
import { buildSummaryPrompt, parseDailySessions, type DailySessionReviewSource } from './session-parser.ts'

export type ReviewPhase = 'idle' | 'scanning' | 'summarizing' | 'ready' | 'empty' | 'error'

export type DailyReviewSnapshot = Readonly<{
  date: string
  phase: ReviewPhase
  source: DailySessionReviewSource | null
  summary: AiInvocationResult | null
  error: string | null
}>

export type DailyReviewStore = Readonly<{
  getSnapshot(): DailyReviewSnapshot
  subscribe(listener: () => void): () => void
  restore(host: CapabilityHost): Promise<void>
  runReview(host: CapabilityHost, language: CapabilityLanguage): Promise<void>
}>

type PersistedDailyReview = Readonly<{
  date: string
  source: DailySessionReviewSource
  summary: AiInvocationResult
}>

const REVIEW_STORAGE_KEY = 'latest-review'

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function idleSnapshot(date: string): DailyReviewSnapshot {
  return { date, phase: 'idle', source: null, summary: null, error: null }
}

export function createDailyReviewStore(now: () => Date = () => new Date()): DailyReviewStore {
  let snapshot = idleSnapshot(dateKey(now()))
  let activeRun: Promise<void> | null = null
  let restoreRun: Promise<void> | null = null
  let restored = false
  let runId = 0
  const listeners = new Set<() => void>()

  const syncDate = () => {
    const date = dateKey(now())
    if (snapshot.date === date) return
    runId += 1
    activeRun = null
    restoreRun = null
    restored = false
    snapshot = idleSnapshot(date)
  }

  const setSnapshot = (next: DailyReviewSnapshot) => {
    snapshot = next
    listeners.forEach((listener) => listener())
  }

  const getSnapshot = () => {
    syncDate()
    return snapshot
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  const restore = (host: CapabilityHost): Promise<void> => {
    syncDate()
    if (restored) return Promise.resolve()
    if (restoreRun) return restoreRun

    const currentRun = runId
    const reviewDate = snapshot.date
    const run = (async () => {
      try {
        const saved = await host.storage.get<PersistedDailyReview>(REVIEW_STORAGE_KEY)
        if (currentRun !== runId || snapshot.phase !== 'idle') return
        if (saved?.date === reviewDate && saved.source && saved.summary) {
          setSnapshot({ date: reviewDate, phase: 'ready', source: saved.source, summary: saved.summary, error: null })
        } else if (saved) {
          await host.storage.remove(REVIEW_STORAGE_KEY)
        }
      } finally {
        if (currentRun === runId) restored = true
        if (restoreRun === run) restoreRun = null
      }
    })()

    restoreRun = run
    return run
  }

  const runReview = (host: CapabilityHost, language: CapabilityLanguage): Promise<void> => {
    syncDate()
    if (activeRun) return activeRun

    const currentRun = ++runId
    restored = true
    const reviewDate = snapshot.date
    setSnapshot({ date: reviewDate, phase: 'scanning', source: null, summary: null, error: null })

    const run = (async () => {
      try {
        const files = await host.codex.sessions.readTodayFiles()
        const source = parseDailySessions(files.files)
        if (currentRun !== runId) return

        if (source.sessions.length === 0) {
          setSnapshot({ date: reviewDate, phase: 'empty', source, summary: null, error: null })
          return
        }

        setSnapshot({ date: reviewDate, phase: 'summarizing', source, summary: null, error: null })
        const summary = await host.ai.invoke(buildSummaryPrompt(files.date, source.sessions, language))
        if (currentRun !== runId) return
        setSnapshot({ date: reviewDate, phase: 'ready', source, summary, error: null })
        await Promise.all([
          host.storage.set<PersistedDailyReview>(REVIEW_STORAGE_KEY, { date: reviewDate, source, summary }),
          host.documents.publish({
            key: reviewDate,
            title: language === 'zh' ? `${reviewDate} Codex 每日总结` : `${reviewDate} Codex daily review`,
            collectionKey: 'daily-reviews',
            collectionName: language === 'zh' ? '每日回顾' : 'Daily reviews',
            documentDate: reviewDate,
            content: summary.output,
          }),
        ])
      } catch (reason) {
        if (currentRun !== runId) return
        const fallback = language === 'zh' ? '生成总结失败' : 'Could not generate the review'
        setSnapshot({ date: reviewDate, phase: 'error', source: snapshot.source, summary: null, error: reason instanceof Error ? reason.message : fallback })
      } finally {
        if (currentRun === runId && activeRun === run) activeRun = null
      }
    })()

    activeRun = run
    return run
  }

  return Object.freeze({ getSnapshot, subscribe, restore, runReview })
}

export const codexDailyReviewStore = createDailyReviewStore()
