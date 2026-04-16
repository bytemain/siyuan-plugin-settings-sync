import { Dialog, showMessage } from "siyuan";
import { ConfigManager } from "../core/config-manager";
import { CONFIG_MODULES, ConfigModule, ProfileMeta } from "../core/types";
import { stripKeymapDefaults } from "../utils/keymap";
import { getByPath, stripSkipKeys } from "../utils/skip-keys";

/**
 * Compute a flat key-value diff between two objects.
 * Returns arrays of added, removed, and changed entries.
 */
interface DiffEntry {
    path: string;
    profileValue?: string;
    currentValue?: string;
}

interface DiffResult {
    added: DiffEntry[];
    removed: DiffEntry[];
    changed: DiffEntry[];
    unchanged: number;
}

function flattenObject(obj: any, prefix: string = ""): Record<string, string> {
    const result: Record<string, string> = {};
    if (obj === null || obj === undefined) return result;
    if (typeof obj !== "object") {
        result[prefix] = JSON.stringify(obj);
        return result;
    }
    if (Array.isArray(obj)) {
        // For arrays, stringify the whole thing as a leaf
        result[prefix] = JSON.stringify(obj);
        return result;
    }
    for (const key of Object.keys(obj)) {
        const newPrefix = prefix ? `${prefix}.${key}` : key;
        const val = obj[key];
        if (val !== null && typeof val === "object" && !Array.isArray(val)) {
            Object.assign(result, flattenObject(val, newPrefix));
        } else {
            result[newPrefix] = JSON.stringify(val);
        }
    }
    return result;
}

function computeDiff(profileObj: any, currentObj: any): DiffResult {
    const profileFlat = flattenObject(profileObj);
    const currentFlat = flattenObject(currentObj);

    const allKeys = new Set([...Object.keys(profileFlat), ...Object.keys(currentFlat)]);
    const added: DiffEntry[] = [];
    const removed: DiffEntry[] = [];
    const changed: DiffEntry[] = [];
    let unchanged = 0;

    for (const key of allKeys) {
        const inProfile = key in profileFlat;
        const inCurrent = key in currentFlat;

        if (inProfile && !inCurrent) {
            // Key exists in profile but not in current — will be added when applied
            added.push({ path: key, profileValue: profileFlat[key] });
        } else if (!inProfile && inCurrent) {
            // Key exists in current but not in profile — will not be overwritten, kept as-is
            removed.push({ path: key, currentValue: currentFlat[key] });
        } else if (profileFlat[key] !== currentFlat[key]) {
            changed.push({ path: key, profileValue: profileFlat[key], currentValue: currentFlat[key] });
        } else {
            unchanged++;
        }
    }

    return { added, removed, changed, unchanged };
}

