# Personal Workbench

Personal Workbench is a local-first host for independently installed capabilities. The Workbench remains useful as a shell even when no business capability is installed.

## Language

**Workbench**:
The host product that provides navigation, global settings, commands, and lifecycle management for installed capabilities.
_Avoid_: App shell, container

**Capability**:
An independently installed, enabled, disabled, and uninstalled unit of user-facing functionality, such as a report, table, or journal.
_Avoid_: Feature, plugin

**Capability Package**:
The distributable form of a Capability, containing its identity, version, entry points, visible interface, and requested permissions.
_Avoid_: Extension bundle

**Capability Registry**:
The Workbench record of installed Capability Packages and their version, compatibility, and enabled state.

**Installation**:
The act of validating and registering a Capability Package. A newly installed Capability is enabled by default and does not require separate AI Provider configuration.

**Enablement**:
The state that permits an installed Capability to appear in Workbench entry points and respond to commands.

**Disablement**:
The state that retains a Capability Package and its data while preventing it from participating in Workbench execution.

**Uninstallation**:
The removal of a Capability Package. User data is retained unless the user separately confirms its deletion.

**Capability Host**:
The controlled environment through which a Capability accesses Workbench resources. A Capability never depends on the internal structure of Workbench pages.

**Activity Event**:
A user-visible fact recorded by the Workbench or an authorized Capability for later review or agent-assisted summarization.

**Agent Capability**:
A Capability that reads explicitly authorized Activity Events and produces traceable, reversible generation or organization actions.

**AI Provider**:
The platform-managed source for model invocations, defined by a protocol, endpoint, model, and credential reference. A Codex subscription session is not a general-purpose AI Provider.

**Model Gateway**:
The single model invocation interface exposed to Capabilities. It checks installation, enablement, and `ai.invoke` permission before resolving the globally selected AI Provider.

**Credential Broker**:
The platform mechanism that resolves credentials for a Provider adapter without exposing raw tokens or API keys to Capability Packages.

**Agent Host**:
The platform interface for agent work involving tools, input references, and execution progress. It may use the Model Gateway or a dedicated Agent Runtime.

**Codex Agent Runtime**:
The runtime that executes agent tasks through the local Codex CLI and its subscription session and sandbox policy.

**Workspace**:
The personal context shared by Capabilities and Activity Events. The first release has one default Workspace without coupling Capabilities to specific pages.
