# Capability Contract

This package is the stable type boundary between Capability Packages and the Workbench. A capability depends on the Manifest, Host, storage, and page-entry types defined here, without depending on shell pages or the Tauri implementation.

## Follow the platform language and theme

The platform publishes its current language and theme through `host.environment`. A Capability Package owns its translations and styles and subscribes to environment changes. It must not read the platform's Zustand store, i18next instance, or page DOM.

```tsx
import { useSyncExternalStore } from 'react'
import type { CapabilityPageProps } from '../../packages/capability-contract/src'

export function CapabilityPage({ host }: CapabilityPageProps) {
  const environment = useSyncExternalStore(
    host.environment.subscribe,
    host.environment.getSnapshot,
    host.environment.getSnapshot,
  )

  const copy = messages[environment.language]
  return (
    <main lang={environment.locale} data-theme={environment.theme}>
      <h1>{copy.title}</h1>
    </main>
  )
}
```

`getSnapshot()` returns:

- `language`: `zh` or `en`, used to select the package's own translated copy.
- `locale`: `zh-CN` or `en-US`, used to format dates, numbers, and other locale-sensitive values.
- `theme`: `light` or `dark`, used to select the package theme.

When the platform language or theme changes, `subscribe` immediately notifies every open capability. Capability Packages can use platform CSS tokens such as `--surface`, `--ink`, `--line`, and `--accent` directly instead of duplicating platform theme state.

```css
.capability-page { background: var(--surface); color: var(--ink); color-scheme: light; }
.capability-page[data-theme="dark"] { color-scheme: dark; }
```

A Capability Package should also provide a name and description under `locales.zh` and `locales.en` in `manifest.json`. The platform uses these values in the capability catalog, Today entry point, and top bar. If a localized field is missing, the platform falls back to the top-level Manifest `name` or `description`.