function escapeHtml(str: string): string {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** Maximum characters to display for a value before truncating */
const MAX_DISPLAY_LENGTH = 120;

function truncateValue(str: string, max: number = MAX_DISPLAY_LENGTH): string {
    if (str.length <= max) return str;
    return str.slice(0, max) + "…";
}

function renderDiffTable(diff: DiffResult, i18n: any, moduleName: string): string {
    const rows: string[] = [];
    const applyTooltip = i18n.applyItemTooltip || "Apply this setting";

    for (const entry of diff.changed) {
        rows.push(`<tr class="settings-sync__diff-row settings-sync__diff-row--changed" data-diff-path="${escapeHtml(entry.path)}">
            <td class="settings-sync__diff-key" title="${escapeHtml(entry.path)}">${escapeHtml(entry.path)}</td>
            <td class="settings-sync__diff-val settings-sync__diff-val--old" title="${escapeHtml(entry.currentValue || "")}">${escapeHtml(truncateValue(entry.currentValue || ""))}</td>
            <td class="settings-sync__diff-arrow">→</td>
            <td class="settings-sync__diff-val settings-sync__diff-val--new" title="${escapeHtml(entry.profileValue || "")}">${escapeHtml(truncateValue(entry.profileValue || ""))}</td>
            <td class="settings-sync__diff-action"><button class="settings-sync__diff-apply-btn b3-button b3-button--small b3-button--outline" data-apply-module="${escapeHtml(moduleName)}" data-apply-path="${escapeHtml(entry.path)}" title="${applyTooltip}">✓</button></td>
        </tr>`);
    }

    for (const entry of diff.added) {
        rows.push(`<tr class="settings-sync__diff-row settings-sync__diff-row--added" data-diff-path="${escapeHtml(entry.path)}">
            <td class="settings-sync__diff-key" title="${escapeHtml(entry.path)}">${escapeHtml(entry.path)}</td>
            <td class="settings-sync__diff-val settings-sync__diff-val--old">—</td>
            <td class="settings-sync__diff-arrow">+</td>
            <td class="settings-sync__diff-val settings-sync__diff-val--new" title="${escapeHtml(entry.profileValue || "")}">${escapeHtml(truncateValue(entry.profileValue || ""))}</td>
            <td class="settings-sync__diff-action"><button class="settings-sync__diff-apply-btn b3-button b3-button--small b3-button--outline" data-apply-module="${escapeHtml(moduleName)}" data-apply-path="${escapeHtml(entry.path)}" title="${applyTooltip}">✓</button></td>
        </tr>`);
    }

    for (const entry of diff.removed) {
        rows.push(`<tr class="settings-sync__diff-row settings-sync__diff-row--removed" data-diff-path="${escapeHtml(entry.path)}">
            <td class="settings-sync__diff-key" title="${escapeHtml(entry.path)}">${escapeHtml(entry.path)}</td>
            <td class="settings-sync__diff-val settings-sync__diff-val--old" title="${escapeHtml(entry.currentValue || "")}">${escapeHtml(truncateValue(entry.currentValue || ""))}</td>
            <td class="settings-sync__diff-arrow">−</td>
            <td class="settings-sync__diff-val settings-sync__diff-val--new">—</td>
            <td class="settings-sync__diff-action"></td>
        </tr>`);
    }

    if (rows.length === 0) {
        return `<div class="settings-sync__diff-identical">${i18n.noDifferences || "No differences — profile matches current settings."}</div>`;
    }

    return `<table class="settings-sync__diff-table">
        <thead>
            <tr>
                <th>${i18n.diffKey || "Setting"}</th>
                <th>${i18n.diffCurrent || "Current"}</th>
                <th></th>
                <th>${i18n.diffProfile || "Profile"}</th>
                <th></th>
            </tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
    </table>
    <div class="settings-sync__diff-summary">
        ${diff.changed.length > 0 ? `<span class="settings-sync__diff-badge settings-sync__diff-badge--changed">${diff.changed.length} ${i18n.diffChanged || "changed"}</span>` : ""}
        ${diff.added.length > 0 ? `<span class="settings-sync__diff-badge settings-sync__diff-badge--added">${diff.added.length} ${i18n.diffAdded || "added"}</span>` : ""}
        ${diff.removed.length > 0 ? `<span class="settings-sync__diff-badge settings-sync__diff-badge--removed">${diff.removed.length} ${i18n.diffRemoved || "removed"}</span>` : ""}
        ${diff.unchanged > 0 ? `<span class="settings-sync__diff-badge settings-sync__diff-badge--unchanged">${diff.unchanged} ${i18n.diffUnchanged || "unchanged"}</span>` : ""}
    </div>`;
}

/**
 * Render a diff table for the update preview.
 * Shows what will change in the saved profile: "Saved (Old)" → "Current (New)".
 * No individual apply buttons since the action is to overwrite the whole profile.
 *
 * Expects diff computed as computeDiff(savedProfileData, currentDeviceConf):
 *  - changed: profileValue = saved (old), currentValue = current (new)
 *  - added:   in saved but not current → keys being removed; has profileValue
 *  - removed: in current but not saved → keys being added; has currentValue
 */
function renderUpdateDiffTable(diff: DiffResult, i18n: any): string {
    const rows: string[] = [];

    for (const entry of diff.changed) {
        rows.push(`<tr class="settings-sync__diff-row settings-sync__diff-row--changed" data-diff-path="${escapeHtml(entry.path)}">
            <td class="settings-sync__diff-key" title="${escapeHtml(entry.path)}">${escapeHtml(entry.path)}</td>
            <td class="settings-sync__diff-val settings-sync__diff-val--old" title="${escapeHtml(entry.profileValue || "")}">${escapeHtml(truncateValue(entry.profileValue || ""))}</td>
            <td class="settings-sync__diff-arrow">→</td>
            <td class="settings-sync__diff-val settings-sync__diff-val--new" title="${escapeHtml(entry.currentValue || "")}">${escapeHtml(truncateValue(entry.currentValue || ""))}</td>
        </tr>`);
    }

    // "removed" from computeDiff = in current but not saved → new keys being added to the profile
    for (const entry of diff.removed) {
        rows.push(`<tr class="settings-sync__diff-row settings-sync__diff-row--added" data-diff-path="${escapeHtml(entry.path)}">
            <td class="settings-sync__diff-key" title="${escapeHtml(entry.path)}">${escapeHtml(entry.path)}</td>
            <td class="settings-sync__diff-val settings-sync__diff-val--old">—</td>
            <td class="settings-sync__diff-arrow">+</td>
            <td class="settings-sync__diff-val settings-sync__diff-val--new" title="${escapeHtml(entry.currentValue || "")}">${escapeHtml(truncateValue(entry.currentValue || ""))}</td>
        </tr>`);
    }

    // "added" from computeDiff = in saved but not current → keys being removed from the profile
    for (const entry of diff.added) {
        rows.push(`<tr class="settings-sync__diff-row settings-sync__diff-row--removed" data-diff-path="${escapeHtml(entry.path)}">
            <td class="settings-sync__diff-key" title="${escapeHtml(entry.path)}">${escapeHtml(entry.path)}</td>
            <td class="settings-sync__diff-val settings-sync__diff-val--old" title="${escapeHtml(entry.profileValue || "")}">${escapeHtml(truncateValue(entry.profileValue || ""))}</td>
            <td class="settings-sync__diff-arrow">−</td>
            <td class="settings-sync__diff-val settings-sync__diff-val--new">—</td>
        </tr>`);
    }

    if (rows.length === 0) {
        return "";
    }

    return `<table class="settings-sync__diff-table">
        <thead>
            <tr>
                <th>${i18n.diffKey || "Setting"}</th>
                <th>${i18n.diffProfile || "Profile"}</th>
                <th></th>
                <th>${i18n.diffCurrent || "Current"}</th>
            </tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
    </table>
    <div class="settings-sync__diff-summary">
        ${diff.changed.length > 0 ? `<span class="settings-sync__diff-badge settings-sync__diff-badge--changed">${diff.changed.length} ${i18n.diffChanged || "changed"}</span>` : ""}
        ${diff.removed.length > 0 ? `<span class="settings-sync__diff-badge settings-sync__diff-badge--added">${diff.removed.length} ${i18n.diffAdded || "added"}</span>` : ""}
        ${diff.added.length > 0 ? `<span class="settings-sync__diff-badge settings-sync__diff-badge--removed">${diff.added.length} ${i18n.diffRemoved || "removed"}</span>` : ""}
        ${diff.unchanged > 0 ? `<span class="settings-sync__diff-badge settings-sync__diff-badge--unchanged">${diff.unchanged} ${i18n.diffUnchanged || "unchanged"}</span>` : ""}
    </div>`;
}

/**
 * Open a dialog that previews what will change when updating a profile with current device settings.
 * Shows the diff between saved profile (old) and current config (new), then confirms the update.
 *
 * @param onUpdated  Callback invoked after a successful update (e.g. to refresh the profile list).
 */
export function openUpdatePreviewDialog(
    configManager: ConfigManager,
    profile: ProfileMeta,
    i18n: any,
    onUpdated: () => void,
    isMobile: boolean = false,
): void {
    const dialog = new Dialog({
        title: `📝 ${i18n.updatePreviewTitle || "Update Preview"} — ${profile.name}`,
        content: `<div class="settings-sync__preview-dialog b3-dialog__content">
            <div class="settings-sync__preview-loading">${i18n.loading || "Loading..."}</div>
        </div>`,
        width: isMobile ? "100%" : "800px",
    });

    const container = dialog.element.querySelector(".settings-sync__preview-dialog") as HTMLElement;

    (async () => {
        try {
            const fullProfile = await configManager.getProfile(profile.id);
            if (!fullProfile) {
                container.innerHTML = `<div class="settings-sync__error">${i18n.profileNotFound || "Profile not found"}</div>`;
                return;
            }

            // Use ALL config modules so newly added modules (e.g. account) appear
            // even when previewing profiles saved before those modules existed.
            const allModules = CONFIG_MODULES;

            const currentConf = await configManager.getCurrentConf(allModules);

            const skipKeys = configManager.getSkipKeys();

            // Compute diffs: saved profile (old) vs current device config (new)
            const diffs: Record<string, DiffResult> = {};
            for (const mod of allModules) {
                let profileModData = fullProfile.conf[mod] != null
                    ? JSON.parse(JSON.stringify(fullProfile.conf[mod]))
                    : undefined;
                if (profileModData != null) {
                    stripSkipKeys(profileModData, mod, skipKeys);
                }
                let currentModData = currentConf[mod];
                // Strip keymap `default` fields — only `custom` bindings are meaningful for users
                if (mod === "keymap") {
                    if (profileModData != null) profileModData = stripKeymapDefaults(profileModData);
                    if (currentModData != null) currentModData = stripKeymapDefaults(currentModData);
                }
                // profileValue = saved value (old), currentValue = device value (new)
                diffs[mod] = computeDiff(profileModData, currentModData);
            }

            // Count total changes per module for tab badges
            const tabBadges = allModules.map((mod) => {
                const d = diffs[mod];
                return d.changed.length + d.added.length + d.removed.length;
            });

            const totalChanges = tabBadges.reduce((sum, b) => sum + b, 0);

            const tabsHtml = allModules.map((mod, idx) => {
                const label = i18n[mod] || mod;
                const active = idx === 0 ? "settings-sync__preview-tab--active" : "";
                const badge = tabBadges[idx] > 0
                    ? `<span class="settings-sync__preview-tab-badge">${tabBadges[idx]}</span>`
                    : "<span class=\"settings-sync__preview-tab-badge settings-sync__preview-tab-badge--ok\">✓</span>";
                return `<button class="settings-sync__preview-tab ${active}" data-module="${mod}">${label} ${badge}</button>`;
            }).join("");

            if (totalChanges === 0) {
                container.innerHTML = `
                    <div class="settings-sync__preview-tabs">${tabsHtml}</div>
                    <div class="settings-sync__diff-identical">${i18n.noUpdateChanges || "No differences — current settings match the saved profile."}</div>
                `;
                return;
            }

            container.innerHTML = `
                <div class="settings-sync__preview-desc">${i18n.updatePreviewDesc || "The following changes will be saved to the profile. Current device settings will overwrite the saved values."}</div>
                <div class="settings-sync__preview-tabs">${tabsHtml}</div>
                <div class="settings-sync__preview-content" data-container="diff-content">
                    ${renderUpdateDiffTable(diffs[allModules[0]], i18n)}
                </div>
                <div class="settings-sync__form-actions">
                    <button class="b3-button b3-button--outline" data-action="confirm-update">${i18n.confirmUpdateBtn || "Confirm Update"}</button>
                </div>
            `;

            // Tab switching
            const diffContent = container.querySelector("[data-container=\"diff-content\"]") as HTMLElement;
            container.querySelectorAll(".settings-sync__preview-tab").forEach((tab) => {
                tab.addEventListener("click", () => {
                    container.querySelectorAll(".settings-sync__preview-tab").forEach((t) =>
                        t.classList.remove("settings-sync__preview-tab--active")
                    );
                    tab.classList.add("settings-sync__preview-tab--active");
                    const mod = tab.getAttribute("data-module") as ConfigModule;
                    if (mod && diffs[mod]) {
                        diffContent.innerHTML = renderUpdateDiffTable(diffs[mod], i18n);
                    }
                });
            });

            // Confirm Update
            container.querySelector("[data-action=\"confirm-update\"]")?.addEventListener("click", async () => {
                try {
                    await configManager.updateProfile(profile.id);
                    showMessage(i18n.updateSuccess || "Configuration updated");
                    dialog.destroy();
                    onUpdated();
                } catch (e: any) {
                    showMessage(`${i18n.updateFailed || "Update failed"}: ${e.message}`);
                }
            });
        } catch (e: any) {
            container.innerHTML = `<div class="settings-sync__error">${i18n.previewFailed || "Failed to load preview"}: ${escapeHtml(e.message)}</div>`;
        }
    })();
}

/**
 * Open a dialog that previews profile content with a diff against current settings.
 */
export function openPreviewDialog(
    configManager: ConfigManager,
    profile: ProfileMeta,
    i18n: any,
    isMobile: boolean = false,
): void {
    const dialog = new Dialog({
        title: `🔍 ${i18n.previewTitle || "Preview & Compare"} — ${profile.name}`,
        content: `<div class="settings-sync__preview-dialog b3-dialog__content">
            <div class="settings-sync__preview-loading">${i18n.loading || "Loading..."}</div>
        </div>`,
        width: isMobile ? "100%" : "800px",
    });

    const container = dialog.element.querySelector(".settings-sync__preview-dialog") as HTMLElement;

    // Load data and render
    (async () => {
        try {
            const fullProfile = await configManager.getProfile(profile.id);
            if (!fullProfile) {
                container.innerHTML = `<div class="settings-sync__error">${i18n.profileNotFound || "Profile not found"}</div>`;
                return;
            }

            // Use ALL config modules so newly added modules (e.g. account) appear
            // even when previewing profiles saved before those modules existed.
            const allModules = CONFIG_MODULES;

            const currentConf = await configManager.getCurrentConf(allModules);

            // Strip skip keys from profile data so old saved keys don't appear in diff
            const skipKeys = configManager.getSkipKeys();

            // Pre-compute diffs
            const diffs: Record<string, DiffResult> = {};
            for (const mod of allModules) {
                let profileModData = fullProfile.conf[mod] != null
                    ? JSON.parse(JSON.stringify(fullProfile.conf[mod]))
                    : undefined;
                if (profileModData != null) {
                    stripSkipKeys(profileModData, mod, skipKeys);
                }
                let currentModData = currentConf[mod];
                // Strip keymap `default` fields — only `custom` bindings are meaningful for users
                if (mod === "keymap") {
                    if (profileModData != null) profileModData = stripKeymapDefaults(profileModData);
                    if (currentModData != null) currentModData = stripKeymapDefaults(currentModData);
                }
                diffs[mod] = computeDiff(profileModData, currentModData);
            }

            // Count total changes per module for tab badges
            const tabBadges = allModules.map((mod) => {
                const d = diffs[mod];
                const total = d.changed.length + d.added.length + d.removed.length;
                return total;
            });

            const tabsWithBadges = allModules.map((mod, idx) => {
                const label = i18n[mod] || mod;
                const active = idx === 0 ? "settings-sync__preview-tab--active" : "";
                const badge = tabBadges[idx] > 0
                    ? `<span class="settings-sync__preview-tab-badge">${tabBadges[idx]}</span>`
                    : "<span class=\"settings-sync__preview-tab-badge settings-sync__preview-tab-badge--ok\">✓</span>";
                return `<button class="settings-sync__preview-tab ${active}" data-module="${mod}">${label} ${badge}</button>`;
            }).join("");

            const moduleCheckboxes = allModules.map((mod, idx) => {
                const label = i18n[mod] || mod;
                const hasDiff = tabBadges[idx] > 0;
                return `<label class="settings-sync__checkbox">
                    <input type="checkbox" name="preview-module" value="${mod}" ${hasDiff ? "checked" : ""} />
                    <span>${label}</span>
                </label>`;
            }).join("\n");

            container.innerHTML = `
                <div class="settings-sync__preview-tabs">${tabsWithBadges}</div>
                <div class="settings-sync__preview-content" data-container="diff-content">
                    ${renderDiffTable(diffs[allModules[0]], i18n, allModules[0])}
                </div>
                <div class="settings-sync__preview-modules">
                    <div class="settings-sync__preview-modules-header">
                        <label class="settings-sync__label">${i18n.selectModules || "Select modules to apply"}:</label>
                        <div class="settings-sync__preview-modules-toggle">
                            <button class="b3-button b3-button--small b3-button--outline" data-action="select-all">${i18n.selectAll || "Select All"}</button>
                            <button class="b3-button b3-button--small b3-button--outline" data-action="deselect-all">${i18n.deselectAll || "Deselect All"}</button>
                        </div>
                    </div>
                    <div class="settings-sync__modules">${moduleCheckboxes}</div>
                </div>
                <div class="settings-sync__form-actions">
                    <button class="b3-button b3-button--outline" data-action="backup-apply-selected">${i18n.backupAndApplySelected || "Backup & Apply Selected"}</button>
                    <button class="b3-button b3-button--text" data-action="apply-selected">${i18n.applySelected || "Apply Selected"}</button>
                </div>
            `;

            // Get stripped profile module data for retrieving raw values when applying
            const strippedProfileData: Record<string, any> = {};
            for (const mod of allModules) {
                if (fullProfile.conf[mod] != null) {
                    const data = JSON.parse(JSON.stringify(fullProfile.conf[mod]));
                    stripSkipKeys(data, mod, skipKeys);
                    strippedProfileData[mod] = data;
                }
            }

            /** Bind apply-button click handlers for the currently visible diff tab */
            const bindApplyButtons = (parentEl: HTMLElement) => {
                parentEl.querySelectorAll(".settings-sync__diff-apply-btn").forEach((btn) => {
                    btn.addEventListener("click", async (e) => {
                        const target = e.currentTarget as HTMLButtonElement;
                        const mod = target.getAttribute("data-apply-module");
                        const path = target.getAttribute("data-apply-path");
                        if (!mod || !path || !CONFIG_MODULES.includes(mod as ConfigModule)) return;

                        const pathParts = path.split(".");
                        const rawValue = getByPath(strippedProfileData[mod], pathParts);
                        if (rawValue === undefined) return;

                        target.disabled = true;
                        try {
                            await configManager.applySingleSetting(mod as ConfigModule, path, rawValue);

                            // Mark the row as applied
                            const row = target.closest("tr");
                            if (row) {
                                row.classList.add("settings-sync__diff-row--applied");
                            }
                            target.classList.add("settings-sync__diff-apply-btn--done");

                            showMessage(i18n.applyItemSuccess || "Setting applied");
                        } catch (err: any) {
                            target.disabled = false;
                            showMessage(`${i18n.applyItemFailed || "Failed to apply setting"}: ${err.message}`);
                        }
                    });
                });
            };

            // Bind for the initially visible tab
            const diffContent = container.querySelector("[data-container=\"diff-content\"]") as HTMLElement;
            bindApplyButtons(diffContent);

            // Tab switching
            container.querySelectorAll(".settings-sync__preview-tab").forEach((tab) => {
                tab.addEventListener("click", () => {
                    container.querySelectorAll(".settings-sync__preview-tab").forEach((t) =>
                        t.classList.remove("settings-sync__preview-tab--active")
                    );
                    tab.classList.add("settings-sync__preview-tab--active");
                    const mod = tab.getAttribute("data-module") as ConfigModule;
                    if (mod && diffs[mod]) {
                        diffContent.innerHTML = renderDiffTable(diffs[mod], i18n, mod);
                        bindApplyButtons(diffContent);
                    }
                });
            });

            // Select All / Deselect All
            container.querySelector("[data-action=\"select-all\"]")?.addEventListener("click", () => {
                container.querySelectorAll<HTMLInputElement>("input[name=\"preview-module\"]").forEach((el) => {
                    el.checked = true;
                });
            });
            container.querySelector("[data-action=\"deselect-all\"]")?.addEventListener("click", () => {
                container.querySelectorAll<HTMLInputElement>("input[name=\"preview-module\"]").forEach((el) => {
                    el.checked = false;
                });
            });

            // Apply Selected modules
            const doApplySelected = async (withBackup: boolean) => {
                const moduleChecks = container.querySelectorAll<HTMLInputElement>("input[name=\"preview-module\"]:checked");
                const modules: ConfigModule[] = [];
                moduleChecks.forEach((el) => {
                    modules.push(el.value as ConfigModule);
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
                } catch (e: any) {
                    showMessage(`${i18n.applyFailed || "Apply failed"}: ${e.message}`);
                }
            };

            container.querySelector("[data-action=\"apply-selected\"]")?.addEventListener("click", () => doApplySelected(false));
            container.querySelector("[data-action=\"backup-apply-selected\"]")?.addEventListener("click", () => doApplySelected(true));
        } catch (e: any) {
            container.innerHTML = `<div class="settings-sync__error">${i18n.previewFailed || "Failed to load preview"}: ${escapeHtml(e.message)}</div>`;
        }
    })();
}
