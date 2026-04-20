# Settings Sync Plugin for SiYuan

Sync your SiYuan Note settings across devices via cloud storage.

## Features

- **Save** your current SiYuan configuration (editor, keymap, appearance, file tree, search, tag, export, flashcard, AI settings) as a named profile
- **Apply** a saved profile on any other device to instantly replicate settings
- **Platform tags** — profiles are tagged by platform (Windows, macOS, Linux, Android, iOS, HarmonyOS, Docker) with cross-platform warnings
- **Selective sync** — choose which configuration modules to save or apply
- **Backup before apply** — optionally create an automatic backup before overwriting settings
- **Rename, update, delete** profiles through the visual management UI
- **Filter** profiles by platform
- **Multi-language** support (English & Chinese)

## How It Works

The plugin stores configuration profiles as JSON files under `data/storage/petal/siyuan-plugin-settings-sync/`. Since SiYuan automatically syncs the `data/` directory to the cloud, your profiles become available on all your devices.

**No additional cloud setup is required** — as long as SiYuan's built-in sync is enabled, profiles are synced automatically.

## Multi-workspace sync (local)

If you keep several SiYuan workspaces on the same machine, you can share profiles between them **without** going through cloud sync. The plugin uses SiYuan's `globalCopyFiles` kernel API to read and write each workspace's profiles directory directly on disk.

In the manager:

- Use the **Workspace** selector at the top of the profile list to browse other workspaces' profiles.
- Each remote profile shows a **Pull** button (copy into the current workspace) and an **Apply directly** button (pull + apply in one step).
- Each local profile gains a **Push to…** action in the ⋯ menu, allowing you to copy it to one or more other workspaces.
- In **Settings**, you can optionally configure a **Shared Folder** (any absolute path) that acts as a hub between workspaces, and enable **Auto-push on save** to mirror every save / update to all known workspaces and the shared folder.

Notes:

- Local multi-workspace sync is desktop-only. On sandboxed platforms (iOS, Android, some Docker setups) the kernel rejects cross-workspace paths and the workspace selector is hidden after the first failure.
- This feature does not require the other workspace to be running — the kernel performs file-level IO on disk.
- Cloud sync still works as before; the new feature is purely additive.

## Usage

1. Click the ⚙️ icon in the top toolbar (or use the command palette: "Open Settings Sync Manager")
2. **Save**: Click "Save Current Config", name your profile, select modules, and save
3. **Apply**: On another device, open the manager and click "Apply" on a profile
4. **Update**: Click "Update" to overwrite a profile with current settings
5. **Rename/Delete**: Manage profiles directly from the list

## Storage Structure

```
data/storage/petal/siyuan-plugin-settings-sync/
└── profiles/
    ├── {uuid}.json        # Individual profile snapshots
    └── ...
```

## Configuration Modules

| Module | Description |
|--------|-------------|
| Editor | Editor preferences (font, line height, etc.) |
| Keymap | Keyboard shortcuts |
| Appearance | Theme, mode, UI preferences |
| File Tree | File tree display settings |
| Search | Search behavior |
| Tag | Tag management settings |
| Export | Export preferences |
| Flashcard | Flashcard settings |
| AI | AI provider and model settings |

## Development

1. Clone this repository
2. Run `pnpm install`
3. Run `pnpm run dev` for development (watches for changes)
4. Run `pnpm run build` for production build (generates `package.zip`)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

## License

MIT
