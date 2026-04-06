import { Constants } from "siyuan";
import {
    ConfigModule,
    CONFIG_MODULES,
    DeviceInfo,
    Manifest,
    MANIFEST_PATH,
    Profile,
    ProfileMeta,
    PROFILES_DIR,
    SaveProfileOptions,
} from "./types";
import { getConf, getFile, putFile, removeFile, setConfModule } from "./siyuan-api";
import { detectPlatform, getDeviceName } from "../utils/platform";
import { generateUUID } from "../utils/uuid";

/**
 * ConfigManager handles all CRUD operations for configuration profiles.
 * Profiles are stored as JSON files under data/public/settings-sync/ and
 * synced across devices via SiYuan's built-in cloud sync.
 */
export class ConfigManager {
    private manifest: Manifest | null = null;

    /** Initialize the config manager, loading or creating the manifest */
    async init(): Promise<void> {
        await this.loadManifest();
    }

    /** Load the manifest from disk, or create a new one if it doesn't exist */
    private async loadManifest(): Promise<void> {
        const data = await getFile(MANIFEST_PATH);
        if (data && typeof data === "object" && data.version) {
            this.manifest = data as Manifest;
        } else {
            this.manifest = { version: 1, profiles: [] };
            await this.saveManifest();
        }
    }

    /** Persist the manifest to disk */
    private async saveManifest(): Promise<void> {
        if (this.manifest) {
            await putFile(MANIFEST_PATH, this.manifest);
        }
    }

    /** Get the list of all saved profile metadata */
    async listProfiles(): Promise<ProfileMeta[]> {
        if (!this.manifest) {
            await this.loadManifest();
        }
        return this.manifest!.profiles;
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

    /** Get the current SiYuan configuration for the specified modules (public for preview/diff) */
    async getCurrentConf(modules: ConfigModule[]): Promise<Partial<Record<ConfigModule, any>>> {
        return this.captureCurrentConf(modules);
    }

    /** Capture current SiYuan configuration for the specified modules */
    private async captureCurrentConf(modules: ConfigModule[]): Promise<Partial<Record<ConfigModule, any>>> {
        const confData = await getConf();
        const conf: Partial<Record<ConfigModule, any>> = {};
        for (const mod of modules) {
            if (confData.conf && confData.conf[mod] !== undefined) {
                conf[mod] = JSON.parse(JSON.stringify(confData.conf[mod]));
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

        // Write the profile file
        await putFile(`${PROFILES_DIR}/${id}.json`, profile);

        // Update manifest
        if (!this.manifest) {
            this.manifest = { version: 1, profiles: [] };
        }
        this.manifest.profiles.push(meta);
        await this.saveManifest();

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
                await setConfModule(mod, profile.conf[mod]);
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

        // Update manifest
        if (this.manifest) {
            const idx = this.manifest.profiles.findIndex((p) => p.id === profileId);
            if (idx >= 0) {
                this.manifest.profiles[idx] = { ...profile.meta };
            }
            await this.saveManifest();
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

        if (this.manifest) {
            const idx = this.manifest.profiles.findIndex((p) => p.id === profileId);
            if (idx >= 0) {
                this.manifest.profiles[idx].name = newName;
            }
            await this.saveManifest();
        }
    }

    /** Delete a profile */
    async deleteProfile(profileId: string): Promise<void> {
        await removeFile(`${PROFILES_DIR}/${profileId}.json`);

        if (this.manifest) {
            this.manifest.profiles = this.manifest.profiles.filter((p) => p.id !== profileId);
            await this.saveManifest();
        }
    }

    /**
     * Create an automatic backup of the current configuration.
     * Used before applying another profile's settings.
     */
    async createAutoBackup(backupNamePrefix: string): Promise<ProfileMeta> {
        // Slice ISO string to "YYYY-MM-DDTHH-MM-SS" (19 chars) for a readable timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        return this.saveProfile({
            name: `${backupNamePrefix} - ${timestamp}`,
            platform: detectPlatform(),
            modules: CONFIG_MODULES,
            description: "Auto backup before applying another profile",
        });
    }

    /** Force reload the manifest from disk */
    async refresh(): Promise<void> {
        await this.loadManifest();
    }
}
