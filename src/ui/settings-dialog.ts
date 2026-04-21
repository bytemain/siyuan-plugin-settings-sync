import { Dialog, showMessage } from "siyuan";
import { ConfigManager } from "../core/config-manager";
import { DEFAULT_SKIP_KEYS } from "../core/types";

/**
 * Open the "Settings" dialog where the user can configure skip keys
 * and the optional shared-folder / auto-push behavior used by the
 * multi-workspace sync feature.
 */
export function openSettingsDialog(
    configManager: ConfigManager,
    i18n: any,
    isMobile: boolean = false,
    onSaved?: () => void,
): void {
    const currentKeys = configManager.getSkipKeys();
    const currentSharedFolder = configManager.getSharedFolder();
    const currentAutoPush = configManager.getAutoPushOnSave();

    const dialog = new Dialog({
        title: `⚙️ ${i18n.settingsTitle || "Plugin Settings"}`,
        content: `<div class="settings-sync__settings-dialog b3-dialog__content">
            <div class="settings-sync__form-group">
                <label class="settings-sync__label">${i18n.skipKeysLabel || "Skip Keys"}</label>
                <div class="settings-sync__skip-keys-help">${i18n.skipKeysHelp || "Keys listed here will be excluded when saving and applying profiles. Use <code>module.property</code> format, one per line."}</div>
                <textarea class="b3-text-field settings-sync__skip-keys-input" name="skipKeys" rows="6" placeholder="export.pandocBin"></textarea>
            </div>
            <div class="settings-sync__form-group">
                <button class="b3-button b3-button--small b3-button--outline" data-action="reset-defaults">${i18n.resetDefaults || "Reset to Defaults"}</button>
            </div>
            <hr class="settings-sync__divider" />
            <div class="settings-sync__form-group">
                <label class="settings-sync__label">${i18n.sharedFolderLabel || "Shared Folder (absolute path)"}</label>
                <div class="settings-sync__skip-keys-help">${i18n.sharedFolderHelp || "Optional. When set, this folder appears as a sync target alongside other workspaces. All workspaces can push / pull profiles through it."}</div>
                <input class="b3-text-field settings-sync__input" name="sharedFolder" placeholder="/Users/me/SiyuanSharedProfiles" />
            </div>
            <div class="settings-sync__form-group">
                <label class="settings-sync__label">
                    <input type="checkbox" name="autoPushOnSave" />
                    ${i18n.autoPushLabel || "Auto-push to other workspaces when saving / updating a profile"}
                </label>
                <div class="settings-sync__skip-keys-help">${i18n.autoPushHelp || "When enabled, every save or update is also copied to all known workspaces and the shared folder (if configured)."}</div>
            </div>
            <div class="settings-sync__form-actions">
                <button class="b3-button b3-button--cancel" data-action="cancel">${i18n.cancel || "Cancel"}</button>
                <button class="b3-button b3-button--text" data-action="save-settings">${i18n.save || "Save"}</button>
            </div>
        </div>`,
        width: isMobile ? "100%" : "560px",
    });

    const container = dialog.element;
    const textarea = container.querySelector("textarea[name=\"skipKeys\"]") as HTMLTextAreaElement;
    const sharedInput = container.querySelector("input[name=\"sharedFolder\"]") as HTMLInputElement;
    const autoPushInput = container.querySelector("input[name=\"autoPushOnSave\"]") as HTMLInputElement;

    // Set values via property assignment (avoids HTML-injection through value attributes)
    textarea.value = currentKeys.join("\n");
    sharedInput.value = currentSharedFolder;
    autoPushInput.checked = currentAutoPush;

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
        const sharedFolder = sharedInput.value.trim();
        const autoPush = autoPushInput.checked;
        try {
            await configManager.setSkipKeys(keys);
            await configManager.setWorkspaceSyncSettings(sharedFolder, autoPush);
            showMessage(i18n.settingsSaved || "Settings saved");
            dialog.destroy();
            onSaved?.();
        } catch (e: any) {
            showMessage(`${i18n.settingsSaveFailed || "Failed to save settings"}: ${e.message}`);
        }
    });
}
