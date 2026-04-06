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

/** Apply a single configuration module using its corresponding set* API */
export function setConfModule(module: ConfigModule, data: any): Promise<void> {
    const api = MODULE_API_MAP[module];
    return new Promise((resolve, reject) => {
        fetchPost(api, data, (response: any) => {
            if (response.code === 0) {
                resolve();
            } else {
                reject(new Error(response.msg || `Failed to set ${module}`));
            }
        });
    });
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
