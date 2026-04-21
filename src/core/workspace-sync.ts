import {
    ConfigModule,
    Profile,
    ProfileMeta,
    PROFILES_SUBPATH,
    REMOTE_CACHE_DIR,
    SHARED_FOLDER_TARGET_ID,
} from "./types";
import {
    DirEntry,
    getFile,
    getWorkspacePath,
    getWorkspaces,
    globalCopyFiles,
    readDir,
    removeFile,
    WorkspaceInfo,
} from "./siyuan-api";
import {
    basename,
    normalizeWorkspacePath,
    remoteProfilesDir,
    trimTrailingSep,
} from "../utils/path";
import { ConfigManager } from "./config-manager";

/** Information about a sync target available in the UI (workspace or shared folder) */
export interface SyncTarget {
    /** Stable identifier used in UI selectors. For workspaces this is the absolute path. */
    id: string;
    /** Human-readable label (workspace folder name or "Shared Folder") */
    label: string;
    /** Absolute filesystem path to the target's profiles directory */
    profilesDir: string;
    /** True for the special shared-folder target */
    isShared: boolean;
    /** True if the workspace was reported as closed (informational only) */
    closed?: boolean;
}

/** A profile loaded from a remote workspace cache, augmented with its origin */
export interface RemoteProfileMeta extends ProfileMeta {
    /** Absolute filesystem path of the source profile file (for pulling/applying) */
    sourcePath: string;
    /** Identifier of the sync target this profile came from */
    sourceTargetId: string;
    /** Display label of the source target */
    sourceLabel: string;
}

/**
 * WorkspaceSync coordinates discovery and file-level transfer of profiles
 * between sibling SiYuan workspaces on the same machine, leveraging the
 * kernel's `globalCopyFiles` endpoint.
 *
 * The flow for browsing a remote workspace is:
 *   1. Clear the local `.remote-cache/<id>` directory.
 *   2. Copy the remote workspace's profiles directory into the local cache.
 *   3. Read the cached files with the regular workspace-relative APIs.
 *
 * Pull / Push perform a single `globalCopyFiles` between absolute paths.
 *
 * The class also tracks whether `globalCopyFiles` is supported on the
 * current platform – on iOS/Android sandboxes the kernel rejects cross-
 * workspace paths, in which case the UI hides the workspace-sync entry.
 */
export class WorkspaceSync {
    private currentWorkspace = "";
    private workspacesCache: WorkspaceInfo[] = [];
    /** undefined = not yet probed; true / false once detected */
    private supported: boolean | undefined = undefined;

    constructor(private configManager: ConfigManager) {}

    /**
     * Initialize: cache the current workspace path and the list of known workspaces.
     * Safe to call multiple times.
     */
    async init(): Promise<void> {
        try {
            this.currentWorkspace = await getWorkspacePath();
        } catch {
            this.currentWorkspace = "";
        }
        try {
            this.workspacesCache = await getWorkspaces();
        } catch {
            this.workspacesCache = [];
        }
    }

    /** Path to the current workspace root (may be empty if not yet initialized). */
    getCurrentWorkspace(): string {
        return this.currentWorkspace;
    }

    /** Was `globalCopyFiles` already detected as unsupported on this platform? */
    isUnsupported(): boolean {
        return this.supported === false;
    }

    /**
     * Build the list of available sync targets for the UI:
     *   - all known workspaces except the current one
     *   - optionally the shared folder, if configured in plugin settings
     */
    listTargets(): SyncTarget[] {
        const out: SyncTarget[] = [];
        const current = normalizeWorkspacePath(this.currentWorkspace);
        for (const ws of this.workspacesCache) {
            if (normalizeWorkspacePath(ws.path) === current) continue;
            out.push({
                id: ws.path,
                label: basename(ws.path) || ws.path,
                profilesDir: remoteProfilesDir(ws.path),
                isShared: false,
                closed: ws.closed,
            });
        }

        const shared = this.configManager.getSharedFolder();
        if (shared) {
            out.push({
                id: SHARED_FOLDER_TARGET_ID,
                label: "Shared Folder",
                profilesDir: trimTrailingSep(shared),
                isShared: true,
            });
        }
        return out;
    }

    /** Look up a single target by its identifier. */
    getTarget(id: string): SyncTarget | undefined {
        return this.listTargets().find((t) => t.id === id);
    }

    /**
     * Stable cache directory name for a target.
     * For workspaces: uses the basename of the workspace path (collisions are
     * unlikely and harmless – the cache is cleared before each refresh).
     */
    private cacheKeyFor(target: SyncTarget): string {
        if (target.isShared) return "_shared";
        return sanitizeCacheKey(basename(target.id) || "workspace");
    }

