import { describe, it, expect, vi, beforeEach } from "vitest";

// Module-level mocks for the siyuan-api wrappers used by WorkspaceSync.
const apiMocks = vi.hoisted(() => ({
    getWorkspaces: vi.fn(),
    getWorkspacePath: vi.fn(),
    globalCopyFiles: vi.fn(),
    readDir: vi.fn(),
    getFile: vi.fn(),
    removeFile: vi.fn(),
    putFile: vi.fn(),
}));

vi.mock("../siyuan-api", () => apiMocks);

import { WorkspaceSync } from "../workspace-sync";

interface FakeProfile {
    id: string;
    meta: { id: string; name: string; platform: string; createdAt: string; updatedAt: string; sourceDevice: string; siyuanVersion: string; description: string };
    conf: Record<string, any>;
}

function makeProfile(id: string, name: string): FakeProfile {
    return {
        id,
        meta: {
            id,
            name,
            platform: "all",
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-02T00:00:00Z",
            sourceDevice: "test",
            siyuanVersion: "3.0.0",
            description: "",
        },
        conf: {},
    };
}

class FakeConfigManager {
    sharedFolder = "";
    refreshCalls = 0;
    profiles: Record<string, FakeProfile> = {};
    appliedModules: string[] | null = null;

    getSharedFolder() { return this.sharedFolder; }
    async refresh() { this.refreshCalls++; }
    async getProfile(id: string) { return this.profiles[id] || null; }
    async applyProfile(id: string, modules: string[]) {
        if (!this.profiles[id]) throw new Error("missing profile");
        this.appliedModules = modules;
    }
}

beforeEach(() => {
    Object.values(apiMocks).forEach((m) => m.mockReset());
});

describe("WorkspaceSync.listTargets", () => {
    it("excludes the current workspace and includes the shared folder when set", async () => {
        apiMocks.getWorkspacePath.mockResolvedValue("/ws/current");
        apiMocks.getWorkspaces.mockResolvedValue([
            { path: "/ws/current", closed: false },
            { path: "/ws/other", closed: false },
            { path: "/ws/closed", closed: true },
        ]);

        const cm = new FakeConfigManager();
        cm.sharedFolder = "/Users/me/shared";
        const ws = new WorkspaceSync(cm as any);
        await ws.init();

        const targets = ws.listTargets();
        expect(targets.map((t) => t.id)).toEqual(["/ws/other", "/ws/closed", "__shared__"]);
        expect(targets[0].profilesDir).toBe("/ws/other/data/storage/petal/siyuan-plugin-settings-sync/profiles");
        expect(targets[1].closed).toBe(true);
        expect(targets[2].isShared).toBe(true);
    });

    it("normalizes paths so the current workspace is excluded with trailing slashes", async () => {
        apiMocks.getWorkspacePath.mockResolvedValue("/ws/current/");
        apiMocks.getWorkspaces.mockResolvedValue([
            { path: "/ws/current", closed: false },
            { path: "/ws/other", closed: false },
        ]);
        const cm = new FakeConfigManager();
        const ws = new WorkspaceSync(cm as any);
        await ws.init();
        const ids = ws.listTargets().map((t) => t.id);
        expect(ids).toEqual(["/ws/other"]);
    });
});

describe("WorkspaceSync.listRemoteProfiles", () => {
    it("clears the cache, copies the remote profiles dir, then reads the cached files", async () => {
        apiMocks.getWorkspacePath.mockResolvedValue("/ws/current");
        apiMocks.getWorkspaces.mockResolvedValue([{ path: "/ws/other", closed: false }]);

        const profile = makeProfile("p1", "Profile 1");

        // First readDir is for clearing the cache (return empty), second is for the
        // cached "profiles" directory after globalCopyFiles.
        apiMocks.readDir
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ name: "p1.json", isDir: false }]);
        apiMocks.removeFile.mockResolvedValue(undefined);
        apiMocks.globalCopyFiles.mockResolvedValue(undefined);
        apiMocks.getFile.mockResolvedValueOnce(profile);

        const cm = new FakeConfigManager();
        const ws = new WorkspaceSync(cm as any);
        await ws.init();

        const target = ws.listTargets()[0];
        const list = await ws.listRemoteProfiles(target);

        expect(apiMocks.globalCopyFiles).toHaveBeenCalledWith(
            ["/ws/other/data/storage/petal/siyuan-plugin-settings-sync/profiles"],
            "/ws/current/data/storage/petal/siyuan-plugin-settings-sync/.remote-cache/other",
        );
        expect(list).toHaveLength(1);
        expect(list[0].id).toBe("p1");
        expect(list[0].sourceTargetId).toBe("/ws/other");
        expect(list[0].sourcePath).toBe("/ws/other/data/storage/petal/siyuan-plugin-settings-sync/profiles/p1.json");
        expect(ws.isUnsupported()).toBe(false);
    });

    it("marks the platform as unsupported on the first globalCopyFiles failure", async () => {
        apiMocks.getWorkspacePath.mockResolvedValue("/ws/current");
        apiMocks.getWorkspaces.mockResolvedValue([{ path: "/ws/other", closed: false }]);
        apiMocks.readDir.mockResolvedValue([]);
        apiMocks.removeFile.mockResolvedValue(undefined);
        apiMocks.globalCopyFiles.mockRejectedValue(new Error("sandboxed"));

        const cm = new FakeConfigManager();
        const ws = new WorkspaceSync(cm as any);
        await ws.init();

        await expect(ws.listRemoteProfiles(ws.listTargets()[0])).rejects.toThrow(/sandboxed/);
        expect(ws.isUnsupported()).toBe(true);
    });
});

