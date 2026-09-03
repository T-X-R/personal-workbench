# Personal Workbench

Personal Workbench is a local-first desktop host for installable capabilities. Reports, tables, journals, and future agents enter through a stable platform contract instead of being built into the shell.

The initial release includes the React interface and a Tauri 2 desktop host. The host persists the selected AI Provider, manages Capability manifests and lifecycle state, enforces permissions, and keeps API credentials outside Capability code.

## Current platform foundation

- Fixed desktop shell with an independently scrolling content area.
- Simplified Chinese and English interfaces powered by `i18next` and `react-i18next`.
- Persistent theme, language, and globally selected AI Provider preferences.
- Capability registration, listing, enablement, disablement, and uninstallation.
- A host-owned `ai.invoke` interface guarded by installation, enablement, and `ai.invoke` permission checks.
- Direct Responses-compatible requests for managed API key Providers.
- Codex CLI execution for Codex subscription tasks.

Local `.capability.zip` extraction and dynamic code loading are intentionally deferred until the first production Capability is implemented.

## Run the development shell

```sh
npm install
npm run dev
```

The browser preview renders the complete shell but never reads credentials or invokes a model. Native Provider access is available only in the Tauri desktop app.

## Select an AI Provider

Open **Settings → AI Provider** and choose one of the available sources:

- **Managed API key** imports the selected model, Responses endpoint, and credential source from `~/.codex/api.config.toml`. The desktop host performs the request and shares this Provider with every authorized Capability.
- **Codex subscription** uses `~/.codex/config.toml` and the login session managed by the local Codex CLI.

Workbench persists only the Provider selection. An API key remains inside the desktop host and is never returned to the frontend, copied into the platform registry, or passed to a Capability. Workbench does not read Codex `auth.json`.

## Invoke AI from a Capability

A Capability declares the `ai.invoke` permission in its manifest and calls only the Capability Host:

```ts
import { createCapabilityHost } from './capability-host'

const host = createCapabilityHost(manifest.id)
const result = await host.ai.invoke('Summarize today\'s activity')
```

The request contains neither a `providerKind` nor an API key. The host verifies the Capability and resolves the globally selected Provider. Changing that selection automatically affects every installed Capability without additional user configuration.

## Build and install the desktop app

Install Rust from <https://rustup.rs>, then run:

```sh
npm run desktop:dev
npm run desktop:build
```

The release bundle is created at:

- `src-tauri/target/release/bundle/macos/Workbench.app`

Install it into `/Applications`:

```sh
npm run desktop:install
```

After later source changes, rebuild and replace the installed app with one command:

```sh
npm run desktop:update
```

Build a DMG separately when needed:

```sh
npm run desktop:build:dmg
```

## Verification

```sh
npm run build
cd src-tauri
cargo test --offline
cargo clippy --offline -- -D warnings
```

Provider contract tests use a local fake HTTP endpoint and never invoke a real model. All Rust tests live under `src-tauri/tests/` and use the `*_test.rs` naming convention.

See [CONTEXT.md](CONTEXT.md) for the project language and domain definitions.
