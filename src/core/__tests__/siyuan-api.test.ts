import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the SiYuan runtime before importing the wrapper.
const fetchPostMock = vi.fn();
vi.mock("siyuan", () => ({
    fetchPost: (...args: any[]) => fetchPostMock(...args),
}));

import { getWorkspaces, globalCopyFiles, setConfModule, findMissingAppearanceAssets, formatMissingAppearanceAssetsMessage } from "../siyuan-api";

beforeEach(() => {
    fetchPostMock.mockReset();
    delete (globalThis as any).window;
});

describe("setConfModule", () => {
    function setupWindow() {
        const cfg: any = {};
        (globalThis as any).window = { siyuan: { config: cfg } };
        return cfg;
    }

    it("patches window.siyuan.config[mod] with the kernel response on success", async () => {
        const cfg = setupWindow();
        cfg.account = { displayTitle: true, displayVIP: true };

        fetchPostMock.mockImplementation((url: string, payload: any, cb: (r: any) => void) => {
            expect(url).toBe("/api/setting/setAccount");
            expect(payload).toEqual({ displayTitle: false, displayVIP: false });
            cb({ code: 0, data: { displayTitle: false, displayVIP: false } });
        });

        await setConfModule("account" as any, { displayTitle: false, displayVIP: false });
        expect((globalThis as any).window.siyuan.config.account).toEqual({
            displayTitle: false,
            displayVIP: false,
        });
    });

    it("falls back to the sent payload when the kernel returns no data", async () => {
        setupWindow();
        fetchPostMock.mockImplementation((_url: string, _payload: any, cb: (r: any) => void) => {
            cb({ code: 0 });
        });

        await setConfModule("editor" as any, { fontSize: 18 });
        expect((globalThis as any).window.siyuan.config.editor).toEqual({ fontSize: 18 });
    });

    it("wraps keymap payload in { data } and unwraps the response", async () => {
        const cfg = setupWindow();
        cfg.keymap = { existing: true };

        fetchPostMock.mockImplementation((url: string, payload: any, cb: (r: any) => void) => {
            expect(url).toBe("/api/setting/setKeymap");
            expect(payload).toEqual({ data: { general: {} } });
            cb({ code: 0 });
        });

        await setConfModule("keymap" as any, { general: {} });
        // Bare keymap object stored under .keymap (not wrapped in another { data })
        expect((globalThis as any).window.siyuan.config.keymap).toEqual({ general: {} });
    });

    it("rejects with the kernel error message and does not patch the config", async () => {
        const cfg = setupWindow();
        cfg.account = { displayTitle: true };

        fetchPostMock.mockImplementation((_url: string, _payload: any, cb: (r: any) => void) => {
            cb({ code: -1, msg: "bad" });
        });

        await expect(setConfModule("account" as any, { displayTitle: false })).rejects.toThrow(/bad/);
        expect((globalThis as any).window.siyuan.config.account).toEqual({ displayTitle: true });
    });

    it("does not throw when window.siyuan is unavailable", async () => {
        // No window setup
        fetchPostMock.mockImplementation((_url: string, _payload: any, cb: (r: any) => void) => {
            cb({ code: 0, data: { fontSize: 16 } });
        });
        await expect(setConfModule("editor" as any, { fontSize: 16 })).resolves.toBeUndefined();
    });

    it("rejects when the kernel silently reverts a missing appearance theme", async () => {
        // Reproduces the HarmonyOS/mobile scenario: the requested theme is not
        // installed locally, so SiYuan's InitAppearance() resets it to the
        // built-in default. Without this guard, the apply would appear to
        // succeed but the theme (and conf.json on disk) would not match.
        const cfg = setupWindow();
        cfg.appearance = { themeLight: "daylight", themeDark: "midnight", icon: "material" };

        fetchPostMock.mockImplementation((url: string, _payload: any, cb: (r: any) => void) => {
            expect(url).toBe("/api/setting/setAppearance");
            cb({
                code: 0,
                data: { themeLight: "daylight", themeDark: "midnight", icon: "material" },
            });
        });

        let caught: Error | undefined;
        try {
            await setConfModule("appearance" as any, {
                themeLight: "Savor",
                themeDark: "Savor",
                icon: "material",
            });
        } catch (e: any) {
            caught = e;
        }
        expect(caught).toBeDefined();
        expect(caught!.message).toMatch(/themeLight=Savor/);
        expect(caught!.message).toMatch(/themeDark=Savor/);
        // `icon` was not reverted (material → material), so it must NOT be
        // listed as a reverted field in the error message.
        expect(caught!.message).not.toMatch(/icon=/);
        // window.siyuan.config.appearance must not be patched on a revert
        expect((globalThis as any).window.siyuan.config.appearance).toEqual({
            themeLight: "daylight",
            themeDark: "midnight",
            icon: "material",
        });
    });

    it("succeeds for appearance when the kernel echoes the requested theme", async () => {
        const cfg = setupWindow();
        cfg.appearance = { themeLight: "daylight", themeDark: "midnight", icon: "material" };

        fetchPostMock.mockImplementation((_url: string, _payload: any, cb: (r: any) => void) => {
            cb({
                code: 0,
                data: {
                    themeLight: "Savor",
                    themeDark: "Savor",
                    icon: "material",
                    lang: "en_US",
                },
            });
        });

        await expect(
            setConfModule("appearance" as any, {
                themeLight: "Savor",
                themeDark: "Savor",
                icon: "material",
                lang: "en_US",
            }),
        ).resolves.toBeUndefined();
        expect((globalThis as any).window.siyuan.config.appearance).toEqual({
            themeLight: "Savor",
            themeDark: "Savor",
            icon: "material",
            lang: "en_US",
        });
    });

    it("ignores empty requested appearance fields when checking for revert", async () => {
        // If the saved profile happens to lack a field (e.g. icon=""), don't
        // mistake the kernel filling in a default for a revert.
        setupWindow();
        fetchPostMock.mockImplementation((_url: string, _payload: any, cb: (r: any) => void) => {
            cb({
                code: 0,
                data: { themeLight: "daylight", themeDark: "midnight", icon: "material" },
            });
        });
        await expect(
            setConfModule("appearance" as any, {
                themeLight: "daylight",
                themeDark: "midnight",
                icon: "",
            }),
        ).resolves.toBeUndefined();
    });
});

