# Changelog

## v0.1.3

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
