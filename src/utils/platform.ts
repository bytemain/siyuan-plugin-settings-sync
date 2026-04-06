import { getBackend, getFrontend } from "siyuan";
import { Platform } from "../core/types";

/**
 * Detect the current platform from SiYuan's backend identifier.
 */
export function detectPlatform(): Platform {
    const backend = getBackend();
    const knownPlatforms: Platform[] = ["windows", "darwin", "linux", "android", "ios", "harmony", "docker"];
    if (knownPlatforms.includes(backend as Platform)) {
        return backend as Platform;
    }
    return "all";
}

/**
 * Check if the current frontend is a mobile interface.
 */
export function isMobile(): boolean {
    const frontend = getFrontend();
    return frontend === "mobile" || frontend === "browser-mobile";
}

/**
 * Get a human-readable device name.
 * Falls back to platform + frontend description.
 */
export function getDeviceName(): string {
    const frontend = getFrontend();
    const backend = getBackend();
    return `${backend}-${frontend}`;
}