    /** Workspace-relative cache directory for a target (under data/...). */
    private cacheRelDir(target: SyncTarget): string {
        return `${REMOTE_CACHE_DIR}/${this.cacheKeyFor(target)}`;
    }

    /**
     * Copy the target's profiles into a workspace-local cache and return the
     * parsed metadata. The cache is cleared before each refresh.
     *
     * @throws on the first call when `globalCopyFiles` is unsupported on the
     *   current platform (e.g. iOS sandbox); the error message is the raw
     *   kernel error so the UI can decide how to surface it.
     */
    async listRemoteProfiles(target: SyncTarget): Promise<RemoteProfileMeta[]> {
        const cacheRel = this.cacheRelDir(target);
        await this.clearCache(cacheRel);

        // Ensure we know the current workspace (for diagnostics / unsupported flag).
        await this.ensureCurrentWorkspace();

        try {
            // The kernel restricts `destDir` to a path *inside the current workspace*
            // (see kernel/api/file.go → util.GetAbsPathInWorkspace). We therefore pass
            // the workspace-relative cache path directly; passing an absolute path
            // would be re-joined onto the workspace root and silently land in a
            // junk sub-directory, which is why callers previously saw the cache
            // appear empty even though `globalCopyFiles` reported success.
            await globalCopyFiles([target.profilesDir], cacheRel);
            this.supported = true;
        } catch (e) {
            // Mark as unsupported the first time we hit a hard failure, so the UI
            // can hide workspace-sync entry on platforms where this is impossible.
            if (this.supported === undefined) this.supported = false;
            throw e;
        }

        // After copy, contents live under <cacheRel>/<basename(profilesDir)>/
        const dirName = basename(target.profilesDir);
        const profilesCacheDir = `${cacheRel}/${dirName}`;
        const entries: DirEntry[] = await readDir(profilesCacheDir);
        const out: RemoteProfileMeta[] = [];
        for (const entry of entries) {
            if (entry.isDir || !entry.name.endsWith(".json")) continue;
            try {
                const data = await getFile(`${profilesCacheDir}/${entry.name}`);
                if (data && typeof data === "object" && data.id && data.meta) {
                    const meta = data.meta as ProfileMeta;
                    const sep = target.profilesDir.includes("\\") ? "\\" : "/";
                    out.push({
                        ...meta,
                        sourcePath: `${trimTrailingSep(target.profilesDir)}${sep}${entry.name}`,
                        sourceTargetId: target.id,
                        sourceLabel: target.label,
                    });
                }
            } catch {
                continue;
            }
        }
        return out;
    }

    /** Read a full profile object from a remote target via the local cache. */
    async getRemoteProfile(target: SyncTarget, profileId: string): Promise<Profile | null> {
        const cacheRel = this.cacheRelDir(target);
        const dirName = basename(target.profilesDir);
        const cachedFile = `${cacheRel}/${dirName}/${profileId}.json`;
        const data = await getFile(cachedFile);
        if (data && typeof data === "object" && data.id) {
            return data as Profile;
        }
        return null;
    }

    /**
     * Copy a profile from a remote target into the current workspace's profiles
     * directory. Returns the imported profile metadata.
     */
    async pullProfile(target: SyncTarget, profileId: string): Promise<ProfileMeta> {
        await this.ensureCurrentWorkspace();
        // destDir must be workspace-relative – the kernel will resolve it under the
        // current workspace root. Passing an absolute path would be re-joined onto
        // the workspace root and silently land in a junk sub-directory.
        const localProfilesRel = `/${PROFILES_SUBPATH}`;

        await globalCopyFiles([this.remoteProfileFilePath(target, profileId)], localProfilesRel);
        this.supported = true;

        // Re-scan local profiles so the imported one is visible
        await this.configManager.refresh();
        const profile = await this.configManager.getProfile(profileId);
        if (!profile) {
            throw new Error("Profile pulled but could not be re-read locally");
        }
        return profile.meta;
    }

    /**
     * Pull a profile and immediately apply the requested modules from it.
     * `applyProfile` from the config manager is reused after the pull.
     */
    async pullAndApply(target: SyncTarget, profileId: string, modules: ConfigModule[]): Promise<void> {
        await this.pullProfile(target, profileId);
        await this.configManager.applyProfile(profileId, modules);
    }