describe("getWorkspaces", () => {
    it("returns parsed workspace list on success", async () => {
        fetchPostMock.mockImplementation((_url: string, _payload: any, cb: (r: any) => void) => {
            cb({ code: 0, data: [
                { path: "/ws/a", closed: false },
                { path: "/ws/b", closed: true },
            ] });
        });
        const list = await getWorkspaces();
        expect(list).toEqual([
            { path: "/ws/a", closed: false },
            { path: "/ws/b", closed: true },
        ]);
    });

    it("returns [] when the endpoint reports an error", async () => {
        fetchPostMock.mockImplementation((_url: string, _payload: any, cb: (r: any) => void) => {
            cb({ code: -1, msg: "not found" });
        });
        const list = await getWorkspaces();
        expect(list).toEqual([]);
    });

    it("returns [] when the response is malformed", async () => {
        fetchPostMock.mockImplementation((_url: string, _payload: any, cb: (r: any) => void) => {
            cb(null);
        });
        const list = await getWorkspaces();
        expect(list).toEqual([]);
    });

    it("filters out entries without a string path", async () => {
        fetchPostMock.mockImplementation((_url: string, _payload: any, cb: (r: any) => void) => {
            cb({ code: 0, data: [{ closed: true }, { path: "/ok" }] });
        });
        const list = await getWorkspaces();
        expect(list).toEqual([{ path: "/ok", closed: false }]);
    });
});

