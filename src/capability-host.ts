import { invoke } from '@tauri-apps/api/core'
import type { AiInvocationResult } from './platform'

export type CapabilityEntrypoint = 'page' | 'command' | 'widget' | 'job'
export type CapabilityPermission = 'storage' | 'activity.read' | 'activity.write' | 'ai.invoke'

export type CapabilityManifest = {
  id: string
  version: string
  name: string
  description?: string
  entrypoints: CapabilityEntrypoint[]
  permissions: CapabilityPermission[]
  minPlatformVersion: string
}

export type InstalledCapability = {
  manifest: CapabilityManifest
  enabled: boolean
}

export type CapabilityHost = {
  ai: {
    invoke(input: string): Promise<AiInvocationResult>
  }
}

export function createCapabilityHost(capabilityId: string): CapabilityHost {
  if (!capabilityId.trim()) throw new Error('Capability ID is required')

  return Object.freeze({
    ai: Object.freeze({
      async invoke(input: string) {
        try {
          return await invoke<AiInvocationResult>('capability_ai_invoke', {
            request: { capabilityId, input },
          })
        } catch (error) {
          throw new Error(typeof error === 'string' ? error : '能力调用 AI 失败')
        }
      },
    }),
  })
}

export async function installCapability(manifest: CapabilityManifest): Promise<InstalledCapability> {
  return invoke<InstalledCapability>('install_capability', { manifest })
}

export async function listCapabilities(): Promise<InstalledCapability[]> {
  return invoke<InstalledCapability[]>('list_capabilities')
}

export async function setCapabilityEnabled(id: string, enabled: boolean): Promise<void> {
  await invoke('set_capability_enabled', { id, enabled })
}

export async function uninstallCapability(id: string): Promise<void> {
  await invoke('uninstall_capability', { id })
}
