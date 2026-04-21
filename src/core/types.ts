/**
 * Type definitions for Settings Sync Plugin
 */

/** Supported platform identifiers */
export type Platform = "all" | "windows" | "darwin" | "linux" | "android" | "ios" | "harmony" | "docker";

/** Configuration module keys that can be synced */
export type ConfigModule = "editor" | "keymap" | "appearance" | "fileTree" | "search" | "export" | "flashcard" | "ai" | "account";

/** All available config modules */
export const CONFIG_MODULES: ConfigModule[] = [
    "editor", "keymap", "appearance", "fileTree", "search", "export", "flashcard", "ai", "account"
];

/** Mapping from config module key to the SiYuan API endpoint for applying that module */
export const MODULE_API_MAP: Record<ConfigModule, string> = {
    editor: "/api/setting/setEditor",
    keymap: "/api/setting/setKeymap",
    appearance: "/api/setting/setAppearance",
    fileTree: "/api/setting/setFiletree",
    search: "/api/setting/setSearch",
    export: "/api/setting/setExport",
    flashcard: "/api/setting/setFlashcard",
    ai: "/api/setting/setAI",
    account: "/api/setting/setAccount",
};

/**
 * Modules whose changes take effect immediately (no SiYuan restart required)
 * because the kernel handler broadcasts a UI update event.
 *
 * Reference: `kernel/api/setting.go` in siyuan-note/siyuan.
 *  - `setAppearance` / `setIcon` / `setTheme` broadcast `setAppearance`,
 *    causing theme, language and icon changes to apply live.
 *
 * Other `setXxx` handlers (editor, keymap, fileTree, search, export,
 * flashcard, ai, account) only persist to `conf.json` and update the
 * in-memory `model.Conf`; the running UI keeps the previously rendered
 * values until SiYuan is restarted. The plugin still patches
 * `window.siyuan.config[mod]` after a successful apply (mirroring what
 * SiYuan's own settings UI does), so reopening the SiYuan settings dialog
 * shows the new values without restart, but other UI surfaces (top bar,
 * shortcut bindings, etc.) require a restart to refresh.
 */
export const MODULE_LIVE_APPLY: ReadonlySet<ConfigModule> = new Set<ConfigModule>([
    "appearance",
]);

/** Returns true if the given module's changes take effect without a SiYuan restart. */
export function isLiveApplyModule(mod: ConfigModule): boolean {
    return MODULE_LIVE_APPLY.has(mod);
}

/** Platform display labels */
export const PLATFORM_LABELS: Record<Platform, string> = {
    all: "All",
    windows: "Windows",
    darwin: "macOS",
    linux: "Linux",
    android: "Android",
    ios: "iOS",
    harmony: "HarmonyOS",
    docker: "Docker",
};

/** Metadata for a saved profile (embedded in each profile JSON file) */
export interface ProfileMeta {
    id: string;
    name: string;
    platform: Platform;
    createdAt: string;
    updatedAt: string;
    sourceDevice: string;
    siyuanVersion: string;
    description: string;
}

/** A complete profile with configuration data */
export interface Profile {
    id: string;
    meta: ProfileMeta;
    conf: Partial<Record<ConfigModule, any>>;
}

/** Device information for the current client */
export interface DeviceInfo {
    platform: Platform;
    frontend: string;
    backend: string;
    siyuanVersion: string;
}

/** Options for saving a new profile */
export interface SaveProfileOptions {
    name: string;
    platform: Platform;
    modules: ConfigModule[];
    description?: string;
}

/** Base path for settings sync data in SiYuan's data directory */
export const SYNC_BASE_PATH = "/data/storage/petal/siyuan-plugin-settings-sync";
export const PROFILES_DIR = `${SYNC_BASE_PATH}/profiles`;
export const SETTINGS_FILE_PATH = `${SYNC_BASE_PATH}/settings.json`;

/** Workspace-relative cache directory for remote workspace profiles */
export const REMOTE_CACHE_DIR = `${SYNC_BASE_PATH}/.remote-cache`;

/**
 * Trailing path segment (relative to a workspace root) where each workspace's
 * profiles live on disk. Used together with `globalCopyFiles` to address
 * other workspaces' profile directories.
 */
export const PROFILES_SUBPATH = "data/storage/petal/siyuan-plugin-settings-sync/profiles";

/**
 * Default keys to skip during sync.
 * These are machine-specific settings whose values (e.g. absolute paths)
 * differ between devices and would cause errors if synced.
 * Format: "module.property" (dot-separated path within module data).
 */
export const DEFAULT_SKIP_KEYS: string[] = [
    "export.pandocBin",
    "export.pandocParams",
    "ai.openAI.apiKey",
    "ai.openAI.apiUserAgent",
];

/** Plugin settings persisted to settings.json */
export interface PluginSettings {
    /** Keys to exclude when saving / applying profiles */
    skipKeys: string[];
    /**
     * Optional absolute path to a shared folder that acts as a hub between workspaces.
     * When set, this folder is offered alongside other workspaces in the manager UI.
     */
    sharedFolder?: string;
    /**
     * If true, newly saved or updated profiles are also pushed to the shared folder
     * (when configured) and to all other known SiYuan workspaces. Off by default.
     */
    autoPushOnSave?: boolean;
}

/** Identifier for the special shared-folder target in workspace-sync UI */
export const SHARED_FOLDER_TARGET_ID = "__shared__";

/** Identifier for the current workspace (default selection) */
export const CURRENT_WORKSPACE_TARGET_ID = "__current__";