    /**
     * Push a local profile to one or more sync targets. Errors per target are
     * collected and returned together rather than aborting the whole batch.
     *
     * NOTE: SiYuan's `globalCopyFiles` kernel API restricts the destination to a
     * path *inside the current workspace*. Pushing to another workspace's
     * profiles directory is therefore not possible from a single running kernel –
     * such targets are reported as failures rather than being silently mis-copied
     * into a junk sub-directory of the current workspace.
     */
    async pushProfile(profileId: string, targets: SyncTarget[]): Promise<{ failed: { target: SyncTarget; error: string }[] }> {
        const localWs = await this.ensureCurrentWorkspace();
        // The source path must be absolute. Build it from the current workspace root.
        const srcAbs = `${trimTrailingSep(localWs)}${localWs.includes("\\") ? "\\" : "/"}${PROFILES_SUBPATH.split("/").join(localWs.includes("\\") ? "\\" : "/")}/${profileId}.json`;
        const currentWsNorm = normalizeWorkspacePath(localWs);

        const failed: { target: SyncTarget; error: string }[] = [];
        for (const target of targets) {
            // Determine whether the target's profiles dir is inside the current
            // workspace. If not, the kernel will reject the copy (or worse, silently
            // write to a path inside the current workspace) – surface a clear error.
            const destRel = workspaceRelativeOrNull(target.profilesDir, currentWsNorm);
            if (destRel === null) {
                failed.push({
                    target,
                    error: "Cross-workspace push is not supported by the SiYuan kernel; open the target workspace and pull instead.",
                });
                continue;
            }
            try {
                await globalCopyFiles([srcAbs], destRel);
                this.supported = true;
            } catch (e: any) {
                failed.push({ target, error: e?.message || String(e) });
                if (this.supported === undefined) this.supported = false;
            }
        }
        return { failed };
    }

    /**
     * Push a profile to every available target (other workspaces + shared folder).
     * Used by the auto-push setting after saving / updating a profile.
     */
    async autoPush(profileId: string): Promise<{ failed: { target: SyncTarget; error: string }[] }> {
        const targets = this.listTargets();
        if (targets.length === 0) return { failed: [] };
        return this.pushProfile(profileId, targets);
    }

    // ── Internals ─────────────────────────────────────────────────

    private remoteProfileFilePath(target: SyncTarget, profileId: string): string {
        const sep = target.profilesDir.includes("\\") ? "\\" : "/";
        return `${trimTrailingSep(target.profilesDir)}${sep}${profileId}.json`;
    }

    private async ensureCurrentWorkspace(): Promise<string> {
        if (!this.currentWorkspace) {
            this.currentWorkspace = await getWorkspacePath();
        }
        if (!this.currentWorkspace) {
            throw new Error("Could not determine current workspace path");
        }
        return this.currentWorkspace;
    }

    /**
     * Best-effort recursive removal of a workspace-relative cache directory
     * by listing children and deleting them. The directory itself is removed
     * last via removeFile (which works for empty directories in SiYuan).
     */
    private async clearCache(relDir: string): Promise<void> {
        try {
            await removeRecursive(relDir);
        } catch {
            // Ignore cleanup errors – worst case is stale cache, which we'll
            // overwrite on the next copy.
        }
    }
}

/** Recursively remove a workspace-relative path. Silently no-ops on missing dirs. */
async function removeRecursive(relPath: string): Promise<void> {
    let entries: DirEntry[] = [];
    try {
        entries = await readDir(relPath);
    } catch {
        // Not a directory or doesn't exist – fall through to a single removeFile.
    }
    for (const entry of entries) {
        const child = `${relPath}/${entry.name}`;
        if (entry.isDir) {
            await removeRecursive(child);
        } else {
            try { await removeFile(child); } catch { /* ignore */ }
        }
    }
    try { await removeFile(relPath); } catch { /* ignore */ }
}

/** Sanitize a workspace folder name for use as a directory key in the cache. */
function sanitizeCacheKey(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]+/g, "_") || "workspace";
}

/**
 * If `absDir` is inside `currentWsNorm`, return the workspace-relative path
 * (with a leading "/" using POSIX separators, suitable for SiYuan API calls).
 * Otherwise return null. Comparison is case-insensitive on Windows drive letters.
 */
function workspaceRelativeOrNull(absDir: string, currentWsNorm: string): string | null {
    if (!currentWsNorm) return null;
    const targetNorm = normalizeWorkspacePath(absDir);
    const wsLower = currentWsNorm.toLowerCase();
    const targetLower = targetNorm.toLowerCase();
    if (targetLower !== wsLower && !targetLower.startsWith(wsLower + "/") && !targetLower.startsWith(wsLower + "\\")) {
        return null;
    }
    let rel = targetNorm.slice(currentWsNorm.length);
    rel = rel.replace(/\\/g, "/");
    if (!rel.startsWith("/")) rel = "/" + rel;
    return rel;
}
