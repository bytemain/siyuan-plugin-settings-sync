import { ConfigModule, isLiveApplyModule } from "../core/types";

/**
 * Build a user-facing "configuration applied" message that adapts to which
 * modules were actually applied:
 *
 *  - If no modules were applied, fall back to the generic success string.
 *  - If every applied module takes effect live (no SiYuan restart needed),
 *    show the short "applied" message without any restart hint.
 *  - Otherwise, list the modules that still require a restart so the user
 *    knows exactly which parts of SiYuan need restarting.
 */
export function buildApplySuccessMessage(applied: ConfigModule[], i18n: any): string {
    const generic = i18n?.applySuccess || "Configuration applied. Some settings may require a restart.";
    if (!applied || applied.length === 0) {
        return generic;
    }

    const needsRestart = applied.filter((m) => !isLiveApplyModule(m));
    if (needsRestart.length === 0) {
        return i18n?.applySuccessLive || "Configuration applied";
    }

    const moduleLabels = needsRestart.map((m) => i18n?.[m] || m).join(", ");
    const template: string = i18n?.applySuccessNeedsRestart
        || "Configuration applied. Restart SiYuan for these to take full effect: ${modules}";
    return template.replace("${modules}", moduleLabels);
}
