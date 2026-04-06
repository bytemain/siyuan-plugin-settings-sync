import { Dialog, showMessage } from "siyuan";
import { ConfigManager } from "../core/config-manager";
import { CONFIG_MODULES, ConfigModule, Platform, PLATFORM_LABELS } from "../core/types";
import { detectPlatform } from "../utils/platform";

/**
 * Open the "Save Profile" dialog, allowing user to name and configure
 * which modules to include in the saved profile.
 */
export function openSaveDialog(
    configManager: ConfigManager,
    i18n: any,
    onSaved: () => void,
): void {
    const currentPlatform = detectPlatform();

    const platformOptions = Object.entries(PLATFORM_LABELS)
        .map(([key, label]) => {
            const selected = key === currentPlatform ? "selected" : "";
            return `<option value="${key}" ${selected}>${label} (${key})</option>`;
        })
        .join("\n");

    const moduleCheckboxes = CONFIG_MODULES.map((mod) => {
        const label = i18n[mod] || mod;
        return `<label class="settings-sync__checkbox">
            <input type="checkbox" name="module" value="${mod}" checked />
            <span>${label}</span>
        </label>`;
    }).join("\n");

    const dialog = new Dialog({
        title: i18n.saveConfig || "Save Current Configuration",
        content: `<div class="settings-sync__save-dialog b3-dialog__content">
            <div class="settings-sync__form-group">
                <label class="settings-sync__label">${i18n.profileName || "Profile Name"}</label>
                <input class="b3-text-field settings-sync__input" type="text" name="profileName" value="" placeholder="${i18n.profileName || "Profile Name"}" />
            </div>
            <div class="settings-sync__form-group">
                <label class="settings-sync__label">${i18n.platformTag || "Platform"}</label>
                <select class="b3-select settings-sync__select" name="platform">
                    ${platformOptions}
                </select>
            </div>
            <div class="settings-sync__form-group">
                <label class="settings-sync__label">${i18n.description || "Description"}</label>
                <input class="b3-text-field settings-sync__input" type="text" name="description" value="" placeholder="${i18n.description || "Description"}" />
            </div>
            <div class="settings-sync__form-group">
                <label class="settings-sync__label">${i18n.saveContent || "Modules to save"}</label>
                <div class="settings-sync__modules">
                    ${moduleCheckboxes}
                </div>
            </div>
            <div class="settings-sync__form-actions">
                <button class="b3-button b3-button--cancel" data-action="cancel">${i18n.cancel || "Cancel"}</button>
                <button class="b3-button b3-button--text" data-action="save">${i18n.confirmSave || "Save"}</button>
            </div>
        </div>`,
        width: "520px",
    });

    const container = dialog.element;

    container.querySelector("[data-action=\"cancel\"]")?.addEventListener("click", () => {
        dialog.destroy();
    });

    container.querySelector("[data-action=\"save\"]")?.addEventListener("click", async () => {
        const nameInput = container.querySelector("input[name=\"profileName\"]") as HTMLInputElement;
        const platformSelect = container.querySelector("select[name=\"platform\"]") as HTMLSelectElement;
        const descInput = container.querySelector("input[name=\"description\"]") as HTMLInputElement;
        const moduleChecks = container.querySelectorAll("input[name=\"module\"]:checked");

        const name = nameInput?.value?.trim();
        if (!name) {
            showMessage(i18n.nameRequired || "Please enter a profile name");
            return;
        }

        const platform = (platformSelect?.value || currentPlatform) as Platform;
        const description = descInput?.value?.trim() || "";
        const modules: ConfigModule[] = [];
        moduleChecks.forEach((el: Element) => {
            modules.push((el as HTMLInputElement).value as ConfigModule);
        });

        if (modules.length === 0) {
            showMessage(i18n.modulesRequired || "Please select at least one module");
            return;
        }

        try {
            await configManager.saveProfile({ name, platform, modules, description });
            showMessage(i18n.saveSuccess || "Configuration saved");
            dialog.destroy();
            onSaved();
        } catch (e: any) {
            showMessage(`${i18n.saveFailed || "Save failed"}: ${e.message}`);
        }
    });
}
