import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the SiYuan runtime before importing the wrapper.
const fetchPostMock = vi.fn();
vi.mock("siyuan", () => ({
    fetchPost: (...args: any[]) => fetchPostMock(...args),
}));

import { getWorkspaces, globalCopyFiles } from "../siyuan-api";

beforeEach(() => {
    fetchPostMock.mockReset();
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
