/**
 * Utilities for stripping / preserving "skip keys" — machine-specific
 * configuration properties that should not be synced between devices.
 *
 * Skip keys use dot-notation relative to a config module, e.g.
 *   "export.pandocBin"  →  module="export", property path=["pandocBin"]
 */

/** Delete a value at a dot-separated path inside an object. */
function deleteByPath(obj: any, path: string[]): void {
    if (!obj || typeof obj !== "object" || path.length === 0) return;
    if (path.length === 1) {
        delete obj[path[0]];
        return;
    }
    deleteByPath(obj[path[0]], path.slice(1));
}

/** Read a value at a dot-separated path inside an object. */
function getByPath(obj: any, path: string[]): any {
    if (obj == null || typeof obj !== "object" || path.length === 0) return undefined;
    if (path.length === 1) return obj[path[0]];
    return getByPath(obj[path[0]], path.slice(1));
}

/** Write a value at a dot-separated path inside an object. */
function setByPath(obj: any, path: string[], value: any): void {
    if (!obj || typeof obj !== "object" || path.length === 0) return;
    if (path.length === 1) {
        obj[path[0]] = value;
        return;
    }
    if (obj[path[0]] == null || typeof obj[path[0]] !== "object") {
        obj[path[0]] = {};
    }
    setByPath(obj[path[0]], path.slice(1), value);
}

/**
 * Remove skip keys from a module's data (used when **saving** a profile).
 *
 * @param moduleData Deep-cloned module config object (will be mutated)
 * @param mod        Module name, e.g. "export"
 * @param skipKeys   Full skip-key list, e.g. ["export.pandocBin"]
 * @returns The same `moduleData` object with matching keys deleted
 */
export function stripSkipKeys(moduleData: any, mod: string, skipKeys: string[]): any {
    for (const key of skipKeys) {
        const parts = key.split(".");
        if (parts[0] === mod && parts.length > 1) {
            deleteByPath(moduleData, parts.slice(1));
        }
    }
    return moduleData;
}

/**
 * Preserve local skip-key values when **applying** a profile.
 *
 * For every skip key that belongs to `mod`, copy the current device value
 * into `profileData` so the local machine-specific value is not overwritten.
 *
 * @param profileData  Deep-cloned profile module config (will be mutated)
 * @param currentData  Current device's module config
 * @param mod          Module name
 * @param skipKeys     Full skip-key list
 * @returns The same `profileData` with local values injected
 */
export function preserveLocalSkipKeys(
    profileData: any,
    currentData: any,
    mod: string,
    skipKeys: string[],
): any {
    for (const key of skipKeys) {
        const parts = key.split(".");
        if (parts[0] === mod && parts.length > 1) {
            const propPath = parts.slice(1);
            const localValue = getByPath(currentData, propPath);
            if (localValue !== undefined) {
                setByPath(profileData, propPath, localValue);
            } else {
                // Current device doesn't have the key — remove it from profile too
                deleteByPath(profileData, propPath);
            }
        }
    }
    return profileData;
}
