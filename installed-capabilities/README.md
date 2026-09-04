# Installed capabilities

This directory defines the boundary for installed capabilities. It is separate from the distributable package sources in `capabilities/`. Installing, disabling, or uninstalling a capability changes only its registry entry; it does not modify capability data, the platform core, other Capability Packages, or their data.

The desktop app currently records installation state in the Capability Registry under the application data directory. The browser preview simulates the same registry in local storage. This directory is reserved for packages produced by a future local-directory or archive installer and must not become a direct dependency of platform core code.
