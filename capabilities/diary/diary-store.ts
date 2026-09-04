import type { CapabilityHost, CapabilityLanguage } from '../../packages/capability-contract/src'

export type DiaryEntry = {
  id: string
  date: string
  title: string
  content: string
  updatedAt: string
}

const LIBRARY_MIGRATION_KEY = 'document-library-migration-v1'

function diaryDocument(entry: DiaryEntry, language: CapabilityLanguage) {
  const untitled = language === 'zh' ? '无题' : 'Untitled'
  const title = entry.title || untitled
  return {
    key: entry.id,
    title,
    collectionKey: 'diary',
    collectionName: language === 'zh' ? '日记' : 'Journal',
    documentDate: entry.date,
    content: `# ${title}${entry.content ? `\n\n${entry.content}` : ''}`,
  }
}

export async function persistDiaryEntry(
  host: CapabilityHost,
  entries: DiaryEntry[],
  entry: DiaryEntry,
  untitled: string,
): Promise<DiaryEntry[]> {
  const nextEntries = [entry, ...entries.filter((item) => item.id !== entry.id)]
  await host.storage.set('entries', nextEntries)
  const language = host.environment.getSnapshot().language
  await Promise.all([
    host.activity.write({
      type: 'diary.entry.saved',
      title: entry.title || untitled,
      payload: { entryId: entry.id, date: entry.date },
    }),
    host.documents.publish(diaryDocument(entry, language)),
  ])
  return nextEntries
}

export async function migrateDiaryEntriesToLibrary(
  host: CapabilityHost,
  entries: DiaryEntry[],
  language: CapabilityLanguage,
): Promise<void> {
  if (await host.storage.get<boolean>(LIBRARY_MIGRATION_KEY)) return
  await Promise.all(entries.map((entry) => host.documents.publish(diaryDocument(entry, language))))
  await host.storage.set(LIBRARY_MIGRATION_KEY, true)
}
