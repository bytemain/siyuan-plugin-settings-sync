import { Dialog, showMessage } from "siyuan";
import { ConfigManager } from "../core/config-manager";
import { CONFIG_MODULES, ConfigModule, ProfileMeta, PLATFORM_LABELS, Platform } from "../core/types";
import { detectPlatform } from "../utils/platform";

/**
 * Open the "Apply Profile" dialog, showing warnings and module selection.
 */
export function openApplyDialog(
    configManager: ConfigManager,
    profile: ProfileMeta,
    i18n: any,
    onApplied: () => void,
    isMobile: boolean = false,
): void {
    const currentPlatform = detectPlatform();
    const isCrossPlatform = profile.platform !== "all" && profile.platform !== currentPlatform;

    const profilePlatformLabel = PLATFORM_LABELS[profile.platform as Platform] || profile.platform;
    const currentPlatformLabel = PLATFORM_LABELS[currentPlatform] || currentPlatform;

    const crossPlatformWarning = isCrossPlatform
        ? `<div class="settings-sync__warning">
            ⚠️ ${(i18n.crossPlatformWarning || "This profile is from ${source} platform, may not be fully compatible with ${current}.")
            .replace("${source}", profilePlatformLabel)
            .replace("${current}", currentPlatformLabel)}
        </div>`
        : "";

    const confirmText = (i18n.confirmApply || "Apply configuration \"${name}\" to current device?")
        .replace("${name}", profile.name);

    const moduleCheckboxes = CONFIG_MODULES.map((mod) => {
        const label = i18n[mod] || mod;
        return `<label class="settings-sync__checkbox">
            <input type="checkbox" name="module" value="${mod}" checked />
            <span>${label}</span>
        </label>`;
    }).join("\n");

    const dialog = new Dialog({
        title: i18n.applyConfig || "Apply Configuration",
        content: `<div class="settings-sync__apply-dialog b3-dialog__content">
            <div class="settings-sync__confirm-text">${confirmText}</div>
            ${crossPlatformWarning}
            <div class="settings-sync__form-group">
                <label class="settings-sync__label">${i18n.selectModules || "Select modules to apply"}:</label>
                <div class="settings-sync__modules">
                    ${moduleCheckboxes}
                </div>
            </div>
            <div class="settings-sync__apply-warning">
                ⚠️ ${i18n.applyWarning || "Applying will overwrite current settings. Consider saving a backup first."}
            </div>
            <div class="settings-sync__form-actions">
                <button class="b3-button b3-button--cancel" data-action="cancel">${i18n.cancel || "Cancel"}</button>
                <button class="b3-button b3-button--outline" data-action="backup-apply">${i18n.backupAndApply || "Backup & Apply"}</button>
                <button class="b3-button b3-button--text" data-action="apply">${i18n.apply || "Apply"}</button>
            </div>
        </div>`,
        width: isMobile ? "100%" : "520px",
    });

    const container = dialog.element;

    container.querySelector("[data-action=\"cancel\"]")?.addEventListener("click", () => {
        dialog.destroy();
    });

    const doApply = async (withBackup: boolean) => {
        const moduleChecks = container.querySelectorAll("input[name=\"module\"]:checked");
        const modules: ConfigModule[] = [];
        moduleChecks.forEach((el: Element) => {
            modules.push((el as HTMLInputElement).value as ConfigModule);
        });

        if (modules.length === 0) {
            showMessage(i18n.modulesRequired || "Please select at least one module");
            return;
        }

        try {
            if (withBackup) {
                await configManager.createAutoBackup(i18n.autoBackupPrefix || "Auto backup before apply");
            }
            await configManager.applyProfile(profile.id, modules);
            showMessage(i18n.applySuccess || "Configuration applied. Some settings may require a restart.");
            dialog.destroy();
            onApplied();
        } catch (e: any) {
            showMessage(`${i18n.applyFailed || "Apply failed"}: ${e.message}`);
        }
    };

    container.querySelector("[data-action=\"apply\"]")?.addEventListener("click", () => doApply(false));
    container.querySelector("[data-action=\"backup-apply\"]")?.addEventListener("click", () => doApply(true));
}
