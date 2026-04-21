import { confirm, Dialog, showMessage } from "siyuan";
import { ConfigManager } from "../core/config-manager";
import { CONFIG_MODULES, CURRENT_WORKSPACE_TARGET_ID, PLATFORM_LABELS, ProfileMeta, SYNC_BASE_PATH } from "../core/types";
import { getWorkspacePath } from "../core/siyuan-api";
import { detectPlatform } from "../utils/platform";
import { renderProfileCard } from "./profile-card";
import { openSaveDialog } from "./save-dialog";
import { openPreviewDialog, openUpdatePreviewDialog } from "./preview-dialog";
import { openSettingsDialog } from "./settings-dialog";
import { openPushDialog } from "./push-dialog";
import { RemoteProfileMeta, SyncTarget, WorkspaceSync } from "../core/workspace-sync";
import { buildApplySuccessMessage } from "../utils/apply-message";

/**
 * Open the main "Settings Sync Manager" dialog.
 */
export function openMainDialog(
    configManager: ConfigManager,
    workspaceSync: WorkspaceSync,
    i18n: any,
    isMobile: boolean = false,
): void {
    const currentPlatform = detectPlatform();
    const deviceInfo = configManager.getDeviceInfo();
    const currentPlatformLabel = PLATFORM_LABELS[currentPlatform] || currentPlatform;

    const filterOptions = [
        `<option value="current" selected>${i18n.filterCurrentPlatform || "Current Platform"}</option>`,
        `<option value="all">${i18n.filterAll || "All"}</option>`,
        ...Object.entries(PLATFORM_LABELS)
            .filter(([key]) => key !== "all")
            .map(([key, label]) =>
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
                    <button class="b3-button b3-button--text" data-action="open-folder">📂 ${i18n.openFolder || "Open Folder"}</button>
                    <button class="b3-button b3-button--text" data-action="open-settings">⚙️ ${i18n.settingsTitle || "Settings"}</button>
                </div>
            </div>
            <div class="settings-sync__profiles-header">
                <span class="settings-sync__profiles-title">${i18n.savedProfiles || "Saved Profiles"}</span>
                <div class="settings-sync__filter">
                    <select class="b3-select settings-sync__filter-select" data-action="workspace"></select>
                    <select class="b3-select settings-sync__filter-select" data-action="filter">
                        ${filterOptions}
                    </select>
                    <button class="b3-button b3-button--small b3-button--outline" data-action="refresh" title="${i18n.refresh || "Refresh"}">🔄</button>
                </div>
            </div>
            <div class="settings-sync__workspace-hint" data-container="ws-hint" style="display:none;"></div>
            <div class="settings-sync__profiles-list" data-container="profiles">
                <div class="settings-sync__loading">${i18n.loading || "Loading..."}</div>
            </div>
        </div>`,
        width: isMobile ? "100%" : "720px",
    });

    const container = dialog.element;
    const profilesContainer = container.querySelector("[data-container=\"profiles\"]") as HTMLElement;
    const workspaceSelect = container.querySelector("[data-action=\"workspace\"]") as HTMLSelectElement;
    const wsHint = container.querySelector("[data-container=\"ws-hint\"]") as HTMLElement;

    let currentFilter = "current";
    /** Either CURRENT_WORKSPACE_TARGET_ID or a SyncTarget.id */
    let currentWorkspaceId: string = CURRENT_WORKSPACE_TARGET_ID;
    /** Cache of remote profiles for the currently viewed remote target */
    let remoteProfilesCache: RemoteProfileMeta[] = [];

    /** Re-populate the workspace selector based on the latest target list. */
    const populateWorkspaceSelect = () => {
        const targets = workspaceSync.listTargets();
        const opts = [
            `<option value="${CURRENT_WORKSPACE_TARGET_ID}">${escapeHtml(i18n.currentWorkspace || "Current Workspace")}</option>`,
            ...targets.map((t) => {
                const closed = t.closed ? ` (${escapeHtml(i18n.workspaceClosed || "closed")})` : "";
                return `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label)}${closed}</option>`;
            }),
        ].join("\n");
        workspaceSelect.innerHTML = opts;
        workspaceSelect.value = currentWorkspaceId;
        // Hide the workspace selector entirely if globalCopyFiles already failed
        // on this platform (e.g. iOS sandbox) and there are no remote targets.
        if (workspaceSync.isUnsupported() && targets.length === 0) {
            workspaceSelect.style.display = "none";
        } else {
            workspaceSelect.style.display = "";
        }
    };

    const refreshList = async () => {
        try {
            if (currentWorkspaceId === CURRENT_WORKSPACE_TARGET_ID) {
                wsHint.style.display = "none";
                await configManager.refresh();
                const profiles = await configManager.listProfiles();
                renderProfiles(profiles);
            } else {
                const target = workspaceSync.getTarget(currentWorkspaceId);
                if (!target) {
                    // Target gone (e.g. removed from settings); revert to current workspace
                    currentWorkspaceId = CURRENT_WORKSPACE_TARGET_ID;
                    populateWorkspaceSelect();
                    return refreshList();
                }
                wsHint.style.display = "";
                wsHint.textContent = (i18n.viewingWorkspace || "Viewing remote workspace: ${name}")
                    .replace("${name}", `${target.label} — ${target.profilesDir}`);
                profilesContainer.innerHTML = `<div class="settings-sync__loading">${i18n.loading || "Loading..."}</div>`;
                try {
                    remoteProfilesCache = await workspaceSync.listRemoteProfiles(target);
                } catch (e: any) {
                    remoteProfilesCache = [];
                    profilesContainer.innerHTML = `<div class="settings-sync__error">${escapeHtml(`${i18n.remoteListFailed || "Failed to read remote workspace"}: ${e?.message || e}`)}</div>`;
                    if (workspaceSync.isUnsupported()) {
                        wsHint.textContent = i18n.workspaceSyncUnsupported || "Local multi-workspace sync is not supported on this platform.";
                    }
                    return;
                }
                renderProfiles(remoteProfilesCache, target);
            }
        } catch (e: any) {
            profilesContainer.innerHTML = `<div class="settings-sync__error">${escapeHtml(e.message)}</div>`;
        }
    };

    const renderProfiles = (profiles: ProfileMeta[], remoteTarget?: SyncTarget) => {
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
            .map((p) => renderProfileCard(p, i18n, remoteTarget?.label))
            .join("");

        bindCardActions(remoteTarget);
    };

    const bindCardActions = (remoteTarget?: SyncTarget) => {
        profilesContainer.querySelectorAll("[data-action]").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                const el = e.currentTarget as HTMLElement;
                const action = el.getAttribute("data-action");
                const id = el.getAttribute("data-id");
                if (!id) return;

                switch (action) {
                    case "view":
                        await handlePreview(id, remoteTarget);
                        break;
                    case "more":
                        handleToggleMenu(id, el);
                        break;
                    case "edit":
                        closeAllMenus();
                        await handleEdit(id);
                        break;
                    case "update":
                        await handleUpdate(id);
                        break;
                    case "delete":
                        closeAllMenus();
                        await handleDelete(id);
                        break;
                    case "push":
                        closeAllMenus();
                        await handlePush(id);
                        break;
                    case "pull":
                        if (remoteTarget) await handlePull(remoteTarget, id);
                        break;
                    case "apply-direct":
                        if (remoteTarget) await handleApplyDirect(remoteTarget, id);
                        break;
                }
            });
        });
    };

    /** Close all open dropdown menus */
    const closeAllMenus = () => {
        profilesContainer.querySelectorAll(".settings-sync__more-menu--open")
            .forEach((m) => m.classList.remove("settings-sync__more-menu--open"));
    };

    /** Toggle the ⋯ dropdown menu for a specific profile card */
    let activeMenuCleanup: (() => void) | null = null;
    const handleToggleMenu = (profileId: string, btnEl: HTMLElement) => {
        const menu = profilesContainer.querySelector(`[data-menu-id="${profileId}"]`) as HTMLElement;
        if (!menu) return;

        const isOpen = menu.classList.contains("settings-sync__more-menu--open");

        // Clean up any previous listener before toggling
        if (activeMenuCleanup) {
            activeMenuCleanup();
            activeMenuCleanup = null;
        }
        closeAllMenus();

        if (!isOpen) {
            menu.classList.add("settings-sync__more-menu--open");

            // Close menu when clicking outside
            const onDocClick = (ev: MouseEvent) => {
                if (!btnEl.contains(ev.target as Node) && !menu.contains(ev.target as Node)) {
                    menu.classList.remove("settings-sync__more-menu--open");
                    cleanup();
                }
            };
            const cleanup = () => {
                document.removeEventListener("click", onDocClick, true);
                activeMenuCleanup = null;
            };
            activeMenuCleanup = cleanup;
            // Use setTimeout so the current click event finishes first
            setTimeout(() => document.addEventListener("click", onDocClick, true), 0);
        }
    };

    /**
     * Preview a profile. For remote profiles we transparently pull-then-preview
     * the local copy, then leave the imported file in place (the user can
     * always delete it from the local view if undesired).
     */
    const handlePreview = async (profileId: string, remoteTarget?: SyncTarget) => {
        if (remoteTarget) {
            try {
                await workspaceSync.pullProfile(remoteTarget, profileId);
            } catch (e: any) {
                showMessage(`${i18n.pullFailed || "Pull failed"}: ${e.message}`);
                return;
            }
            const profiles = await configManager.listProfiles();
            const profile = profiles.find((p) => p.id === profileId);
            if (!profile) return;
            openPreviewDialog(configManager, profile, i18n, isMobile);
            return;
        }

        const profiles = await configManager.listProfiles();
        const profile = profiles.find((p) => p.id === profileId);
        if (!profile) return;
        openPreviewDialog(configManager, profile, i18n, isMobile);
    };

    const handleEdit = async (profileId: string) => {
        const profiles = await configManager.listProfiles();
        const profile = profiles.find((p) => p.id === profileId);
        if (!profile) return;

        const editDialog = new Dialog({
            title: `✏️ ${i18n.editProfile || "Edit Profile"}`,
            content: `<div class="settings-sync__save-dialog b3-dialog__content">
                <div class="settings-sync__form-group">
                    <label class="settings-sync__label">${i18n.profileName || "Profile Name"}</label>
                    <input class="b3-text-field settings-sync__input" data-field="name" value="" />
                </div>
                <div class="settings-sync__form-group">
                    <label class="settings-sync__label">${i18n.description || "Description"}</label>
                    <input class="b3-text-field settings-sync__input" data-field="desc" value="" placeholder="${i18n.description || "Description"}" />
                </div>
                <div class="settings-sync__form-actions">
                    <button class="b3-button b3-button--outline" data-action="cancel-edit">${i18n.cancel || "Cancel"}</button>
                    <button class="b3-button b3-button--text" data-action="save-edit">${i18n.save || "Save"}</button>
                </div>
            </div>`,
            width: isMobile ? "100%" : "420px",
        });

        const editContainer = editDialog.element;
        const nameInput = editContainer.querySelector("[data-field=\"name\"]") as HTMLInputElement;
        const descInput = editContainer.querySelector("[data-field=\"desc\"]") as HTMLInputElement;

        // Set values after DOM creation to avoid XSS via value attribute
        nameInput.value = profile.name;
        descInput.value = profile.description || "";
        nameInput.focus();
        nameInput.select();

        const doSave = async () => {
            const newName = nameInput.value.trim();
            const newDesc = descInput.value.trim();

            if (!newName) {
                showMessage(i18n.nameRequired || "Please enter a profile name");
                return;
            }

            try {
                let changed = false;
                if (newName !== profile.name) {
                    await configManager.renameProfile(profileId, newName);
                    changed = true;
                }
                if (newDesc !== (profile.description || "").trim()) {
                    await configManager.updateDescription(profileId, newDesc);
                    changed = true;
                }
                if (changed) {
                    showMessage(i18n.editSuccess || "Profile updated");
                }
                editDialog.destroy();
                await refreshList();
            } catch (e: any) {
                showMessage(`${i18n.editFailed || "Failed to update profile"}: ${e.message}`);
            }
        };

        editContainer.querySelector("[data-action=\"save-edit\"]")?.addEventListener("click", doSave);
        editContainer.querySelector("[data-action=\"cancel-edit\"]")?.addEventListener("click", () => {
            editDialog.destroy();
        });

        // Allow Enter to save from either field
        const onKeydown = (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                doSave();
            } else if (e.key === "Escape") {
                editDialog.destroy();
            }
        };
        nameInput.addEventListener("keydown", onKeydown);
        descInput.addEventListener("keydown", onKeydown);
    };

    const handleUpdate = async (profileId: string) => {
        const profiles = await configManager.listProfiles();
        const profile = profiles.find((p) => p.id === profileId);
        if (!profile) return;

        openUpdatePreviewDialog(configManager, profile, i18n, () => refreshList(), isMobile);
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

    const handlePush = async (profileId: string) => {
        const profiles = await configManager.listProfiles();
        const profile = profiles.find((p) => p.id === profileId);
        if (!profile) return;
        openPushDialog(workspaceSync, profileId, profile.name, i18n, isMobile);
    };

    const handlePull = async (target: SyncTarget, profileId: string) => {
        try {
            const meta = await workspaceSync.pullProfile(target, profileId);
            showMessage((i18n.pullSuccess || "Pulled \"${name}\" to current workspace").replace("${name}", meta.name));
        } catch (e: any) {
            showMessage(`${i18n.pullFailed || "Pull failed"}: ${e.message}`);
        }
    };

    const handleApplyDirect = async (target: SyncTarget, profileId: string) => {
        const remote = remoteProfilesCache.find((p) => p.id === profileId);
        if (!remote) return;

        const msg = (i18n.confirmApply || "Apply configuration \"${name}\" to current device?")
            .replace("${name}", remote.name);

        confirm(i18n.applyDirectly || "Apply directly", msg, async () => {
            try {
                const applied = await workspaceSync.pullAndApply(target, profileId, CONFIG_MODULES);
                showMessage(buildApplySuccessMessage(applied, i18n));
            } catch (e: any) {
                showMessage(`${i18n.applyFailed || "Apply failed"}: ${e.message}`);
            }
        });
    };

    // Event: save new profile
    container.querySelector("[data-action=\"save-new\"]")?.addEventListener("click", () => {
        openSaveDialog(configManager, i18n, () => refreshList(), isMobile);
    });

    // Event: open plugin settings dialog
    container.querySelector("[data-action=\"open-settings\"]")?.addEventListener("click", () => {
        openSettingsDialog(configManager, i18n, isMobile, () => populateWorkspaceSelect());
    });

    // Event: open profiles folder in system file manager
    container.querySelector("[data-action=\"open-folder\"]")?.addEventListener("click", async () => {
        try {
            const workspacePath = await getWorkspacePath();
            if (!workspacePath) {
                showMessage(i18n.openFolderFailed || "Could not determine workspace path");
                return;
            }
            // SYNC_BASE_PATH starts with "/data", workspace already contains the root
            const fullPath = workspacePath + SYNC_BASE_PATH;

            // Try Electron shell API (available on desktop)
            try {
                const { shell } = window.require("@electron/remote");
                shell.openPath(fullPath);
                return;
            } catch {
                // Not in Electron or @electron/remote not available
            }

            // Fallback: show the path so the user can navigate manually
            showMessage(`${i18n.storagePath || "Storage path"}: ${fullPath}`, 6000);
        } catch (e: any) {
            showMessage(`${i18n.openFolderFailed || "Could not open folder"}: ${e.message}`);
        }
    });

    // Event: filter change
    container.querySelector("[data-action=\"filter\"]")?.addEventListener("change", (e) => {
        currentFilter = (e.target as HTMLSelectElement).value;
        refreshList();
    });

    // Event: workspace selector change
    workspaceSelect.addEventListener("change", (e) => {
        currentWorkspaceId = (e.target as HTMLSelectElement).value;
        refreshList();
    });

    // Event: refresh button
    container.querySelector("[data-action=\"refresh\"]")?.addEventListener("click", async () => {
        // Re-fetch the workspace list too, in case other workspaces appeared
        await workspaceSync.init();
        populateWorkspaceSelect();
        refreshList();
    });

    // Initial load
    workspaceSync.init().then(() => {
        populateWorkspaceSelect();
        refreshList();
    }).catch(() => {
        populateWorkspaceSelect();
        refreshList();
    });
}

function escapeHtml(str: string): string {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
