import { describe, it, expect } from "vitest";
import { filterCustomKeymap, mergeKeymap, isSparseKeymap } from "../keymap";

describe("filterCustomKeymap", () => {
    it("should keep only bindings with custom different from default", () => {
        const keymap = {
            general: {
                search: { default: "Ctrl+P", custom: "Ctrl+Shift+P" },
                close: { default: "Ctrl+W", custom: "" },
            },
        };
        const result = filterCustomKeymap(keymap);
        expect(result).toEqual({
            general: {
                search: { default: "Ctrl+P", custom: "Ctrl+Shift+P" },
            },
        });
    });

    it("should omit categories with no custom bindings", () => {
        const keymap = {
            general: {
                close: { default: "Ctrl+W", custom: "" },
            },
            editor: {
                bold: { default: "Ctrl+B", custom: "Ctrl+Shift+B" },
            },
        };
        const result = filterCustomKeymap(keymap);
        expect(result.general).toBeUndefined();
        expect(result.editor).toBeDefined();
    });

    it("should return empty object when all bindings are defaults", () => {
        const keymap = {
            general: {
                close: { default: "Ctrl+W", custom: "" },
                open: { default: "Ctrl+O", custom: "Ctrl+O" }, // same as default
            },
        };
        const result = filterCustomKeymap(keymap);
        expect(result).toEqual({});
    });

    it("should handle empty keymap", () => {
        expect(filterCustomKeymap({})).toEqual({});
    });
});

describe("mergeKeymap", () => {
    it("should apply saved custom bindings to current keymap", () => {
        const current = {
            general: {
                search: { default: "Ctrl+P", custom: "" },
                close: { default: "Ctrl+W", custom: "" },
            },
        };
        const saved = {
            general: {
                search: { default: "Ctrl+P", custom: "Ctrl+Shift+P" },
            },
        };
        const result = mergeKeymap(current, saved);
        expect(result.general.search.custom).toBe("Ctrl+Shift+P");
        expect(result.general.close.custom).toBe(""); // unchanged
    });

    it("should add new categories from saved keymap", () => {
        const current = {
            general: { search: { default: "Ctrl+P", custom: "" } },
        };
        const saved = {
            editor: { bold: { default: "Ctrl+B", custom: "Ctrl+Shift+B" } },
        };
        const result = mergeKeymap(current, saved);
        expect(result.editor.bold.custom).toBe("Ctrl+Shift+B");
        expect(result.general.search.custom).toBe("");
    });

    it("should add new commands in existing categories", () => {
        const current = {
            general: { search: { default: "Ctrl+P", custom: "" } },
        };
        const saved = {
            general: { newCmd: { default: "Ctrl+N", custom: "Ctrl+Shift+N" } },
        };
        const result = mergeKeymap(current, saved);
        expect(result.general.newCmd.custom).toBe("Ctrl+Shift+N");
    });

    it("should not mutate the original current keymap", () => {
        const current = {
            general: { search: { default: "Ctrl+P", custom: "" } },
        };
        const saved = {
            general: { search: { default: "Ctrl+P", custom: "Ctrl+Shift+P" } },
        };
        mergeKeymap(current, saved);
        expect(current.general.search.custom).toBe("");
    });
});

describe("isSparseKeymap", () => {
    it("should return true for a sparse keymap (no empty custom)", () => {
        const keymap = {
            general: {
                search: { default: "Ctrl+P", custom: "Ctrl+Shift+P" },
            },
        };
        expect(isSparseKeymap(keymap)).toBe(true);
    });

    it("should return false for a full keymap (has empty custom)", () => {
        const keymap = {
            general: {
                search: { default: "Ctrl+P", custom: "" },
                close: { default: "Ctrl+W", custom: "Ctrl+Shift+W" },
            },
        };
        expect(isSparseKeymap(keymap)).toBe(false);
    });

    it("should return false for an empty keymap", () => {
        expect(isSparseKeymap({})).toBe(false);
    });
});
