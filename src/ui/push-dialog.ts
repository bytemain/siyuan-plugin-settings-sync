import { Dialog, showMessage } from "siyuan";
import { WorkspaceSync, SyncTarget } from "../core/workspace-sync";

/**
 * Open a dialog that lets the user pick one or more push targets
 * (other workspaces and/or the configured shared folder) and push
 * the given local profile to all selected ones.
 */
export function openPushDialog(
    workspaceSync: WorkspaceSync,
    profileId: string,
    profileName: string,
    i18n: any,
    isMobile: boolean = false,
): void {
    const targets = workspaceSync.listTargets();

    const title = `📤 ${i18n.pushTo || "Push to…"}`;

    if (targets.length === 0) {
        showMessage(i18n.noPushTargets || "No other workspaces or shared folder available");
        return;
    }

    const checkboxes = targets
        .map((t, idx) => {
            const closedHint = t.closed ? ` <span class="settings-sync__push-hint">(${escapeHtml(i18n.workspaceClosed || "closed")})</span>` : "";
            const sharedHint = t.isShared ? ` <span class="settings-sync__push-hint">(${escapeHtml(i18n.sharedFolder || "Shared Folder")})</span>` : "";
            return `<label class="settings-sync__push-item">
                <input type="checkbox" data-idx="${idx}" class="b3-switch" />
                <span class="settings-sync__push-label">${escapeHtml(t.label)}${closedHint}${sharedHint}</span>
                <span class="settings-sync__push-path" title="${escapeHtml(t.profilesDir)}">${escapeHtml(t.profilesDir)}</span>
            </label>`;
        })
        .join("");

    const dialog = new Dialog({
        title,
        content: `<div class="settings-sync__push-dialog b3-dialog__content">
            <div class="settings-sync__push-intro">${(i18n.pushIntro || "Select targets to copy \"${name}\" to.").replace("${name}", escapeHtml(profileName))}</div>
            <div class="settings-sync__push-list">${checkboxes}</div>
            <div class="settings-sync__form-actions">
                <button class="b3-button b3-button--cancel" data-action="cancel">${i18n.cancel || "Cancel"}</button>
                <button class="b3-button b3-button--text" data-action="push">${i18n.push || "Push"}</button>
            </div>
        </div>`,
        width: isMobile ? "100%" : "520px",
    });

    const container = dialog.element;
    container.querySelector("[data-action=\"cancel\"]")?.addEventListener("click", () => dialog.destroy());

    container.querySelector("[data-action=\"push\"]")?.addEventListener("click", async () => {
        const selected: SyncTarget[] = [];
        container.querySelectorAll("input[type=\"checkbox\"]").forEach((el) => {
            const cb = el as HTMLInputElement;
            if (cb.checked) {
                const idx = parseInt(cb.getAttribute("data-idx") || "-1", 10);
                if (idx >= 0 && idx < targets.length) {
                    selected.push(targets[idx]);
                }
            }
        });

        if (selected.length === 0) {
            showMessage(i18n.selectAtLeastOneTarget || "Please select at least one target");
            return;
        }

        try {
            const result = await workspaceSync.pushProfile(profileId, selected);
            if (result.failed.length === 0) {
                showMessage(`${i18n.pushSuccess || "Pushed to"} ${selected.length}`);
            } else {
                const okCount = selected.length - result.failed.length;
                const failSummary = result.failed.map((f) => `${f.target.label}: ${f.error}`).join("; ");
                showMessage(
                    `${(i18n.pushPartial || "Pushed: ${ok} ok, ${fail} failed").replace("${ok}", String(okCount)).replace("${fail}", String(result.failed.length))} — ${failSummary}`,
                    8000,
                );
            }
            dialog.destroy();
        } catch (e: any) {
            showMessage(`${i18n.pushFailed || "Push failed"}: ${e.message}`);
        }
    });
}

function escapeHtml(str: string): string {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
