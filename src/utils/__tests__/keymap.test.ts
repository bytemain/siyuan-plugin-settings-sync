import { describe, it, expect } from "vitest";
import { filterCustomKeymap, mergeKeymap, isSparseKeymap, stripKeymapDefaults } from "../keymap";

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

    it("should handle nested editor subcategories", () => {
        const keymap = {
            general: {
                search: { default: "Ctrl+P", custom: "Ctrl+Shift+P" },
            },
            editor: {
                general: {
                    insertBlockBelow: { default: "Enter", custom: "Ctrl+Enter" },
                    insertBlockAbove: { default: "Shift+Enter", custom: "" },
                },
                insert: {
                    lastUsed: { default: "", custom: "" },
                },
                heading: {
                    heading1: { default: "Ctrl+1", custom: "" },
                },
            },
        };
        const result = filterCustomKeymap(keymap);
        expect(result).toEqual({
            general: {
                search: { default: "Ctrl+P", custom: "Ctrl+Shift+P" },
            },
            editor: {
                general: {
                    insertBlockBelow: { default: "Enter", custom: "Ctrl+Enter" },
                },
            },
        });
    });

    it("should omit nested categories when all bindings are defaults", () => {
        const keymap = {
            editor: {
                general: {
                    insertBlockBelow: { default: "Enter", custom: "" },
                },
                heading: {
                    heading1: { default: "Ctrl+1", custom: "" },
                },
            },
        };
        const result = filterCustomKeymap(keymap);
        expect(result).toEqual({});
    });

    it("should handle nested plugin subcategories", () => {
        const keymap = {
            plugin: {
                myPlugin: {
                    action1: { default: "", custom: "Ctrl+Alt+1" },
                    action2: { default: "", custom: "" },
                },
            },
        };
        const result = filterCustomKeymap(keymap);
        expect(result).toEqual({
            plugin: {
                myPlugin: {
                    action1: { default: "", custom: "Ctrl+Alt+1" },
                },
            },
        });
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

    it("should merge nested editor subcategory bindings", () => {
        const current = {
            editor: {
                general: {
                    insertBlockBelow: { default: "Enter", custom: "" },
                    insertBlockAbove: { default: "Shift+Enter", custom: "" },
                },
                heading: {
                    heading1: { default: "Ctrl+1", custom: "" },
                },
            },
        };
        const saved = {
            editor: {
                general: {
                    insertBlockBelow: { default: "Enter", custom: "Ctrl+Enter" },
                },
            },
        };
        const result = mergeKeymap(current, saved);
        expect(result.editor.general.insertBlockBelow.custom).toBe("Ctrl+Enter");
        expect(result.editor.general.insertBlockAbove.custom).toBe(""); // unchanged
        expect(result.editor.heading.heading1.custom).toBe(""); // unchanged
    });

    it("should add new subcategories in nested categories", () => {
        const current = {
            editor: {
                general: {
                    insertBlockBelow: { default: "Enter", custom: "" },
                },
            },
        };
        const saved = {
            editor: {
                table: {
                    insertRowAbove: { default: "", custom: "Ctrl+Shift+Up" },
                },
            },
        };
        const result = mergeKeymap(current, saved);
        expect(result.editor.table.insertRowAbove.custom).toBe("Ctrl+Shift+Up");
        expect(result.editor.general.insertBlockBelow.custom).toBe("");
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

    it("should return true for a sparse nested keymap", () => {
        const keymap = {
            editor: {
                general: {
                    insertBlockBelow: { default: "Enter", custom: "Ctrl+Enter" },
                },
            },
        };
        expect(isSparseKeymap(keymap)).toBe(true);
    });

    it("should return false for a full nested keymap (has empty custom)", () => {
        const keymap = {
            editor: {
                general: {
                    insertBlockBelow: { default: "Enter", custom: "" },
                    insertBlockAbove: { default: "Shift+Enter", custom: "Ctrl+Shift+Enter" },
                },
            },
        };
        expect(isSparseKeymap(keymap)).toBe(false);
    });

    it("should return false for a mixed keymap with nested empty custom", () => {
        const keymap = {
            general: {
                search: { default: "Ctrl+P", custom: "Ctrl+Shift+P" },
            },
            editor: {
                general: {
                    insertBlockBelow: { default: "Enter", custom: "" },
                },
            },
        };
        expect(isSparseKeymap(keymap)).toBe(false);
    });
});

describe("stripKeymapDefaults", () => {
    it("should remove default fields from flat categories", () => {
        const keymap = {
            general: {
                search: { default: "Ctrl+P", custom: "Ctrl+Shift+P" },
                close: { default: "Ctrl+W", custom: "" },
            },
        };
        expect(stripKeymapDefaults(keymap)).toEqual({
            general: {
                search: { custom: "Ctrl+Shift+P" },
                close: { custom: "" },
            },
        });
    });

    it("should remove default fields from nested categories", () => {
        const keymap = {
            editor: {
                general: {
                    insertBlockBelow: { default: "Enter", custom: "Ctrl+Enter" },
                },
                heading: {
                    heading1: { default: "Ctrl+1", custom: "" },
                },
            },
        };
        expect(stripKeymapDefaults(keymap)).toEqual({
            editor: {
                general: {
                    insertBlockBelow: { custom: "Ctrl+Enter" },
                },
                heading: {
                    heading1: { custom: "" },
                },
            },
        });
    });

    it("should handle mixed flat and nested categories", () => {
        const keymap = {
            general: {
                search: { default: "Ctrl+P", custom: "Ctrl+Shift+P" },
            },
            editor: {
                general: {
                    insertBlockBelow: { default: "Enter", custom: "Ctrl+Enter" },
                },
            },
        };
        expect(stripKeymapDefaults(keymap)).toEqual({
            general: {
                search: { custom: "Ctrl+Shift+P" },
            },
            editor: {
                general: {
                    insertBlockBelow: { custom: "Ctrl+Enter" },
                },
            },
        });
    });

    it("should return empty object for empty keymap", () => {
        expect(stripKeymapDefaults({})).toEqual({});
    });
});
