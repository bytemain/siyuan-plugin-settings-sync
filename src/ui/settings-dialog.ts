import { Dialog, showMessage } from "siyuan";
import { ConfigManager } from "../core/config-manager";
import { DEFAULT_SKIP_KEYS } from "../core/types";

/**
 * Open the "Settings" dialog where the user can configure skip keys.
 */
export function openSettingsDialog(
    configManager: ConfigManager,
    i18n: any,
): void {
    const currentKeys = configManager.getSkipKeys();

    const dialog = new Dialog({
        title: `⚙️ ${i18n.settingsTitle || "Plugin Settings"}`,
        content: `<div class="settings-sync__settings-dialog b3-dialog__content">
            <div class="settings-sync__form-group">
                <label class="settings-sync__label">${i18n.skipKeysLabel || "Skip Keys"}</label>
                <div class="settings-sync__skip-keys-help">${i18n.skipKeysHelp || "Keys listed here will be excluded when saving and applying profiles. Use <code>module.property</code> format, one per line."}</div>
                <textarea class="b3-text-field settings-sync__skip-keys-input" name="skipKeys" rows="6" placeholder="export.pandocBin">${escapeHtml(currentKeys.join("\n"))}</textarea>
            </div>
            <div class="settings-sync__form-group">
                <button class="b3-button b3-button--small b3-button--outline" data-action="reset-defaults">${i18n.resetDefaults || "Reset to Defaults"}</button>
            </div>
            <div class="settings-sync__form-actions">
                <button class="b3-button b3-button--cancel" data-action="cancel">${i18n.cancel || "Cancel"}</button>
                <button class="b3-button b3-button--text" data-action="save-settings">${i18n.save || "Save"}</button>
            </div>
        </div>`,
        width: "520px",
    });

    const container = dialog.element;
    const textarea = container.querySelector("textarea[name=\"skipKeys\"]") as HTMLTextAreaElement;

    container.querySelector("[data-action=\"reset-defaults\"]")?.addEventListener("click", () => {
        textarea.value = DEFAULT_SKIP_KEYS.join("\n");
    });

    container.querySelector("[data-action=\"cancel\"]")?.addEventListener("click", () => {
        dialog.destroy();
    });

    container.querySelector("[data-action=\"save-settings\"]")?.addEventListener("click", async () => {
        const raw = textarea.value;
        const keys = raw
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && line.includes("."));
        try {
            await configManager.setSkipKeys(keys);
            showMessage(i18n.settingsSaved || "Settings saved");
            dialog.destroy();
        } catch (e: any) {
            showMessage(`${i18n.settingsSaveFailed || "Failed to save settings"}: ${e.message}`);
        }
    });
}

function escapeHtml(str: string): string {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
