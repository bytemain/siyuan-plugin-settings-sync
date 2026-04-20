import {
    Plugin,
    getFrontend,
} from "siyuan";
import "./index.scss";
import { ConfigManager } from "./core/config-manager";
import { WorkspaceSync } from "./core/workspace-sync";
import { openMainDialog } from "./ui/main-dialog";

const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

export default class SettingsSyncPlugin extends Plugin {

    private configManager: ConfigManager;
    private workspaceSync: WorkspaceSync;
    private isMobile: boolean;

    async onload() {
        const frontend = getFrontend();
        this.isMobile = frontend === "mobile" || frontend === "browser-mobile";

        this.configManager = new ConfigManager();
        this.workspaceSync = new WorkspaceSync(this.configManager);

        // Auto-push hook: when a profile is saved or updated and the user
        // opted in, push the new file to all known workspaces / shared folder.
        this.configManager.setOnProfilePersisted((profileId) => {
            if (!this.configManager.getAutoPushOnSave()) return;
            this.workspaceSync.autoPush(profileId).then((result) => {
                if (result.failed.length > 0) {
                    console.warn("[settings-sync] auto-push had failures:", result.failed);
                }
            }).catch((e) => {
                console.warn("[settings-sync] auto-push failed:", e);
            });
        });

        // Register SVG icon
        this.addIcons(`<symbol id="iconSettingsSync" viewBox="0 0 24 24">${ICON_SVG}</symbol>`);

        // Register command
        this.addCommand({
            langKey: "openManager",
            hotkey: "",
            callback: () => {
                this.openManager();
            },
        });
    }

    onLayoutReady() {
        // Add top bar icon
        this.addTopBar({
            icon: "iconSettingsSync",
            title: this.i18n.pluginName || "Settings Sync",
            position: "right",
            callback: () => {
                this.openManager();
            },
        });

        // Pre-init the config manager and workspace sync helper
        this.configManager.init().then(() => this.workspaceSync.init()).catch((e) => {
            console.error("[settings-sync] Failed to init config manager:", e);
        });
    }

    openSetting() {
        this.openManager();
    }

    onunload() {
        // No persistent resources to clean up
    }

    private openManager() {
        openMainDialog(this.configManager, this.workspaceSync, this.i18n, this.isMobile);
    }
}
