import {
  installCapability as installNativeCapability,
  listCapabilities as listNativeCapabilities,
  setCapabilityEnabled as setNativeCapabilityEnabled,
  uninstallCapability as uninstallNativeCapability,
} from './capability-host'
import type { CapabilityModule, InstalledCapability } from '../packages/capability-contract/src'

export type { CapabilityModule } from '../packages/capability-contract/src'

const browserInstalledKey = 'personal-workbench-installed-capabilities'

const discoveredModules = import.meta.glob('../capabilities/*/index.tsx', {
  eager: true,
  import: 'default',
}) as Record<string, CapabilityModule>

const availableCapabilities = Object.values(discoveredModules)

function isDesktopHost(): boolean {
  return Boolean(window.__TAURI_INTERNALS__)
}

function readBrowserInstalledIds(): string[] {
  try {
    const raw = window.localStorage.getItem(browserInstalledKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeBrowserInstalledIds(ids: string[]): void {
  window.localStorage.setItem(browserInstalledKey, JSON.stringify(ids))
}

export function listAvailableCapabilities(): CapabilityModule[] {
  return availableCapabilities
}

export function getCapabilityModule(id: string): CapabilityModule | undefined {
  return availableCapabilities.find((capability) => capability.manifest.id === id)
}

export async function listInstalledCapabilityPackages(): Promise<InstalledCapability[]> {
  if (isDesktopHost()) return listNativeCapabilities()

  const installedIds = new Set(readBrowserInstalledIds())
  return availableCapabilities
    .filter((capability) => installedIds.has(capability.manifest.id))
    .map((capability) => ({ manifest: capability.manifest, enabled: true }))
}

export async function installCapabilityPackage(id: string): Promise<InstalledCapability> {
  const capability = getCapabilityModule(id)
  if (!capability) throw new Error('找不到可安装的能力包')

  if (isDesktopHost()) return installNativeCapability(capability.manifest)

  const installedIds = new Set(readBrowserInstalledIds())
  if (installedIds.has(id)) throw new Error('能力已经安装')
  installedIds.add(id)
  writeBrowserInstalledIds([...installedIds])
  const disabledIds = new Set(readBrowserDisabledIds())
  disabledIds.delete(id)
  window.localStorage.setItem(browserDisabledKey, JSON.stringify([...disabledIds]))
  return { manifest: capability.manifest, enabled: true }
}

export async function setCapabilityPackageEnabled(id: string, enabled: boolean): Promise<void> {
  if (isDesktopHost()) {
    await setNativeCapabilityEnabled(id, enabled)
    return
  }

  const installedIds = new Set(readBrowserInstalledIds())
  if (!installedIds.has(id)) throw new Error('能力尚未安装')
  // The browser preview has no separate registry record for disabled packages.
  // Keep the state in a second key so package data remains untouched.
  const disabledIds = new Set(readBrowserDisabledIds())
  if (enabled) disabledIds.delete(id)
  else disabledIds.add(id)
  window.localStorage.setItem(browserDisabledKey, JSON.stringify([...disabledIds]))
}

const browserDisabledKey = 'personal-workbench-disabled-capabilities'

function readBrowserDisabledIds(): string[] {
  try {
    const raw = window.localStorage.getItem(browserDisabledKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export async function getInstalledCapabilityPackagesWithState(): Promise<InstalledCapability[]> {
  const installed = await listInstalledCapabilityPackages()
  if (isDesktopHost()) return installed
  const disabledIds = new Set(readBrowserDisabledIds())
  return installed.map((capability) => ({ ...capability, enabled: !disabledIds.has(capability.manifest.id) }))
}

export async function uninstallCapabilityPackage(id: string): Promise<void> {
  if (isDesktopHost()) {
    await uninstallNativeCapability(id)
    return
  }

  const installedIds = new Set(readBrowserInstalledIds())
  if (!installedIds.delete(id)) throw new Error('能力尚未安装')
  writeBrowserInstalledIds([...installedIds])
  const disabledIds = new Set(readBrowserDisabledIds())
  disabledIds.delete(id)
  window.localStorage.setItem(browserDisabledKey, JSON.stringify([...disabledIds]))
}
