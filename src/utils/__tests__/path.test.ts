import { describe, it, expect } from "vitest";
import { basename, isWindowsPath, joinWorkspacePath, normalizeWorkspacePath, remoteProfilesDir, separatorFor, trimTrailingSep } from "../path";

describe("path utilities", () => {
    describe("isWindowsPath", () => {
        it("detects drive-letter prefixes", () => {
            expect(isWindowsPath("C:\\Users\\me")).toBe(true);
            expect(isWindowsPath("d:/Users/me")).toBe(true);
        });

        it("detects backslash separators", () => {
            expect(isWindowsPath("foo\\bar")).toBe(true);
        });

        it("treats POSIX paths as non-Windows", () => {
            expect(isWindowsPath("/Users/me/SiYuan")).toBe(false);
            expect(isWindowsPath("/var/data")).toBe(false);
        });
    });

    describe("separatorFor", () => {
        it("uses backslash on Windows-style paths", () => {
            expect(separatorFor("C:\\foo")).toBe("\\");
        });
        it("uses forward slash for POSIX paths", () => {
            expect(separatorFor("/var/lib")).toBe("/");
        });
    });

    describe("trimTrailingSep", () => {
        it("strips trailing separators", () => {
            expect(trimTrailingSep("/foo/bar/")).toBe("/foo/bar");
            expect(trimTrailingSep("C:\\foo\\")).toBe("C:\\foo");
            expect(trimTrailingSep("/foo")).toBe("/foo");
        });
    });

    describe("joinWorkspacePath", () => {
        it("joins POSIX paths with forward slashes", () => {
            expect(joinWorkspacePath("/Users/me/SiYuan", "data/storage/petal/x"))
                .toBe("/Users/me/SiYuan/data/storage/petal/x");
        });

        it("joins Windows paths with backslashes", () => {
            expect(joinWorkspacePath("C:\\Users\\me\\SiYuan", "data/storage/petal/x"))
                .toBe("C:\\Users\\me\\SiYuan\\data\\storage\\petal\\x");
        });

        it("strips trailing separator on workspace root", () => {
            expect(joinWorkspacePath("/foo/", "bar")).toBe("/foo/bar");
        });

        it("strips leading separator on sub-path", () => {
            expect(joinWorkspacePath("/foo", "/bar/baz")).toBe("/foo/bar/baz");
        });
    });

    describe("remoteProfilesDir", () => {
        it("appends the canonical profiles sub-path", () => {
            expect(remoteProfilesDir("/Users/me/SiYuan"))
                .toBe("/Users/me/SiYuan/data/storage/petal/siyuan-plugin-settings-sync/profiles");
        });

        it("preserves the workspace separator style", () => {
            expect(remoteProfilesDir("D:\\SiYuan"))
                .toBe("D:\\SiYuan\\data\\storage\\petal\\siyuan-plugin-settings-sync\\profiles");
        });
    });

    describe("basename", () => {
        it("returns the last POSIX segment", () => {
            expect(basename("/foo/bar/baz")).toBe("baz");
        });

        it("returns the last Windows segment", () => {
            expect(basename("C:\\Users\\me")).toBe("me");
        });

        it("ignores trailing separators", () => {
            expect(basename("/foo/bar/")).toBe("bar");
        });

        it("returns the path itself when no separator is present", () => {
            expect(basename("workspace")).toBe("workspace");
        });
    });

    describe("normalizeWorkspacePath", () => {
        it("strips trailing separators", () => {
            expect(normalizeWorkspacePath("/foo/")).toBe("/foo");
        });

        it("lower-cases the drive letter on Windows", () => {
            expect(normalizeWorkspacePath("C:\\Users\\me")).toBe("c:\\Users\\me");
        });

        it("returns empty string for empty input", () => {
            expect(normalizeWorkspacePath("")).toBe("");
        });
    });
});
