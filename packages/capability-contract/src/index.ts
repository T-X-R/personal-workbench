import type { ComponentType } from 'react'

export type AiInvocationResult = {
  provider: string
  model: string
  output: string
}

export type CapabilityEntrypoint = 'page' | 'command' | 'widget' | 'job'
export type CapabilityPermission = 'storage' | 'activity.read' | 'activity.write' | 'ai.invoke' | 'codex.sessions.read' | 'documents.publish'
export type CapabilityLanguage = 'zh' | 'en'
export type CapabilityTheme = 'light' | 'dark'

export type CapabilityEnvironment = Readonly<{
  language: CapabilityLanguage
  locale: 'zh-CN' | 'en-US'
  theme: CapabilityTheme
}>

export type CapabilityManifestTranslation = {
  name: string
  description?: string
}

export type CapabilityManifest = {
  id: string
  version: string
  name: string
  description?: string
  icon?: string
  locales?: Partial<Record<CapabilityLanguage, CapabilityManifestTranslation>>
  entrypoints: CapabilityEntrypoint[]
  permissions: CapabilityPermission[]
  minPlatformVersion: string
}

export type InstalledCapability = {
  manifest: CapabilityManifest
  enabled: boolean
}

export type ActivityEventInput = {
  type: string
  title: string
  payload?: unknown
  sensitivity?: 'normal' | 'private'
}

export type CapabilityStorage = {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}

export type CodexSessionTextFile = {
  name: string
  archived: boolean
  content: string
}

export type CodexDailySessionFiles = {
  date: string
  files: CodexSessionTextFile[]
}

export type DocumentPublication = {
  key: string
  title: string
  collectionKey: string
  collectionName: string
  documentDate: string
  content: string
}

export type CapabilityHost = {
  environment: {
    getSnapshot(): CapabilityEnvironment
    subscribe(listener: () => void): () => void
  }
  ai: {
    invoke(input: string): Promise<AiInvocationResult>
  }
  codex: {
    sessions: {
      readTodayFiles(): Promise<CodexDailySessionFiles>
    }
  }
  storage: CapabilityStorage
  documents: {
    publish(document: DocumentPublication): Promise<void>
  }
  activity: {
    write(event: ActivityEventInput): Promise<void>
  }
}

export type CapabilityPageProps = {
  host: CapabilityHost
}

export type CapabilityModule = {
  manifest: CapabilityManifest
  Page: ComponentType<CapabilityPageProps>
}
