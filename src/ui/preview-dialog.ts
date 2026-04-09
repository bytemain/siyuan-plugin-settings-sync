import { Dialog, showMessage } from "siyuan";
import { ConfigManager } from "../core/config-manager";
import { CONFIG_MODULES, ConfigModule, ProfileMeta } from "../core/types";
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
 * Open a dialog that previews profile content with a diff against current settings.
 */
export function openPreviewDialog(
    configManager: ConfigManager,
    profile: ProfileMeta,
    i18n: any,
): void {
    const dialog = new Dialog({
        title: `🔍 ${i18n.previewTitle || "Preview & Compare"} — ${profile.name}`,
        content: `<div class="settings-sync__preview-dialog b3-dialog__content">
            <div class="settings-sync__preview-loading">${i18n.loading || "Loading..."}</div>
        </div>`,
        width: "800px",
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

            const profileModules = Object.keys(fullProfile.conf).filter(
                (m) => CONFIG_MODULES.includes(m as ConfigModule)
            ) as ConfigModule[];

            if (profileModules.length === 0) {
                container.innerHTML = `<div class="settings-sync__empty">${i18n.noModulesInProfile || "This profile contains no configuration modules."}</div>`;
                return;
            }

            const currentConf = await configManager.getCurrentConf(profileModules);

            // Strip skip keys from profile data so old saved keys don't appear in diff
            const skipKeys = configManager.getSkipKeys();

            // Pre-compute diffs
            const diffs: Record<string, DiffResult> = {};
            for (const mod of profileModules) {
                const profileModData = JSON.parse(JSON.stringify(fullProfile.conf[mod]));
                stripSkipKeys(profileModData, mod, skipKeys);
                diffs[mod] = computeDiff(profileModData, currentConf[mod]);
            }

            // Count total changes per module for tab badges
            const tabBadges = profileModules.map((mod) => {
                const d = diffs[mod];
                const total = d.changed.length + d.added.length + d.removed.length;
                return total;
            });

            const tabsWithBadges = profileModules.map((mod, idx) => {
                const label = i18n[mod] || mod;
                const active = idx === 0 ? "settings-sync__preview-tab--active" : "";
                const badge = tabBadges[idx] > 0
                    ? `<span class="settings-sync__preview-tab-badge">${tabBadges[idx]}</span>`
                    : "<span class=\"settings-sync__preview-tab-badge settings-sync__preview-tab-badge--ok\">✓</span>";
                return `<button class="settings-sync__preview-tab ${active}" data-module="${mod}">${label} ${badge}</button>`;
            }).join("");

            container.innerHTML = `
                <div class="settings-sync__preview-tabs">${tabsWithBadges}</div>
                <div class="settings-sync__preview-content" data-container="diff-content">
                    ${renderDiffTable(diffs[profileModules[0]], i18n, profileModules[0])}
                </div>
            `;

            // Get stripped profile module data for retrieving raw values when applying
            const strippedProfileData: Record<string, any> = {};
            for (const mod of profileModules) {
                const data = JSON.parse(JSON.stringify(fullProfile.conf[mod]));
                stripSkipKeys(data, mod, skipKeys);
                strippedProfileData[mod] = data;
            }

            /** Bind apply-button click handlers for the currently visible diff tab */
            const bindApplyButtons = (parentEl: HTMLElement) => {
                parentEl.querySelectorAll(".settings-sync__diff-apply-btn").forEach((btn) => {
                    btn.addEventListener("click", async (e) => {
                        const target = e.currentTarget as HTMLButtonElement;
                        const mod = target.getAttribute("data-apply-module") as ConfigModule;
                        const path = target.getAttribute("data-apply-path");
                        if (!mod || !path) return;

                        const rawValue = getByPath(strippedProfileData[mod], path.split("."));
                        if (rawValue === undefined) return;

                        target.disabled = true;
                        try {
                            await configManager.applySingleSetting(mod, path, rawValue);

                            // Mark the row as applied
                            const row = target.closest("tr");
                            if (row) {
                                row.classList.add("settings-sync__diff-row--applied");
                            }
                            target.textContent = "✓";
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
        } catch (e: any) {
            container.innerHTML = `<div class="settings-sync__error">${i18n.previewFailed || "Failed to load preview"}: ${escapeHtml(e.message)}</div>`;
        }
    })();
}
