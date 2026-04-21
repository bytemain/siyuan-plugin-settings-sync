import { fetchPost } from "siyuan";
import { ConfigModule, MODULE_API_MAP } from "./types";

/**
 * Wrapper around SiYuan kernel APIs used by the settings sync plugin.
 */

/** Fetch the full SiYuan configuration via /api/system/getConf */
export function getConf(): Promise<any> {
    return new Promise((resolve, reject) => {
        fetchPost("/api/system/getConf", {}, (response: any) => {
            if (response.code === 0) {
                resolve(response.data);
            } else {
                reject(new Error(response.msg || "Failed to get conf"));
            }
        });
    });
}

/** Get the workspace directory path from SiYuan's conf */
export async function getWorkspacePath(): Promise<string> {
    const data = await getConf();
    return data?.conf?.system?.workspaceDir || "";
}

/**
 * Apply a single configuration module using its corresponding set* API.
 *
 * After a successful update, also patch `window.siyuan.config[module]` with
 * the kernel's response (or the data we sent if the kernel returns nothing).
 * This mirrors what SiYuan's own settings UI does after each `setXxx` call
 * and is what allows changes to "feel" live for modules whose kernel handler
 * does not broadcast a UI update — reopening the SiYuan settings dialog
 * picks up the new values without requiring a restart.
 */
export function setConfModule(module: ConfigModule, data: any): Promise<void> {
    const api = MODULE_API_MAP[module];
    // setKeymap expects the keymap wrapped in a "data" property
    const payload = module === "keymap" ? { data } : data;
    return new Promise((resolve, reject) => {
        fetchPost(api, payload, (response: any) => {
            if (response.code === 0) {
                try {
                    syncWindowConfig(module, response?.data ?? data);
                } catch (e) {
                    // Patching window.siyuan.config is best-effort and must not
                    // break the apply flow if the runtime layout is unexpected.
                    console.debug(`[settings-sync] Failed to patch window.siyuan.config.${module}:`, e);
                }
                resolve();
            } else {
                console.error(`[settings-sync] Failed to set ${module}:`, response);
                reject(new Error(response.msg || `Failed to set ${module}`));
            }
        });
    });
}

/**
 * Patch `window.siyuan.config[module]` with the freshly-applied data so that
 * any subsequent reads from the in-memory config (e.g. when the user reopens
 * SiYuan's settings dialog) reflect the new values without a restart.
 *
 * Exported for use by other apply helpers (e.g. partial / single-setting apply).
 */
export function syncWindowConfig(module: ConfigModule, data: any): void {
    if (data == null) {
        return;
    }
    const win = (typeof window !== "undefined" ? window : undefined) as any;
    const cfg = win?.siyuan?.config;
    if (!cfg) {
        return;
    }
    if (module === "keymap") {
        // setKeymap accepts/returns a wrapped { data: keymap } shape in some
        // contexts; normalise to the bare keymap object.
        cfg.keymap = data?.data ?? data;
    } else {
        cfg[module] = data;
    }
}

/** Read a JSON file from SiYuan's data directory. Returns parsed JSON on success, or null if not found. */
export function getFile(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
        fetchPost("/api/file/getFile", { path }, (response: any) => {
            // getFile returns the parsed file content on success,
            // or an object with { code: 404 } when the file doesn't exist,
            // or { code: <non-zero> } for other errors.
            if (response && response.code === 404) {
                resolve(null);
            } else if (response && response.code && response.code !== 0) {
                reject(new Error(response.msg || "Failed to get file"));
            } else {
                resolve(response);
            }
        });
    });
}

/** Write a JSON file to SiYuan's data directory */
export function putFile(path: string, content: any): Promise<void> {
    const formData = new FormData();
    formData.append("path", path);
    formData.append("isDir", "false");
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: "application/json" });
    formData.append("file", blob);

    return new Promise((resolve, reject) => {
        fetch("/api/file/putFile", {
            method: "POST",
            body: formData,
        }).then(resp => resp.json()).then(response => {
            if (response.code === 0) {
                resolve();
            } else {
                reject(new Error(response.msg || "Failed to put file"));
            }
        }).catch(reject);
    });
}

/** Directory entry returned by /api/file/readDir */
export interface DirEntry {
    name: string;
    isDir: boolean;
}

/** List files in a directory. Returns an array of entries, or empty array if dir doesn't exist. */
export function readDir(path: string): Promise<DirEntry[]> {
    return new Promise((resolve, reject) => {
        fetchPost("/api/file/readDir", { path }, (response: any) => {
            if (response && response.code === 404) {
                resolve([]);
            } else if (response && response.code && response.code !== 0) {
                reject(new Error(response.msg || "Failed to read directory"));
            } else if (response && response.data) {
                resolve(response.data as DirEntry[]);
            } else {
                resolve([]);
            }
        });
    });
}

/** Remove a file from SiYuan's data directory */
export function removeFile(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
        fetchPost("/api/file/removeFile", { path }, (response: any) => {
            if (response.code === 0) {
                resolve();
            } else {
                reject(new Error(response.msg || "Failed to remove file"));
            }
        });
    });
}

/** A SiYuan workspace as reported by /api/system/getWorkspaces */
export interface WorkspaceInfo {
    /** Absolute filesystem path to the workspace root */
    path: string;
    /** True when the workspace is recorded but not currently open in any kernel */
    closed: boolean;
}

/**
 * List all SiYuan workspaces known to the running kernel.
 * Returns an empty array if the endpoint is unavailable (older versions / sandboxed builds).
 */
export function getWorkspaces(): Promise<WorkspaceInfo[]> {
    return new Promise((resolve) => {
        fetchPost("/api/system/getWorkspaces", {}, (response: any) => {
            if (response && response.code === 0 && Array.isArray(response.data)) {
                const list = response.data
                    .filter((w: any) => w && typeof w.path === "string")
                    .map((w: any) => ({ path: w.path as string, closed: !!w.closed }));
                resolve(list);
            } else {
                resolve([]);
            }
        });
    });
}

/**
 * Copy files / directories at absolute filesystem paths into another absolute directory.
 * Wraps /api/file/globalCopyFiles. The destination directory is created if needed.
 * Each entry in `srcs` is copied into `destDir` using its basename (directories are copied recursively).
 */
export function globalCopyFiles(srcs: string[], destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
        fetchPost("/api/file/globalCopyFiles", { srcs, destDir }, (response: any) => {
            if (response && response.code === 0) {
                resolve();
            } else {
                reject(new Error(response?.msg || "Failed to globalCopyFiles"));
            }
        });
    });
}

/**
 * Trigger SiYuan cloud sync.
 * Calls /api/sync/performSync to request the kernel to sync data.
 * This is a best-effort operation – errors are logged but not thrown,
 * because older SiYuan versions may not expose this endpoint.
 */
export async function performSync(): Promise<void> {
    try {
        const response = await fetch("/api/sync/performSync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        if (response.ok) {
            console.log("[settings-sync] Triggered SiYuan cloud sync");
        } else {
            console.debug("[settings-sync] performSync returned status:", response.status);
        }
    } catch (e) {
        console.debug("[settings-sync] Failed to trigger cloud sync:", e);
    }
}
