import { DeviceInfo, PLATFORM_LABELS, ProfileMeta } from "../core/types";

/** "3.8.1" → "3.8"; null when the version string is missing or unparsable. */
function majorMinor(version: string): string | null {
    const m = /^(\d+)\.(\d+)/.exec(version || "");
    return m ? `${m[1]}.${m[2]}` : null;
}

/**
 * Build the user-facing compatibility warnings for applying a profile on
 * the current device: platform mismatch (profile tagged for another OS)
 * and SiYuan major.minor version mismatch (e.g. a 3.6 profile on 3.8).
 *
 * These wire up the long-standing `crossPlatformWarning` /
 * `versionMismatchWarning` i18n strings, which existed but were never
 * referenced by the UI. Returns an empty array when fully compatible.
 */
export function buildCompatWarnings(
    meta: Pick<ProfileMeta, "platform" | "siyuanVersion">,
    device: DeviceInfo,
    i18n: any,
): string[] {
    const warnings: string[] = [];

    if (meta.platform && meta.platform !== "all" && device.platform && meta.platform !== device.platform) {
        const source = PLATFORM_LABELS[meta.platform] || meta.platform;
        const current = PLATFORM_LABELS[device.platform] || device.platform;
        warnings.push(
            (i18n?.crossPlatformWarning || "This profile is from ${source} and may not be fully compatible with ${current}.")
                .replace("${source}", source)
                .replace("${current}", current),
        );
    }

    const srcVer = majorMinor(meta.siyuanVersion);
    const curVer = majorMinor(device.siyuanVersion);
    if (srcVer && curVer && srcVer !== curVer) {
        warnings.push(
            (i18n?.versionMismatchWarning || "This profile is from SiYuan ${source}, current version is ${current}. There may be compatibility differences.")
                .replace("${source}", meta.siyuanVersion)
                .replace("${current}", device.siyuanVersion),
        );
    }

    return warnings;
}
