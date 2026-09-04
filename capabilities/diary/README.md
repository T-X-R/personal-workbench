# Diary Capability

Diary is an independent Capability Package. Its editor, entry list, persistence, and activity-event logic all live inside this package.

Data is written to the `com.personal.diary` namespace through `CapabilityHost.storage`. Uninstalling the capability removes only its installation state and does not delete data in that namespace. Reinstalling it restores access to existing entries.

The package owns its interface copy and follows the platform's Chinese or English setting through `CapabilityHost.environment`. Dates use the locale supplied by the platform. The page also follows the platform's Light or Dark state and reuses platform CSS tokens, so preference changes take effect without restarting or reopening Diary.