describe("globalCopyFiles", () => {
    it("forwards srcs and destDir to /api/file/globalCopyFiles", async () => {
        fetchPostMock.mockImplementation((url: string, payload: any, cb: (r: any) => void) => {
            expect(url).toBe("/api/file/globalCopyFiles");
            expect(payload).toEqual({ srcs: ["/a", "/b"], destDir: "/dest" });
            cb({ code: 0 });
        });
        await expect(globalCopyFiles(["/a", "/b"], "/dest")).resolves.toBeUndefined();
    });

    it("rejects with the kernel error message on failure", async () => {
        fetchPostMock.mockImplementation((_url: string, _payload: any, cb: (r: any) => void) => {
            cb({ code: -1, msg: "permission denied" });
        });
        await expect(globalCopyFiles(["/a"], "/dest")).rejects.toThrow(/permission denied/);
    });

    it("rejects with a generic error when no message is provided", async () => {
        fetchPostMock.mockImplementation((_url: string, _payload: any, cb: (r: any) => void) => {
            cb({ code: -1 });
        });
        await expect(globalCopyFiles(["/a"], "/dest")).rejects.toThrow(/Failed to globalCopyFiles/);
    });
});

describe("findMissingAppearanceAssets", () => {
    const localAppearance = {
        lightThemes: [{ name: "daylight", label: "daylight (Built-in)" }],
        darkThemes: [{ name: "midnight", label: "midnight (Built-in)" }],
        icons: [{ name: "material", label: "material (Built-in)" }],
    };

    it("returns [] when all requested assets are installed", () => {
        const requested = { themeLight: "daylight", themeDark: "midnight", icon: "material" };
        expect(findMissingAppearanceAssets(requested, localAppearance)).toEqual([]);
    });

    it("flags themes/icons that are not installed locally", () => {
        const requested = {
            themeLight: "Savor",
            themeDark: "Savor",
            icon: "material",
        };
        const missing = findMissingAppearanceAssets(requested, localAppearance);
        expect(missing).toEqual([
            { field: "themeLight", name: "Savor", label: "Savor" },
            { field: "themeDark", name: "Savor", label: "Savor" },
        ]);
    });

    it("prefers the source profile's bilingual label for missing assets", () => {
        // Profile carries the source device's lightThemes / darkThemes / icons
        // arrays with localized labels; surface those in the error so users
        // know exactly what to install.
        const requested = {
            themeLight: "Savor",
            themeDark: "Savor",
            icon: "ant",
            lightThemes: [{ name: "Savor", label: "流畅 (Savor)" }],
            darkThemes: [{ name: "Savor", label: "流畅 (Savor)" }],
            icons: [{ name: "ant", label: "Ant Design" }],
        };
        const missing = findMissingAppearanceAssets(requested, localAppearance);
        expect(missing).toEqual([
            { field: "themeLight", name: "Savor", label: "流畅 (Savor)" },
            { field: "themeDark", name: "Savor", label: "流畅 (Savor)" },
            { field: "icon", name: "ant", label: "Ant Design" },
        ]);
    });

    it("ignores empty / non-string requested fields", () => {
        const requested = { themeLight: "", themeDark: undefined, icon: null };
        expect(findMissingAppearanceAssets(requested, localAppearance)).toEqual([]);
    });

    it("ignores requested fields with no corresponding installed list", () => {
        // If the local conf doesn't expose a list (older kernel?), don't
        // produce false positives — the post-hoc revert detection still
        // catches genuine misses.
        const requested = { themeLight: "Savor" };
        expect(findMissingAppearanceAssets(requested, {})).toEqual([
            { field: "themeLight", name: "Savor", label: "Savor" },
        ]);
    });

    it("returns [] when inputs are not objects", () => {
        expect(findMissingAppearanceAssets(null, localAppearance)).toEqual([]);
        expect(findMissingAppearanceAssets({ themeLight: "Savor" }, null)).toEqual([]);
    });
});

describe("formatMissingAppearanceAssetsMessage", () => {
    it("uses friendly labels when they differ from the bare directory name", () => {
        const msg = formatMissingAppearanceAssetsMessage([
            { field: "themeLight", name: "Savor", label: "流畅 (Savor)" },
            { field: "icon", name: "ant", label: "ant" },
        ]);
        expect(msg).toMatch(/themeLight=流畅 \(Savor\)/);
        // When label === name we keep the compact "field=name" form.
        expect(msg).toMatch(/icon=ant/);
        expect(msg).toMatch(/marketplace/);
    });
});
