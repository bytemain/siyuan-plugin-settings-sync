import { describe, it, expect } from "vitest";
import { stripSkipKeys, preserveLocalSkipKeys } from "../skip-keys";

describe("stripSkipKeys", () => {
    it("should delete a matching top-level property", () => {
        const data = { pandocBin: "/usr/bin/pandoc", pandocParams: "--pdf-engine=xelatex" };
        const result = stripSkipKeys(data, "export", ["export.pandocBin"]);
        expect(result).toEqual({ pandocParams: "--pdf-engine=xelatex" });
    });

    it("should delete a nested property", () => {
        const data = { nested: { deep: { value: 1 }, keep: 2 } };
        const result = stripSkipKeys(data, "mod", ["mod.nested.deep.value"]);
        expect(result.nested.deep).toEqual({});
        expect(result.nested.keep).toBe(2);
    });

    it("should ignore skip keys for other modules", () => {
        const data = { pandocBin: "/usr/bin/pandoc" };
        const result = stripSkipKeys(data, "export", ["editor.fontSize"]);
        expect(result).toEqual({ pandocBin: "/usr/bin/pandoc" });
    });

    it("should handle multiple skip keys", () => {
        const data = { pandocBin: "/usr/bin/pandoc", pandocParams: "--pdf-engine=xelatex", format: "html" };
        const result = stripSkipKeys(data, "export", ["export.pandocBin", "export.pandocParams"]);
        expect(result).toEqual({ format: "html" });
    });

    it("should be a no-op when skip keys list is empty", () => {
        const data = { pandocBin: "/usr/bin/pandoc" };
        const result = stripSkipKeys(data, "export", []);
        expect(result).toEqual({ pandocBin: "/usr/bin/pandoc" });
    });

    it("should handle missing keys gracefully", () => {
        const data = { format: "html" };
        const result = stripSkipKeys(data, "export", ["export.pandocBin"]);
        expect(result).toEqual({ format: "html" });
    });
});

describe("preserveLocalSkipKeys", () => {
    it("should copy local value into profile data", () => {
        const profileData = { pandocBin: "/remote/path", format: "html" };
        const currentData = { pandocBin: "/local/path", format: "pdf" };
        const result = preserveLocalSkipKeys(profileData, currentData, "export", ["export.pandocBin"]);
        expect(result.pandocBin).toBe("/local/path");
        expect(result.format).toBe("html"); // unchanged
    });

    it("should handle nested skip keys", () => {
        const profileData = { nested: { deep: { value: "remote" }, keep: "profile" } };
        const currentData = { nested: { deep: { value: "local" }, keep: "current" } };
        const result = preserveLocalSkipKeys(profileData, currentData, "mod", ["mod.nested.deep.value"]);
        expect(result.nested.deep.value).toBe("local");
        expect(result.nested.keep).toBe("profile"); // unchanged
    });

    it("should delete key from profile if local does not have it", () => {
        const profileData = { pandocBin: "/remote/path", format: "html" };
        const currentData = { format: "pdf" };
        const result = preserveLocalSkipKeys(profileData, currentData, "export", ["export.pandocBin"]);
        expect(result).toEqual({ format: "html" });
        expect("pandocBin" in result).toBe(false);
    });

    it("should ignore skip keys for other modules", () => {
        const profileData = { pandocBin: "/remote/path" };
        const currentData = { pandocBin: "/local/path" };
        const result = preserveLocalSkipKeys(profileData, currentData, "export", ["editor.fontSize"]);
        expect(result.pandocBin).toBe("/remote/path");
    });
});
