import { Constants } from "siyuan";
import {
    ConfigModule,
    CONFIG_MODULES,
    DeviceInfo,
    Profile,
    ProfileMeta,
    PROFILES_DIR,
    SaveProfileOptions,
} from "./types";
import { getConf, getFile, putFile, readDir, removeFile, setConfModule } from "./siyuan-api";
import { detectPlatform, getDeviceName } from "../utils/platform";
import { generateUUID } from "../utils/uuid";
import { filterCustomKeymap, isSparseKeymap, mergeKeymap } from "../utils/keymap";

/**
 * ConfigManager handles all CRUD operations for configuration profiles.
 * Profiles are stored as individual JSON files under data/public/settings-sync/profiles/
 * and discovered by scanning the directory (no manifest index file).
 * This avoids sync conflicts when multiple devices modify profiles concurrently.
 */
export class ConfigManager {
    /** In-memory cache of profile metadata, populated by scanProfiles() */
    private profilesCache: ProfileMeta[] = [];

    /** Initialize the config manager by scanning profiles directory */
    async init(): Promise<void> {
        await this.scanProfiles();
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
            if (confData.conf && confData.conf[mod] !== undefined) {
                let modData = JSON.parse(JSON.stringify(confData.conf[mod]));
                if (filterKeymap && mod === "keymap") {
                    modData = filterCustomKeymap(modData);
                }
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
            if (confData.conf && confData.conf[mod] !== undefined) {
                let modData = JSON.parse(JSON.stringify(confData.conf[mod]));
                // For keymap, only save user-customized bindings (filter out defaults)
                if (mod === "keymap") {
                    modData = filterCustomKeymap(modData);
                }
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

        // Update in-memory cache
        this.profilesCache.push(meta);

        return meta;
    }

    /** Apply a saved profile's configuration to the current device */
    async applyProfile(profileId: string, modules: ConfigModule[]): Promise<void> {
        const profile = await this.getProfile(profileId);
        if (!profile) {
            throw new Error("Profile not found");
        }

        for (const mod of modules) {
            if (profile.conf[mod] !== undefined) {
                let dataToApply = profile.conf[mod];

                // For keymap: if the saved profile only contains customizations (sparse),
                // merge them into the current full keymap instead of replacing everything
                if (mod === "keymap" && isSparseKeymap(dataToApply)) {
                    const confData = await getConf();
                    if (confData.conf && confData.conf.keymap) {
                        dataToApply = mergeKeymap(confData.conf.keymap, dataToApply);
                    }
                }

                await setConfModule(mod, dataToApply);
            }
        }
    }

    /** Update an existing profile with the current device's configuration */
    async updateProfile(profileId: string): Promise<void> {
        const profile = await this.getProfile(profileId);
        if (!profile) {
            throw new Error("Profile not found");
        }

        // Determine which modules were in the original profile
        const modules = (Object.keys(profile.conf) as ConfigModule[]).filter(
            (m) => CONFIG_MODULES.includes(m)
        );

        const conf = await this.captureCurrentConf(modules.length > 0 ? modules : CONFIG_MODULES);
        const now = new Date().toISOString();
        const deviceInfo = this.getDeviceInfo();

        profile.conf = conf;
        profile.meta.updatedAt = now;
        profile.meta.sourceDevice = getDeviceName();
        profile.meta.siyuanVersion = deviceInfo.siyuanVersion;

        await putFile(`${PROFILES_DIR}/${profileId}.json`, profile);

        // Update in-memory cache
        const idx = this.profilesCache.findIndex((p) => p.id === profileId);
        if (idx >= 0) {
            this.profilesCache[idx] = { ...profile.meta };
        }
    }

    /** Rename a profile */
    async renameProfile(profileId: string, newName: string): Promise<void> {
        const profile = await this.getProfile(profileId);
        if (!profile) {
            throw new Error("Profile not found");
        }

        profile.meta.name = newName;
        await putFile(`${PROFILES_DIR}/${profileId}.json`, profile);

        // Update in-memory cache
        const idx = this.profilesCache.findIndex((p) => p.id === profileId);
        if (idx >= 0) {
            this.profilesCache[idx].name = newName;
        }
    }

    /** Delete a profile */
    async deleteProfile(profileId: string): Promise<void> {
        await removeFile(`${PROFILES_DIR}/${profileId}.json`);

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

    /** Force re-scan profiles from disk */
    async refresh(): Promise<void> {
        await this.scanProfiles();
    }
}