describe("WorkspaceSync.pullProfile", () => {
    it("copies the remote profile file into the local profiles dir and re-scans", async () => {
        apiMocks.getWorkspacePath.mockResolvedValue("/ws/current");
        apiMocks.getWorkspaces.mockResolvedValue([{ path: "/ws/other", closed: false }]);
        apiMocks.globalCopyFiles.mockResolvedValue(undefined);

        const cm = new FakeConfigManager();
        cm.profiles["p1"] = makeProfile("p1", "Profile 1");
        const ws = new WorkspaceSync(cm as any);
        await ws.init();

        const meta = await ws.pullProfile(ws.listTargets()[0], "p1");
        expect(apiMocks.globalCopyFiles).toHaveBeenCalledWith(
            ["/ws/other/data/storage/petal/siyuan-plugin-settings-sync/profiles/p1.json"],
            "/ws/current/data/storage/petal/siyuan-plugin-settings-sync/profiles",
        );
        expect(meta.id).toBe("p1");
        expect(cm.refreshCalls).toBe(1);
    });

    it("throws when the pulled profile cannot be re-read locally", async () => {
        apiMocks.getWorkspacePath.mockResolvedValue("/ws/current");
        apiMocks.getWorkspaces.mockResolvedValue([{ path: "/ws/other", closed: false }]);
        apiMocks.globalCopyFiles.mockResolvedValue(undefined);

        const cm = new FakeConfigManager(); // no profile registered
        const ws = new WorkspaceSync(cm as any);
        await ws.init();

        await expect(ws.pullProfile(ws.listTargets()[0], "missing"))
            .rejects.toThrow(/could not be re-read/);
    });
});

describe("WorkspaceSync.pushProfile", () => {
    it("collects per-target failures without aborting the batch", async () => {
        apiMocks.getWorkspacePath.mockResolvedValue("/ws/current");
        apiMocks.getWorkspaces.mockResolvedValue([
            { path: "/ws/a", closed: false },
            { path: "/ws/b", closed: false },
        ]);

        // First call succeeds, second fails
        apiMocks.globalCopyFiles
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error("denied"));

        const cm = new FakeConfigManager();
        const ws = new WorkspaceSync(cm as any);
        await ws.init();

        const targets = ws.listTargets();
        const result = await ws.pushProfile("p1", targets);
        expect(result.failed).toHaveLength(1);
        expect(result.failed[0].target.id).toBe("/ws/b");
        expect(result.failed[0].error).toMatch(/denied/);
    });
});

describe("WorkspaceSync.pullAndApply", () => {
    it("pulls then forwards to ConfigManager.applyProfile with the requested modules", async () => {
        apiMocks.getWorkspacePath.mockResolvedValue("/ws/current");
        apiMocks.getWorkspaces.mockResolvedValue([{ path: "/ws/other", closed: false }]);
        apiMocks.globalCopyFiles.mockResolvedValue(undefined);

        const cm = new FakeConfigManager();
        cm.profiles["p1"] = makeProfile("p1", "P");
        const ws = new WorkspaceSync(cm as any);
        await ws.init();

        await ws.pullAndApply(ws.listTargets()[0], "p1", ["editor", "keymap"] as any);
        expect(cm.appliedModules).toEqual(["editor", "keymap"]);
    });
});
