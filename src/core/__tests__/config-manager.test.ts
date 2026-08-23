import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the siyuan-api wrappers so applyProfile runs without a real kernel.
// We re-export the real `findMissingAppearanceAssets` /
// `formatMissingAppearanceAssetsMessage` so the pre-flight code path under
// test exercises the production helper, not a mocked stub.
const apiMocks = vi.hoisted(() => ({
    getConf: vi.fn(),
    getFile: vi.fn(),
    putFile: vi.fn(),
    readDir: vi.fn(),
    removeFile: vi.fn(),
    setConfModule: vi.fn(),
    performSync: vi.fn(),
    getLocalStorage: vi.fn(),
}));

vi.mock("../siyuan-api", async () => {
    const actual: any = await vi.importActual("../siyuan-api");
    return {
        ...apiMocks,
        findMissingAppearanceAssets: actual.findMissingAppearanceAssets,
        formatMissingAppearanceAssetsMessage: actual.formatMissingAppearanceAssetsMessage,
    };
});

vi.mock("siyuan", () => ({
    Constants: { SIYUAN_VERSION: "3.0.0" },
    fetchPost: vi.fn(),
}));

import { ConfigManager } from "../config-manager";

beforeEach(() => {
    Object.values(apiMocks).forEach((m) => m.mockReset());
    apiMocks.readDir.mockResolvedValue([]);
    apiMocks.performSync.mockResolvedValue(undefined);
});

function installManagerWithProfile(profile: any) {
    apiMocks.getFile.mockImplementation(async (path: string) => {
        if (path.endsWith(`${profile.id}.json`)) return profile;
        return null;
    });
    return new ConfigManager();
}

describe("ConfigManager.applyProfile — appearance pre-flight", () => {
    const localAppearance = {
        themeLight: "daylight",
        themeDark: "midnight",
        icon: "material",
        lightThemes: [{ name: "daylight", label: "daylight (Built-in)" }],
        darkThemes: [{ name: "midnight", label: "midnight (Built-in)" }],
        icons: [{ name: "material", label: "material (Built-in)" }],
    };

    it("rejects before POSTing when a requested theme is not installed locally", async () => {
        const profile = {
            id: "p1",
            meta: { id: "p1", name: "n", platform: "all", createdAt: "", updatedAt: "", sourceDevice: "", siyuanVersion: "", description: "" },
            conf: {
                appearance: {
                    themeLight: "Savor",
                    themeDark: "Savor",
                    icon: "material",
                    // Source-device labels travel with the profile so the
                    // pre-flight error surfaces them to the user.
                    lightThemes: [{ name: "Savor", label: "流畅 (Savor)" }],
                    darkThemes: [{ name: "Savor", label: "流畅 (Savor)" }],
                    icons: [{ name: "material", label: "material (Built-in)" }],
                },
            },
        };
        const mgr = installManagerWithProfile(profile);
        apiMocks.getConf.mockResolvedValue({ conf: { appearance: localAppearance } });

        await expect(mgr.applyProfile("p1", ["appearance" as any])).rejects.toThrow(/流畅 \(Savor\)/);

        // Crucially: the pre-flight short-circuits the POST entirely so the
        // kernel never gets a chance to silently revert (and on HarmonyOS,
        // never gets a chance to reload the page on us).
        expect(apiMocks.setConfModule).not.toHaveBeenCalled();
    });

    it("applies normally when every requested theme/icon is installed locally", async () => {
        const profile = {
            id: "p2",
            meta: { id: "p2", name: "n", platform: "all", createdAt: "", updatedAt: "", sourceDevice: "", siyuanVersion: "", description: "" },
            conf: {
                appearance: {
                    themeLight: "daylight",
                    themeDark: "midnight",
                    icon: "material",
                },
            },
        };
        const mgr = installManagerWithProfile(profile);
        apiMocks.getConf.mockResolvedValue({ conf: { appearance: localAppearance } });
        apiMocks.setConfModule.mockResolvedValue(undefined);

        await expect(mgr.applyProfile("p2", ["appearance" as any])).resolves.toMatchObject({ applied: ["appearance"], migrated: [], skipped: [] });
        expect(apiMocks.setConfModule).toHaveBeenCalledTimes(1);
        expect(apiMocks.setConfModule).toHaveBeenCalledWith(
            "appearance",
            expect.objectContaining({ themeLight: "daylight", themeDark: "midnight", icon: "material" }),
        );
    });

    it("does not pre-flight non-appearance modules (no false positives)", async () => {
        const profile = {
            id: "p3",
            meta: { id: "p3", name: "n", platform: "all", createdAt: "", updatedAt: "", sourceDevice: "", siyuanVersion: "", description: "" },
            conf: { editor: { fontSize: 18 } },
        };
        const mgr = installManagerWithProfile(profile);
        apiMocks.getConf.mockResolvedValue({ conf: { editor: { fontSize: 16 } } });
        apiMocks.setConfModule.mockResolvedValue(undefined);

        await expect(mgr.applyProfile("p3", ["editor" as any])).resolves.toMatchObject({ applied: ["editor"], migrated: [], skipped: [] });
        expect(apiMocks.setConfModule).toHaveBeenCalledWith("editor", expect.objectContaining({ fontSize: 18 }));
    });
});

