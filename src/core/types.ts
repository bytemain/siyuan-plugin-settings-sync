/**
 * Type definitions for Settings Sync Plugin
 */

/** Supported platform identifiers */
export type Platform = "all" | "windows" | "darwin" | "linux" | "android" | "ios" | "harmony" | "docker";

/** Configuration module keys that can be synced */
export type ConfigModule = "editor" | "keymap" | "appearance" | "fileTree" | "search" | "export" | "flashcard";

/** All available config modules */
export const CONFIG_MODULES: ConfigModule[] = [
    "editor", "keymap", "appearance", "fileTree", "search", "export", "flashcard"
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
};

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
export const SYNC_BASE_PATH = "/data/public/settings-sync";
export const PROFILES_DIR = `${SYNC_BASE_PATH}/profiles`;
