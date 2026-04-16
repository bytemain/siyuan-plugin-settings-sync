/**
 * Utilities for filtering SiYuan keymap configuration.
 *
 * SiYuan keymap structure (mixed nesting depth):
 * {
 *   "general": { "commandPalette": { "default": "Ctrl+P", "custom": "" }, ... },
 *   "editor": {
 *     "general": { "insertBlockBelow": { "default": "Enter", "custom": "" }, ... },
 *     "insert":  { "lastUsed": { "default": "", "custom": "" }, ... },
 *     "heading": { "heading1": { "default": "Ctrl+1", "custom": "" }, ... },
 *     "list":    { "indent": { "default": "Tab", "custom": "" }, ... },
 *     "table":   { "insertRowAbove": { "default": "", "custom": "" }, ... },
 *   },
 *   "plugin": {
 *     "pluginName": { "action": { "default": "", "custom": "" }, ... },
 *   },
 * }
 *
 * The "general" category maps commands directly to {default, custom} bindings,
 * while "editor" and "plugin" have an extra level of subcategories.
 *
 * When "custom" is empty ("") the user hasn't changed it from the built-in default.
 * We only want to save entries where the user has actually set a custom binding,
 * avoiding hundreds of unchanged default entries in the diff view.
 */

interface KeyBinding {
    default: string;
    custom: string;
}

/** Check whether a value looks like a KeyBinding ({default, custom} both strings). */
function isKeyBinding(v: any): v is KeyBinding {
    return v && typeof v === "object" && typeof v.default === "string" && typeof v.custom === "string";
}

/**
 * Filter a flat command map, keeping only entries with a user-set custom binding.
 */
function filterBindings(commands: Record<string, KeyBinding>): Record<string, KeyBinding> {
    const filtered: Record<string, KeyBinding> = {};
    for (const [command, binding] of Object.entries(commands)) {
        if (!isKeyBinding(binding)) continue;
        if (binding.custom && binding.custom !== "" && binding.custom !== binding.default) {
            filtered[command] = { default: binding.default, custom: binding.custom };
        }
    }
    return filtered;
}

/**
 * Filter a keymap object to only include entries where the user has set a
 * custom binding that differs from the default.
 *
 * Handles both flat categories (e.g. "general") and categories with
 * subcategories (e.g. "editor.general", "editor.insert", "plugin.*").
 *
 * Returns a sparse keymap containing only user-customized bindings.
 */
export function filterCustomKeymap(keymap: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [category, value] of Object.entries(keymap)) {
        if (!value || typeof value !== "object") continue;

        // Detect whether this category maps directly to KeyBindings or has subcategories
        const firstChild = Object.values(value).find((v) => v && typeof v === "object");
        if (isKeyBinding(firstChild)) {
            // Flat category: { commandName: { default, custom } }
            const filtered = filterBindings(value as Record<string, KeyBinding>);
            if (Object.keys(filtered).length > 0) {
                result[category] = filtered;
            }
        } else {
            // Nested category with subcategories: { subcategory: { commandName: { default, custom } } }
            const filteredCategory: Record<string, any> = {};
            for (const [subcat, subCommands] of Object.entries(value)) {
                if (!subCommands || typeof subCommands !== "object") continue;
                const filtered = filterBindings(subCommands as Record<string, KeyBinding>);
                if (Object.keys(filtered).length > 0) {
                    filteredCategory[subcat] = filtered;
                }
            }
            if (Object.keys(filteredCategory).length > 0) {
                result[category] = filteredCategory;
            }
        }
    }

    return result;
}

/**
 * Merge saved keymap customizations into the current full keymap.
 *
 * For each entry in savedKeymap, apply the custom binding to the corresponding
 * entry in currentKeymap. Entries not in savedKeymap are left unchanged.
 * This avoids overwriting all keybindings when applying a profile that only
 * contains the user's customizations.
 *
 * Handles both flat categories and nested subcategories.
 */
