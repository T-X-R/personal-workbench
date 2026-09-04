# Diary Capability

Diary is an independent Capability Package. Its editor, entry list, persistence, and activity-event logic all live inside this package.

Data is written to the `com.personal.diary` namespace through `CapabilityHost.storage`, and every saved entry is submitted through the Document Gateway under the stable `diary` collection. Existing entries are migrated once when the capability opens. Uninstalling the capability removes only its installation state and does not delete its stored entries or published documents.

The package owns its interface copy and follows the platform's Chinese or English setting through `CapabilityHost.environment`. Dates use the locale supplied by the platform. The page also follows the platform's Light or Dark state and reuses platform CSS tokens, so preference changes take effect without restarting or reopening Diary.
