import { ProfileMeta, PLATFORM_LABELS, Platform } from "../core/types";

/**
 * Render a profile card HTML string for the main dialog list.
 */
export function renderProfileCard(
    profile: ProfileMeta,
    i18n: any,
): string {
    const platformLabel = PLATFORM_LABELS[profile.platform as Platform] || profile.platform;
    const updatedDate = new Date(profile.updatedAt).toLocaleString();
    const description = profile.description
        ? `<div class="settings-sync__card-desc">${escapeHtml(profile.description)}</div>`
        : "";

    return `<div class="settings-sync__card" data-profile-id="${escapeHtml(profile.id)}">
    <div class="settings-sync__card-header">
        <span class="settings-sync__card-name" title="${escapeHtml(profile.name)}">${escapeHtml(profile.name)}</span>
    </div>
    <div class="settings-sync__card-info">
        <span class="settings-sync__card-tag">${escapeHtml(platformLabel)}</span>
        <span class="settings-sync__card-date">${escapeHtml(updatedDate)}</span>
    </div>
    <div class="settings-sync__card-meta">
        ${escapeHtml(i18n.source || "Source")}: ${escapeHtml(profile.sourceDevice)} | v${escapeHtml(profile.siyuanVersion)}
    </div>
    ${description}
    <div class="settings-sync__card-actions">
        <button class="b3-button b3-button--small b3-button--outline" data-action="preview" data-id="${escapeHtml(profile.id)}">${escapeHtml(i18n.preview || "Preview")}</button>
        <button class="b3-button b3-button--small b3-button--outline" data-action="apply" data-id="${escapeHtml(profile.id)}">${escapeHtml(i18n.apply)}</button>
        <button class="b3-button b3-button--small b3-button--outline" data-action="rename" data-id="${escapeHtml(profile.id)}">${escapeHtml(i18n.rename)}</button>
        <button class="b3-button b3-button--small b3-button--outline" data-action="update" data-id="${escapeHtml(profile.id)}">${escapeHtml(i18n.update)}</button>
        <button class="b3-button b3-button--small b3-button--outline" data-action="delete" data-id="${escapeHtml(profile.id)}">${escapeHtml(i18n.delete)}</button>
    </div>
</div>`;
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