describe("ConfigManager — ai module cross-version migration", () => {
    it("migrates a legacy (≤3.6) profile into the modern shape on a ≥3.8 device", async () => {
        const profile = {
            id: "a1",
            meta: { id: "a1", name: "n", platform: "all", createdAt: "", updatedAt: "", sourceDevice: "", siyuanVersion: "3.6.5", description: "" },
            conf: {
                ai: {
                    openAI: {
                        apiKey: "sk-legacy", apiBaseURL: "https://api.openai.com/v1", apiTimeout: 60,
                        apiModel: "gpt-4o", apiTemperature: 0.7, apiMaxTokens: 4096,
                    },
                },
            },
        };
        const mgr = installManagerWithProfile(profile);
        apiMocks.getConf.mockResolvedValue({
            conf: { ai: { providers: [], mcp: { servers: [{ name: "fs" }] } } },
        });
        apiMocks.setConfModule.mockResolvedValue(undefined);

        await expect(mgr.applyProfile("a1", ["ai" as any])).resolves.toMatchObject({ applied: ["ai"], migrated: [{ module: "ai", direction: "toNewer" }], skipped: [] });
        const applied = apiMocks.setConfModule.mock.calls[0][1];
        expect(applied.providers).toHaveLength(1);
        expect(applied.providers[0]).toMatchObject({
            apiKey: "sk-legacy",
            baseURL: "https://api.openai.com/v1",
            models: [{ name: "gpt-4o", enabled: true }],
        });
        expect(applied.agent.modelId).toBe("gpt-4o");
        // Local-only sections survive the apply
        expect(applied.mcp).toEqual({ servers: [{ name: "fs" }] });
    });

    it("migrates a modern (≥3.8) profile into the legacy shape on a ≤3.6 device", async () => {
        const profile = {
            id: "a2",
            meta: { id: "a2", name: "n", platform: "all", createdAt: "", updatedAt: "", sourceDevice: "", siyuanVersion: "3.8.1", description: "" },
            conf: {
                ai: {
                    providers: [{
                        enabled: true, apiKey: "sk-modern", baseURL: "https://api.deepseek.com/v1", requestTimeout: 45,
                        models: [{ name: "deepseek-chat", enabled: true }],
                    }],
                    editing: { temperature: 0.5, maxCompletionTokens: 2048 },
                },
            },
        };
        const mgr = installManagerWithProfile(profile);
        // Local 3.6 device: openAI shape, and its apiKey must be preserved by
        // the default skip key (ai.openAI.apiKey).
        apiMocks.getConf.mockResolvedValue({
            conf: { ai: { openAI: { apiKey: "local-36-key", apiModel: "gpt-3.5" } } },
        });
        apiMocks.setConfModule.mockResolvedValue(undefined);

        await expect(mgr.applyProfile("a2", ["ai" as any])).resolves.toMatchObject({ applied: ["ai"], migrated: [{ module: "ai", direction: "toOlder" }], skipped: [] });
        const applied = apiMocks.setConfModule.mock.calls[0][1];
        expect(applied.openAI).toMatchObject({
            apiBaseURL: "https://api.deepseek.com/v1",
            apiModel: "deepseek-chat",
            apiTimeout: 45,
            apiTemperature: 0.5,
            apiMaxTokens: 2048,
        });
        expect(applied.openAI.apiKey).toBe("local-36-key");
        expect(applied.providers).toBeUndefined();
    });

    it("skips the ai module when a modern profile has no migratable provider", async () => {
        const profile = {
            id: "a3",
            meta: { id: "a3", name: "n", platform: "all", createdAt: "", updatedAt: "", sourceDevice: "", siyuanVersion: "3.8.1", description: "" },
            conf: { ai: { providers: [] as any[] } },
        };
        const mgr = installManagerWithProfile(profile);
        apiMocks.getConf.mockResolvedValue({ conf: { ai: { openAI: { apiKey: "k" } } } });

        await expect(mgr.applyProfile("a3", ["ai" as any])).resolves.toMatchObject({ applied: [], migrated: [], skipped: ["ai"] });
        expect(apiMocks.setConfModule).not.toHaveBeenCalled();
    });

    it("applies as-is when profile and device share the same shape", async () => {
        const profile = {
            id: "a4",
            meta: { id: "a4", name: "n", platform: "all", createdAt: "", updatedAt: "", sourceDevice: "", siyuanVersion: "3.8.1", description: "" },
            conf: { ai: { providers: [{ enabled: true, baseURL: "https://x", models: [] as any[] }] } },
        };
        const mgr = installManagerWithProfile(profile);
        apiMocks.getConf.mockResolvedValue({ conf: { ai: { providers: [] } } });
        apiMocks.setConfModule.mockResolvedValue(undefined);

        await expect(mgr.applyProfile("a4", ["ai" as any])).resolves.toMatchObject({ applied: ["ai"], migrated: [], skipped: [] });
        expect(apiMocks.setConfModule).toHaveBeenCalledWith("ai", expect.objectContaining({ providers: expect.any(Array) }));
    });
});

