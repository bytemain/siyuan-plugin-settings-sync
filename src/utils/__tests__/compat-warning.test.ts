import { describe, it, expect } from "vitest";
import { buildCompatWarnings } from "../compat-warning";

const i18n = {
    crossPlatformWarning: "PLATFORM: ${source} -> ${current}",
    versionMismatchWarning: "VERSION: ${source} -> ${current}",
};

const device = { platform: "windows", frontend: "", backend: "", siyuanVersion: "3.8.1" } as any;

describe("buildCompatWarnings", () => {
    it("returns no warnings when platform and version match", () => {
        expect(buildCompatWarnings({ platform: "windows", siyuanVersion: "3.8.0" } as any, device, i18n)).toEqual([]);
    });

    it("warns on platform mismatch with friendly labels", () => {
        const w = buildCompatWarnings({ platform: "darwin", siyuanVersion: "3.8.1" } as any, device, i18n);
        expect(w).toEqual(["PLATFORM: macOS -> Windows"]);
    });

    it("does not warn for all-platform profiles", () => {
        expect(buildCompatWarnings({ platform: "all", siyuanVersion: "3.8.1" } as any, device, i18n)).toEqual([]);
    });

    it("warns on major.minor version mismatch", () => {
        const w = buildCompatWarnings({ platform: "windows", siyuanVersion: "3.6.5" } as any, device, i18n);
        expect(w).toEqual(["VERSION: 3.6.5 -> 3.8.1"]);
    });

    it("ignores patch-level differences and unparsable versions", () => {
        expect(buildCompatWarnings({ platform: "windows", siyuanVersion: "3.8.2" } as any, device, i18n)).toEqual([]);
        expect(buildCompatWarnings({ platform: "windows", siyuanVersion: "unknown" } as any, device, i18n)).toEqual([]);
        expect(buildCompatWarnings({ platform: "windows", siyuanVersion: "" } as any, device, i18n)).toEqual([]);
    });

    it("combines both warnings", () => {
        const w = buildCompatWarnings({ platform: "android", siyuanVersion: "3.6.5" } as any, device, i18n);
        expect(w).toEqual(["PLATFORM: Android -> Windows", "VERSION: 3.6.5 -> 3.8.1"]);
    });
});
