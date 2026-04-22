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

        await expect(mgr.applyProfile("p2", ["appearance" as any])).resolves.toEqual(["appearance"]);
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

        await expect(mgr.applyProfile("p3", ["editor" as any])).resolves.toEqual(["editor"]);
        expect(apiMocks.setConfModule).toHaveBeenCalledWith("editor", expect.objectContaining({ fontSize: 18 }));
    });
});
