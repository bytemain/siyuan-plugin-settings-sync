import { PROFILES_SUBPATH } from "../core/types";

/**
 * Detect whether an absolute path uses Windows-style separators.
 * Heuristic: a Windows drive prefix (e.g. "C:\") or any backslash separator.
 */
export function isWindowsPath(p: string): boolean {
    return /^[a-zA-Z]:[\\/]/.test(p) || p.includes("\\");
}

/**
 * Pick the path separator that matches the supplied absolute path.
 * Falls back to "/" when the path is empty.
 */
export function separatorFor(p: string): string {
    return isWindowsPath(p) ? "\\" : "/";
}

/** Strip trailing path separators from an absolute path. */
export function trimTrailingSep(p: string): string {
    return p.replace(/[\\/]+$/, "");
}

/**
 * Join an absolute workspace root with a POSIX-style sub-path, using the
 * separator style of the workspace path.
 */
export function joinWorkspacePath(workspacePath: string, subPath: string): string {
    if (!workspacePath) return subPath;
    const sep = separatorFor(workspacePath);
    const root = trimTrailingSep(workspacePath);
    const tail = subPath.replace(/^[\\/]+/, "").split(/[\\/]/).join(sep);
    return `${root}${sep}${tail}`;
}

/**
 * Compute the absolute filesystem path to the profiles directory of a given workspace.
 */
export function remoteProfilesDir(workspacePath: string): string {
    return joinWorkspacePath(workspacePath, PROFILES_SUBPATH);
}

/**
 * Extract the basename of an absolute path (works for both Windows and POSIX).
 * Returns the original path if it has no separator.
 */
export function basename(p: string): string {
    const trimmed = trimTrailingSep(p);
    const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
    return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

/**
 * Normalize a workspace path for comparison. Lower-cases drive letters on Windows
 * and strips trailing separators so that semantically-equivalent paths match.
 */
export function normalizeWorkspacePath(p: string): string {
    if (!p) return "";
    let out = trimTrailingSep(p);
    if (/^[a-zA-Z]:/.test(out)) {
        out = out[0].toLowerCase() + out.slice(1);
    }
    return out;
}