export function mergeKeymap(
    currentKeymap: Record<string, any>,
    savedKeymap: Record<string, any>,
): Record<string, any> {
    // Deep clone current keymap so we don't mutate the original
    const merged = JSON.parse(JSON.stringify(currentKeymap));

    for (const [category, savedValue] of Object.entries(savedKeymap)) {
        if (!merged[category]) {
            merged[category] = savedValue;
            continue;
        }

        // Detect whether the saved value is flat or nested
        const firstChild = Object.values(savedValue).find((v) => v && typeof v === "object");
        if (isKeyBinding(firstChild)) {
            // Flat category: merge commands directly
            for (const [command, binding] of Object.entries(savedValue as Record<string, KeyBinding>)) {
                if (merged[category][command]) {
                    merged[category][command].custom = binding.custom;
                } else {
                    merged[category][command] = binding;
                }
            }
        } else {
            // Nested category: iterate subcategories then merge commands
            for (const [subcat, subCommands] of Object.entries(savedValue as Record<string, Record<string, KeyBinding>>)) {
                if (!merged[category][subcat]) {
                    merged[category][subcat] = subCommands;
                    continue;
                }
                for (const [command, binding] of Object.entries(subCommands)) {
                    if (merged[category][subcat][command]) {
                        merged[category][subcat][command].custom = binding.custom;
                    } else {
                        merged[category][subcat][command] = binding;
                    }
                }
            }
        }
    }

    return merged;
}

/**
 * Strip `default` fields from keymap leaf nodes for display purposes.
 *
 * The `default` value in a KeyBinding represents SiYuan's built-in default shortcut.
 * It is not meaningful for users to view or apply, so we remove it before
 * showing diffs in the preview UI. Only the `custom` value (user-set binding)
 * is kept.
 *
 * Handles both flat categories and nested subcategories.
 */
export function stripKeymapDefaults(keymap: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [category, value] of Object.entries(keymap)) {
        if (!value || typeof value !== "object") continue;

        const firstChild = Object.values(value).find((v) => v && typeof v === "object");
        if (isKeyBinding(firstChild)) {
            // Flat category: { commandName: { default, custom } }
            const cleaned: Record<string, any> = {};
            for (const [cmd, binding] of Object.entries(value)) {
                if (isKeyBinding(binding)) {
                    cleaned[cmd] = { custom: (binding as KeyBinding).custom };
                }
            }
            if (Object.keys(cleaned).length > 0) result[category] = cleaned;
        } else {
            // Nested category: { subcategory: { commandName: { default, custom } } }
            const cleanedCategory: Record<string, any> = {};
            for (const [subcat, subCommands] of Object.entries(value)) {
                if (!subCommands || typeof subCommands !== "object") continue;
                const cleaned: Record<string, any> = {};
                for (const [cmd, binding] of Object.entries(subCommands as Record<string, any>)) {
                    if (isKeyBinding(binding)) {
                        cleaned[cmd] = { custom: (binding as KeyBinding).custom };
                    }
                }
                if (Object.keys(cleaned).length > 0) cleanedCategory[subcat] = cleaned;
            }
            if (Object.keys(cleanedCategory).length > 0) result[category] = cleanedCategory;
        }
    }

    return result;
}

/**
 * Check if a keymap object is a sparse/filtered keymap (only customizations)
 * vs a full keymap. A sparse keymap will have significantly fewer entries.
 * We detect this by checking if any entry has custom === "" (full keymap) or not.
 *
 * Handles both flat categories and nested subcategories.
 */
export function isSparseKeymap(keymap: Record<string, any>): boolean {
    // An empty keymap is not considered sparse — nothing to merge
    let hasEntries = false;
    for (const categoryValue of Object.values(keymap)) {
        if (!categoryValue || typeof categoryValue !== "object") continue;

        const firstChild = Object.values(categoryValue).find((v) => v && typeof v === "object");
        if (isKeyBinding(firstChild)) {
            // Flat category
            for (const binding of Object.values(categoryValue as Record<string, KeyBinding>)) {
                if (!isKeyBinding(binding)) continue;
                hasEntries = true;
                if (binding.custom === "") {
                    return false;
                }
            }
        } else {
            // Nested category
            for (const subCommands of Object.values(categoryValue as Record<string, Record<string, KeyBinding>>)) {
                if (!subCommands || typeof subCommands !== "object") continue;
                for (const binding of Object.values(subCommands)) {
                    if (!isKeyBinding(binding)) continue;
                    hasEntries = true;
                    if (binding.custom === "") {
                        return false;
                    }
                }
            }
        }
    }
    return hasEntries;
}