describe("ConfigManager — layout module", () => {
    it("captureCurrentConf reads layouts from local storage, not conf.json", async () => {
        const mgr = new ConfigManager();
        apiMocks.getConf.mockResolvedValue({ conf: { editor: { fontSize: 16 } } });
        apiMocks.getLocalStorage.mockResolvedValue({
            "local-layouts": [{ name: "work", time: 1, layout: { direction: "lr" } }],
        });

        const conf = await mgr.getCurrentConf(["layout" as any]);
        expect(conf.layout).toEqual({ layouts: [{ name: "work", time: 1, layout: { direction: "lr" } }] });
    });

    it("omits the layout module when no layout has been saved", async () => {
        const mgr = new ConfigManager();
        apiMocks.getLocalStorage.mockResolvedValue({});

        const conf = await mgr.getCurrentConf(["layout" as any]);
        expect(conf.layout).toBeUndefined();
    });

    it("applyProfile routes layout data through setConfModule", async () => {
        const profile = {
            id: "p4",
            meta: { id: "p4", name: "n", platform: "all", createdAt: "", updatedAt: "", sourceDevice: "", siyuanVersion: "", description: "" },
            conf: { layout: { layouts: [{ name: "work", time: 1, layout: {} }] } },
        };
        const mgr = installManagerWithProfile(profile);
        apiMocks.getConf.mockResolvedValue({ conf: {} });
        apiMocks.setConfModule.mockResolvedValue(undefined);

        await expect(mgr.applyProfile("p4", ["layout" as any])).resolves.toMatchObject({ applied: ["layout"], migrated: [], skipped: [] });
        expect(apiMocks.setConfModule).toHaveBeenCalledWith(
            "layout",
            expect.objectContaining({ layouts: [{ name: "work", time: 1, layout: {} }] }),
        );
    });
});
