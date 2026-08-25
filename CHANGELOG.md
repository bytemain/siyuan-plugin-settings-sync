# Changelog

## v0.3.3 (2026-08-25)

* Add layout module: sync SiYuan's saved UI layouts across devices (#34, #35)
  - Saved layouts are captured into profiles and applied back via local storage; SiYuan's layout menu picks them up without a restart
  - Switching layouts still uses SiYuan's own layout menu, which the mobile frontend does not provide
* Fix SiYuan 3.6 ↔ 3.8 compatibility for appearance icons and AI module (#36)
  - Fix appearance icon pre-flight on SiYuan ≤3.6.x (string-form icon lists were flagged as not installed, breaking appearance applies)
  - Migrate the ai module across the 3.6 openAI ↔ 3.8 providers shape boundary when applying profiles
  - Surface cross-version migrations and skips in the apply result message
  - Show platform / SiYuan-version mismatch warnings in the preview dialog and apply confirmation
* Document the release process in RELEASING.md (#38)

## v0.3.2 (2026-04-16)

* Hide keymap `default` field from preview/diff UI (#28)
* Fix keymap filter to handle nested subcategories (editor/plugin shortcuts) (#27)

## v0.3.1 (2026-04-14)

* Add ai.openAI.apiUserAgent to default skip keys (#24)
* Fix: show account tab in preview dialogs for all config modules (#23)

## v0.3.0 (2026-04-13)

* Added account config module for syncing displayTitle and displayVIP settings (#21)
* Merged Rename and Edit Description into a ⋯ More dropdown menu (#20)
* Show update preview dialog with diff before confirming profile update (#19)

## v0.2.0 (2026-04-10)

* Unified preview and apply into a single View dialog with module selection (#16)
* Added AI config sync support with automatic API key exclusion (#15)
* Mobile UI adaptation and dark mode fixes (#15)

## v0.1.3 (2026-04-09)

* Trigger SiYuan cloud sync after saving, updating, renaming, or deleting profiles and settings
  - Automatically calls `/api/sync/performSync` after file writes so changes are synced to other devices
  - Best-effort: gracefully handles older SiYuan versions that may not support this API

## v0.1.0

* Initial release of Settings Sync plugin
* Save current SiYuan configuration as named profiles
* Apply saved profiles to replicate settings across devices
* Platform-tagged profiles with cross-platform compatibility warnings
* Selective module sync (editor, keymap, appearance, fileTree, search, tag, export, flashcard)
* Automatic backup before applying profiles
* Rename, update, and delete profiles
* Filter profiles by platform
* Multi-language support (English, Chinese)
