import { Constants } from "siyuan";
import {
    ConfigModule,
    CONFIG_MODULES,
    DEFAULT_SKIP_KEYS,
    DeviceInfo,
    PluginSettings,
    Profile,
    ProfileMeta,
    PROFILES_DIR,
    SaveProfileOptions,
    SETTINGS_FILE_PATH,
} from "./types";
import { getConf, getFile, performSync, putFile, readDir, removeFile, setConfModule } from "./siyuan-api";
import { detectPlatform, getDeviceName } from "../utils/platform";
import { generateUUID } from "../utils/uuid";
import { filterCustomKeymap, isSparseKeymap, mergeKeymap } from "../utils/keymap";
import { preserveLocalSkipKeys, setByPath, stripSkipKeys } from "../utils/skip-keys";

/**
 * ConfigManager handles all CRUD operations for configuration profiles.
 * Profiles are stored as individual JSON files under data/storage/petal/siyuan-plugin-settings-sync/profiles/
 * and discovered by scanning the directory (no manifest index file).
 * This avoids sync conflicts when multiple devices modify profiles concurrently.
 */
export class ConfigManager {
    /** In-memory cache of profile metadata, populated by scanProfiles() */
    private profilesCache: ProfileMeta[] = [];

    /** Plugin settings (skip keys, etc.) */
    private settings: PluginSettings = { skipKeys: [...DEFAULT_SKIP_KEYS], sharedFolder: "", autoPushOnSave: false };

    /** Optional callback invoked with a profile id whenever a profile is saved or updated. */
    private onProfilePersisted?: (profileId: string) => void;

    /** Initialize the config manager by loading settings and scanning profiles directory */
    async init(): Promise<void> {
        await this.loadSettings();
        await this.scanProfiles();
    }

    /** Register a side-effect callback fired after a profile is saved or updated. */
    setOnProfilePersisted(cb: (profileId: string) => void): void {
        this.onProfilePersisted = cb;
    }

    // ── Settings persistence ──────────────────────────────────────

    /** Load plugin settings from disk (merges with defaults) */
    async loadSettings(): Promise<void> {
        try {
            const data = await getFile(SETTINGS_FILE_PATH);
            if (data && typeof data === "object") {
                if (Array.isArray(data.skipKeys)) {
                    this.settings.skipKeys = data.skipKeys;
                }
                if (typeof data.sharedFolder === "string") {
                    this.settings.sharedFolder = data.sharedFolder;
                }
                if (typeof data.autoPushOnSave === "boolean") {
                    this.settings.autoPushOnSave = data.autoPushOnSave;
                }
            }
        } catch {
            // Use defaults if settings file doesn't exist or can't be read
        }
    }

    /** Persist current plugin settings to disk */
    async saveSettings(): Promise<void> {
        await putFile(SETTINGS_FILE_PATH, this.settings);
        performSync();
    }

    /** Get the current skip keys list */
    getSkipKeys(): string[] {
        return [...this.settings.skipKeys];
    }

    /** Replace the skip keys list and persist */
    async setSkipKeys(keys: string[]): Promise<void> {
        this.settings.skipKeys = keys;
        await this.saveSettings();
    }

    /** Get the configured shared-folder absolute path (empty string if unset) */
    getSharedFolder(): string {
        return this.settings.sharedFolder || "";
    }

    /** Get whether auto-push to other workspaces / shared folder is enabled */
    getAutoPushOnSave(): boolean {
        return !!this.settings.autoPushOnSave;
    }

    /** Update the workspace-sync related settings and persist */
    async setWorkspaceSyncSettings(sharedFolder: string, autoPushOnSave: boolean): Promise<void> {
        this.settings.sharedFolder = sharedFolder;
        this.settings.autoPushOnSave = autoPushOnSave;
        await this.saveSettings();
    }

    /**
     * Scan the profiles directory and read metadata from each profile file.
     * This replaces the manifest-based approach to avoid sync conflicts.
     */
    private async scanProfiles(): Promise<void> {
        const entries = await readDir(PROFILES_DIR);
        const profiles: ProfileMeta[] = [];

        for (const entry of entries) {
            if (entry.isDir || !entry.name.endsWith(".json")) {
                continue;
            }

            try {
                const path = `${PROFILES_DIR}/${entry.name}`;
                const data = await getFile(path);
                if (data && typeof data === "object" && data.id && data.meta) {
                    profiles.push(data.meta as ProfileMeta);
                }
            } catch {
                // Skip files that can't be read or parsed
                continue;
            }
        }

        this.profilesCache = profiles;
    }

