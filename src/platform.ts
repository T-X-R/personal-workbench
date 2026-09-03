import { invoke } from '@tauri-apps/api/core'

export type ProviderKind = 'codex-api' | 'codex-subscription' | 'compatible-api'

export type ProviderState = 'ready' | 'preview' | 'error'

export type ProviderStatus = {
  kind: ProviderKind
  state: ProviderState
  label: string
  detail: string
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
export async function getProviderStatus(kind: ProviderKind): Promise<ProviderStatus> {
  const labels: Record<ProviderKind, string> = {
    'codex-api': 'Codex API key',
    'codex-subscription': 'Codex 订阅',
    'compatible-api': '兼容端点',
  }

  if (window.__TAURI_INTERNALS__) {
    try {
      return await invoke<ProviderStatus>('provider_status', { kind })
    } catch {
      return {
        kind,
        state: 'error',
        label: labels[kind],
        detail: '桌面宿主已连接，但 Provider 检查失败',
      }
    }
  }

  return {
    kind,
    state: 'preview',
    label: labels[kind],
    detail: '预览模式，等待桌面宿主连接',
  }
}

export async function runAgent(task: string, providerKind: ProviderKind): Promise<string> {
  if (!window.__TAURI_INTERNALS__) {
    throw new Error('Agent Host is only available in the desktop app')
  }
  return invoke<string>('run_agent', { request: { task, providerKind } })
}
