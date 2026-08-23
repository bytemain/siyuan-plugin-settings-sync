import { ApplyResult, isLiveApplyModule } from "../core/types";

/**
 * Build a user-facing "configuration applied" message that adapts to what
 * actually happened during the apply:
 *
 *  - If no modules were applied, fall back to the generic success string.
 *  - If every applied module takes effect live (no SiYuan restart needed),
 *    show the short "applied" message without any restart hint.
 *  - Otherwise, list the modules that still require a restart so the user
 *    knows exactly which parts of SiYuan need restarting.
 *  - Modules migrated across a SiYuan version boundary (e.g. the ai module
 *    between the 3.6 and 3.8 shapes) get an explicit note so the silent
 *    data reshaping is visible.
 *  - Modules skipped as inapplicable on this SiYuan version are listed so
 *    the user doesn't mistake their absence from the applied list for
 *    success.
 */
export function buildApplySuccessMessage(result: ApplyResult, i18n: any): string {
    const applied = result?.applied || [];
    const generic = i18n?.applySuccess || "Configuration applied. Some settings may require a restart.";

    let base: string;
    if (applied.length === 0) {
        base = generic;
    } else {
        const needsRestart = applied.filter((m) => !isLiveApplyModule(m));
        if (needsRestart.length === 0) {
            base = i18n?.applySuccessLive || "Configuration applied";
        } else {
            const moduleLabels = needsRestart.map((m) => i18n?.[m] || m).join(", ");
            const template: string = i18n?.applySuccessNeedsRestart
                || "Configuration applied. Restart SiYuan for these to take full effect: ${modules}";
            base = template.replace("${modules}", moduleLabels);
        }
    }

    const notes: string[] = [];
    const migrated = result?.migrated || [];
    const toNewer = migrated.filter((m) => m.direction === "toNewer").map((m) => m.module);
    const toOlder = migrated.filter((m) => m.direction === "toOlder").map((m) => m.module);
    if (toNewer.length) {
        const labels = toNewer.map((m) => i18n?.[m] || m).join(", ");
        notes.push((i18n?.applyMigratedToNewerNote
            || "These settings came from an older SiYuan and were converted to the new format: ${modules} (API keys, endpoints and models kept)").replace("${modules}", labels));
    }
    if (toOlder.length) {
        const labels = toOlder.map((m) => i18n?.[m] || m).join(", ");
        notes.push((i18n?.applyMigratedToOlderNote
            || "These settings came from a newer SiYuan and the usable parts were converted: ${modules} (features that only exist in the newer version are unavailable here)").replace("${modules}", labels));
    }
    if (result?.skipped?.length) {
        const labels = result.skipped.map((m) => i18n?.[m] || m).join(", ");
        notes.push((i18n?.applySkippedNote
            || "Incompatible with this SiYuan version, your existing settings were kept: ${modules}").replace("${modules}", labels));
    }
    return [base, ...notes].join(" ");
}