    /** Get the list of all saved profile metadata */
    async listProfiles(): Promise<ProfileMeta[]> {
        return this.profilesCache;
    }

    /** Read a full profile (with config data) by ID */
    async getProfile(profileId: string): Promise<Profile | null> {
        const path = `${PROFILES_DIR}/${profileId}.json`;
        const data = await getFile(path);
        if (data && typeof data === "object" && data.id) {
            return data as Profile;
        }
        return null;
    }

    /** Get current device info */
    getDeviceInfo(): DeviceInfo {
        return {
            platform: detectPlatform(),
            frontend: "",
            backend: "",
            siyuanVersion: Constants.SIYUAN_VERSION || "unknown",
        };
    }

    /**
     * Get the current SiYuan configuration for the specified modules (public for preview/diff).
     * If filterKeymap is true (default), keymap data is filtered to only show customized bindings.
     */
    async getCurrentConf(modules: ConfigModule[], filterKeymap: boolean = true): Promise<Partial<Record<ConfigModule, any>>> {
        const confData = await getConf();
        const conf: Partial<Record<ConfigModule, any>> = {};
        for (const mod of modules) {
            if (confData.conf && confData.conf[mod] != null) {
                let modData = JSON.parse(JSON.stringify(confData.conf[mod]));
                if (filterKeymap && mod === "keymap") {
                    modData = filterCustomKeymap(modData);
                }
                // Strip skip keys so preview/diff doesn't show machine-specific values
                stripSkipKeys(modData, mod, this.settings.skipKeys);
                conf[mod] = modData;
            }
        }
        return conf;
    }

    /** Capture current SiYuan configuration for the specified modules */
    private async captureCurrentConf(modules: ConfigModule[]): Promise<Partial<Record<ConfigModule, any>>> {
        const confData = await getConf();
        const conf: Partial<Record<ConfigModule, any>> = {};
        for (const mod of modules) {
            if (confData.conf && confData.conf[mod] != null) {
                let modData = JSON.parse(JSON.stringify(confData.conf[mod]));
                // For keymap, only save user-customized bindings (filter out defaults)
                if (mod === "keymap") {
                    modData = filterCustomKeymap(modData);
                }
                // Remove machine-specific keys before saving
                stripSkipKeys(modData, mod, this.settings.skipKeys);
                conf[mod] = modData;
            }
        }
        return conf;
    }

    /** Save the current configuration as a new profile */
    async saveProfile(options: SaveProfileOptions): Promise<ProfileMeta> {
        const { name, platform, modules, description } = options;
        const id = generateUUID();
        const now = new Date().toISOString();
        const deviceInfo = this.getDeviceInfo();

        const conf = await this.captureCurrentConf(modules);

        const meta: ProfileMeta = {
            id,
            name,
            platform,
            createdAt: now,
            updatedAt: now,
            sourceDevice: getDeviceName(),
            siyuanVersion: deviceInfo.siyuanVersion,
            description: description || "",
        };

        const profile: Profile = { id, meta, conf };

        // Write the profile file (no manifest needed)
        await putFile(`${PROFILES_DIR}/${id}.json`, profile);
        performSync();

        // Update in-memory cache
        this.profilesCache.push(meta);

        // Notify external listeners (e.g. WorkspaceSync auto-push)
        this.onProfilePersisted?.(id);

        return meta;
    }

    /** Apply a saved profile's configuration to the current device */
    async applyProfile(profileId: string, modules: ConfigModule[]): Promise<void> {
        const profile = await this.getProfile(profileId);
        if (!profile) {
            throw new Error("Profile not found");
        }

        // Fetch current conf once so we can preserve local skip-key values
        const confData = await getConf();
        const errors: string[] = [];

        for (const mod of modules) {
            if (profile.conf[mod] !== undefined) {
                try {
                    let dataToApply = JSON.parse(JSON.stringify(profile.conf[mod]));

                    // For keymap: if the saved profile only contains customizations (sparse),
                    // merge them into the current full keymap instead of replacing everything
                    if (mod === "keymap" && isSparseKeymap(dataToApply)) {
                        if (confData.conf && confData.conf.keymap) {
                            dataToApply = mergeKeymap(confData.conf.keymap, dataToApply);
                        }
                    }

                    // Preserve local values for machine-specific keys
                    if (confData.conf && confData.conf[mod] != null) {
                        preserveLocalSkipKeys(dataToApply, confData.conf[mod], mod, this.settings.skipKeys);
                    }

                    await setConfModule(mod, dataToApply);
                } catch (e: any) {
                    console.error(`[settings-sync] Failed to apply module "${mod}":`, e);
                    errors.push(`${mod}: ${e.message}`);
                }
            }
        }

        if (errors.length > 0) {
            throw new Error(errors.join("; "));
        }
    }

