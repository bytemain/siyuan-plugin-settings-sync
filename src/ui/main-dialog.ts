import { confirm, Dialog, showMessage } from "siyuan";
import { ConfigManager } from "../core/config-manager";
import { PLATFORM_LABELS, ProfileMeta } from "../core/types";
import { detectPlatform } from "../utils/platform";
import { renderProfileCard } from "./profile-card";
import { openSaveDialog } from "./save-dialog";
import { openApplyDialog } from "./apply-dialog";

/**
 * Open the main "Settings Sync Manager" dialog.
 */
export function openMainDialog(
    configManager: ConfigManager,
    i18n: any,
): void {
    const currentPlatform = detectPlatform();
    const deviceInfo = configManager.getDeviceInfo();
    const currentPlatformLabel = PLATFORM_LABELS[currentPlatform] || currentPlatform;

    const filterOptions = [
        `<option value="current" selected>${i18n.filterCurrentPlatform || "Current Platform"}</option>`,
        `<option value="all">${i18n.filterAll || "All"}</option>`,
        ...Object.entries(PLATFORM_LABELS).map(([key, label]) =>
            `<option value="${key}">${label}</option>`
        ),
    ].join("\n");

    const dialog = new Dialog({
        title: `⚙️ ${i18n.pluginName || "Settings Sync"}`,
        content: `<div class="settings-sync__main b3-dialog__content">
            <div class="settings-sync__device-info">
                <div class="settings-sync__device-row">
                    <span>${i18n.platform || "Platform"}: <b>${currentPlatformLabel} (${currentPlatform})</b></span>
                    <span>${i18n.version || "Version"}: <b>v${deviceInfo.siyuanVersion}</b></span>
                </div>
                <div class="settings-sync__device-actions">
                    <button class="b3-button b3-button--text" data-action="save-new">📤 ${i18n.saveConfig || "Save Current Config"}</button>
                </div>
            </div>
            <div class="settings-sync__profiles-header">
                <span class="settings-sync__profiles-title">${i18n.savedProfiles || "Saved Profiles"}</span>
                <div class="settings-sync__filter">
                    <select class="b3-select settings-sync__filter-select" data-action="filter">
                        ${filterOptions}
                    </select>
                    <button class="b3-button b3-button--small b3-button--outline" data-action="refresh" title="${i18n.refresh || "Refresh"}">🔄</button>
                </div>
            </div>
            <div class="settings-sync__profiles-list" data-container="profiles">
                <div class="settings-sync__loading">${i18n.loading || "Loading..."}</div>
            </div>
        </div>`,
        width: "720px",
    });

    const container = dialog.element;
    const profilesContainer = container.querySelector("[data-container=\"profiles\"]") as HTMLElement;

    let currentFilter = "current";

    const refreshList = async () => {
        try {
            await configManager.refresh();
            const profiles = await configManager.listProfiles();
            renderProfiles(profiles);
        } catch (e: any) {
            profilesContainer.innerHTML = `<div class="settings-sync__error">${e.message}</div>`;
        }
    };

    const renderProfiles = (profiles: ProfileMeta[]) => {
        let filtered = profiles;
        if (currentFilter === "current") {
            filtered = profiles.filter(
                (p) => p.platform === currentPlatform || p.platform === "all"
            );
        } else if (currentFilter !== "all") {
            filtered = profiles.filter((p) => p.platform === currentFilter);
        }

        if (filtered.length === 0) {
            profilesContainer.innerHTML = `<div class="settings-sync__empty">${i18n.noProfiles || "No saved profiles"}</div>`;
            return;
        }

        profilesContainer.innerHTML = filtered
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .map((p) => renderProfileCard(p, i18n))
            .join("");

        bindCardActions();
    };

    const bindCardActions = () => {
        profilesContainer.querySelectorAll("[data-action]").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                const action = (e.currentTarget as HTMLElement).getAttribute("data-action");
                const id = (e.currentTarget as HTMLElement).getAttribute("data-id");
                if (!id) return;

                switch (action) {
                    case "apply":
                        await handleApply(id);
                        break;
                    case "rename":
                        await handleRename(id);
                        break;
                    case "update":
                        await handleUpdate(id);
                        break;
                    case "delete":
                        await handleDelete(id);
                        break;
                }
            });
        });
    };

    const handleApply = async (profileId: string) => {
        const profiles = await configManager.listProfiles();
        const profile = profiles.find((p) => p.id === profileId);
        if (!profile) return;

        openApplyDialog(configManager, profile, i18n, () => refreshList());
    };

    const handleRename = async (profileId: string) => {
        const card = profilesContainer.querySelector(`[data-profile-id="${profileId}"]`);
        if (!card) return;

        const nameEl = card.querySelector(".settings-sync__card-name") as HTMLElement;
        if (!nameEl) return;

        const currentName = nameEl.textContent || "";
        const input = document.createElement("input");
        input.className = "b3-text-field settings-sync__rename-input";
        input.value = currentName;
        nameEl.replaceWith(input);
        input.focus();
        input.select();

        const doRename = async () => {
            const newName = input.value.trim();
            if (newName && newName !== currentName) {
                try {
                    await configManager.renameProfile(profileId, newName);
                    showMessage(i18n.renameSuccess || "Renamed successfully");
                } catch (e: any) {
                    showMessage(`${i18n.renameFailed || "Rename failed"}: ${e.message}`);
                }
            }
            await refreshList();
        };

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                doRename();
            } else if (e.key === "Escape") {
                refreshList();
            }
        });
        input.addEventListener("blur", () => doRename());
    };

    const handleUpdate = async (profileId: string) => {
        const profiles = await configManager.listProfiles();
        const profile = profiles.find((p) => p.id === profileId);
        if (!profile) return;

        const msg = (i18n.confirmUpdate || "Overwrite \"${name}\" with current device config?")
            .replace("${name}", profile.name);

        confirm(i18n.update || "Update", msg, async () => {
            try {
                await configManager.updateProfile(profileId);
                showMessage(i18n.updateSuccess || "Configuration updated");
                await refreshList();
            } catch (e: any) {
                showMessage(`${i18n.updateFailed || "Update failed"}: ${e.message}`);
            }
        });
    };

    const handleDelete = async (profileId: string) => {
        const profiles = await configManager.listProfiles();
        const profile = profiles.find((p) => p.id === profileId);
        if (!profile) return;

        const msg = (i18n.confirmDelete || "Delete profile \"${name}\"? This cannot be undone.")
            .replace("${name}", profile.name);

        confirm(i18n.delete || "Delete", msg, async () => {
            try {
                await configManager.deleteProfile(profileId);
                showMessage(i18n.deleteSuccess || "Profile deleted");
                await refreshList();
            } catch (e: any) {
                showMessage(`${i18n.deleteFailed || "Delete failed"}: ${e.message}`);
            }
        });
    };

    // Event: save new profile
    container.querySelector("[data-action=\"save-new\"]")?.addEventListener("click", () => {
        openSaveDialog(configManager, i18n, () => refreshList());
    });

    // Event: filter change
    container.querySelector("[data-action=\"filter\"]")?.addEventListener("change", (e) => {
        currentFilter = (e.target as HTMLSelectElement).value;
        refreshList();
    });

    // Event: refresh button
    container.querySelector("[data-action=\"refresh\"]")?.addEventListener("click", () => {
        refreshList();
    });

    // Initial load
    refreshList();
}
