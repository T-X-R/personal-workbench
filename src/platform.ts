import { invoke } from '@tauri-apps/api/core'
import type { Language } from './i18n'

export type ProviderKind = 'codex-api' | 'codex-subscription' | 'compatible-api'

export type ProviderState = 'configured' | 'ready' | 'preview' | 'error'

export type ProviderStatus = {
  kind: ProviderKind
  state: ProviderState
  label: string
  detail: string
}

export type AiInvocationResult = {
  provider: string
  model: string
  output: string
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

/**
 * Browser preview stays honest about the native boundary. The Tauri adapter
 * can replace this function without changing any capability UI.
 */
function providerLabel(kind: ProviderKind, language: Language): string {
  if (kind === 'codex-api') return language === 'en' ? 'Managed API key' : 'API key 托管'
  if (kind === 'codex-subscription') return language === 'en' ? 'Codex subscription' : 'Codex 订阅'
  return language === 'en' ? 'Compatible endpoint' : '兼容端点'
}

export async function getProviderStatus(kind: ProviderKind, language: Language): Promise<ProviderStatus> {
  const label = providerLabel(kind, language)

  if (window.__TAURI_INTERNALS__) {
    try {
      return await invoke<ProviderStatus>('provider_status', { kind, language })
    } catch {
      return {
        kind,
        state: 'error',
        label,
        detail: language === 'en' ? 'The desktop host is connected, but the Provider check failed' : '桌面宿主已连接，但 Provider 检查失败',
      }
    }
  }

  return {
    kind,
    state: 'preview',
    label,
    detail: language === 'en' ? 'Preview mode, waiting for the desktop host' : '预览模式，等待桌面宿主连接',
  }
}

export async function getSelectedProvider(): Promise<ProviderKind> {
  if (!window.__TAURI_INTERNALS__) {
    return (window.localStorage.getItem('personal-workbench-provider') as ProviderKind | null) ?? 'codex-api'
  }
  return invoke<ProviderKind>('get_selected_provider')
}

export async function setSelectedProvider(kind: ProviderKind): Promise<void> {
  if (!window.__TAURI_INTERNALS__) {
    window.localStorage.setItem('personal-workbench-provider', kind)
    return
  }
  await invoke('set_selected_provider', { kind })
}

export async function checkProviderHealth(kind: ProviderKind, language: Language): Promise<ProviderStatus> {
  if (!window.__TAURI_INTERNALS__) return getProviderStatus(kind, language)
  try {
    return await invoke<ProviderStatus>('provider_health_check', { language })
  } catch {
    return {
      kind,
      state: 'error',
      label: providerLabel(kind, language),
      detail: language === 'en' ? 'The desktop host is connected, but the Provider health check failed' : '桌面宿主已连接，但 Provider 健康检查失败',
    }
  }
}

export async function testSelectedProvider(language: Language): Promise<AiInvocationResult> {
  if (!window.__TAURI_INTERNALS__) {
    throw new Error('AI Host is only available in the desktop app')
  }
  try {
    return await invoke<AiInvocationResult>('test_selected_provider', { language })
  } catch (error) {
    throw new Error(typeof error === 'string' ? error : language === 'en' ? 'Provider invocation failed' : 'Provider 调用失败')
  }
}
