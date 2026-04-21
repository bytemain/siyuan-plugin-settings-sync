import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the SiYuan runtime before importing the wrapper.
const fetchPostMock = vi.fn();
vi.mock("siyuan", () => ({
    fetchPost: (...args: any[]) => fetchPostMock(...args),
}));

import { getWorkspaces, globalCopyFiles, setConfModule } from "../siyuan-api";

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