    /** Update an existing profile with the current device's configuration */
    async updateProfile(profileId: string): Promise<void> {
        const profile = await this.getProfile(profileId);
        if (!profile) {
            throw new Error("Profile not found");
        }

        // Always capture ALL config modules so newly added modules (e.g. account)
        // are included when updating old profiles.
        const conf = await this.captureCurrentConf(CONFIG_MODULES);
        const now = new Date().toISOString();
        const deviceInfo = this.getDeviceInfo();

        profile.conf = conf;
        profile.meta.updatedAt = now;
        profile.meta.sourceDevice = getDeviceName();
        profile.meta.siyuanVersion = deviceInfo.siyuanVersion;

        await putFile(`${PROFILES_DIR}/${profileId}.json`, profile);
        performSync();

        // Update in-memory cache
        const idx = this.profilesCache.findIndex((p) => p.id === profileId);
        if (idx >= 0) {
            this.profilesCache[idx] = { ...profile.meta };
        }

        // Notify external listeners (e.g. WorkspaceSync auto-push)
        this.onProfilePersisted?.(profileId);
    }

    /** Rename a profile */
    async renameProfile(profileId: string, newName: string): Promise<void> {
        const profile = await this.getProfile(profileId);
        if (!profile) {
            throw new Error("Profile not found");
        }

        profile.meta.name = newName;
        await putFile(`${PROFILES_DIR}/${profileId}.json`, profile);
        performSync();

        // Update in-memory cache
        const idx = this.profilesCache.findIndex((p) => p.id === profileId);
        if (idx >= 0) {
            this.profilesCache[idx].name = newName;
        }
    }

    /** Update a profile's description */
    async updateDescription(profileId: string, newDescription: string): Promise<void> {
        const profile = await this.getProfile(profileId);
        if (!profile) {
            throw new Error("Profile not found");
        }

        profile.meta.description = newDescription;
        await putFile(`${PROFILES_DIR}/${profileId}.json`, profile);
        performSync();

        // Update in-memory cache
        const idx = this.profilesCache.findIndex((p) => p.id === profileId);
        if (idx >= 0) {
            this.profilesCache[idx].description = newDescription;
        }
    }

    /** Delete a profile */
    async deleteProfile(profileId: string): Promise<void> {
        await removeFile(`${PROFILES_DIR}/${profileId}.json`);
        performSync();

        // Update in-memory cache
        this.profilesCache = this.profilesCache.filter((p) => p.id !== profileId);
    }

    /**
     * Create an automatic backup of the current configuration.
     * Used before applying another profile's settings.
     */
    async createAutoBackup(backupNamePrefix: string): Promise<ProfileMeta> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        return this.saveProfile({
            name: `${backupNamePrefix} - ${timestamp}`,
            platform: detectPlatform(),
            modules: CONFIG_MODULES,
            description: "Auto backup before applying another profile",
        });
    }

    /**
     * Apply a single setting value from a profile to the current configuration.
     *
     * Fetches the latest full module config, sets the specific path to the
     * given value, and sends the complete module config back to SiYuan.
     *
     * @param mod          The config module (e.g. "editor")
     * @param settingPath  Dot-separated key path within the module (e.g. "fontSize")
     * @param value        The value to set
     */
    async applySingleSetting(mod: ConfigModule, settingPath: string, value: any): Promise<void> {
        const confData = await getConf();
        const currentModData = confData?.conf?.[mod];
        if (currentModData == null) {
            throw new Error(`Module "${mod}" not found in current config`);
        }

        const updated = JSON.parse(JSON.stringify(currentModData));
        setByPath(updated, settingPath.split("."), value);
        await setConfModule(mod, updated);
    }

    /** Force re-scan profiles from disk */
    async refresh(): Promise<void> {
        await this.scanProfiles();
    }
}
