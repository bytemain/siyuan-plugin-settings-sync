import { getBackend, getFrontend } from "siyuan";
import { Platform, PLATFORM_LABELS } from "../core/types";

/**
 * Detect the current platform from SiYuan's backend identifier.
 */
export function detectPlatform(): Platform {
    const backend = getBackend();
    // Derive known platforms from PLATFORM_LABELS to stay in sync with type definitions
    const knownPlatforms = Object.keys(PLATFORM_LABELS).filter((k) => k !== "all") as Platform[];
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
