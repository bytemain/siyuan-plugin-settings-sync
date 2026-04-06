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

/** Read a JSON file from SiYuan's data directory */
export function getFile(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
        fetchPost("/api/file/getFile", { path }, (response: any) => {
            // getFile returns the file content directly when successful,
            // or an error object { code: 404, ... } when file doesn't exist
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
