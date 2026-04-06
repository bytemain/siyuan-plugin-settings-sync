/**
 * Utilities for filtering SiYuan keymap configuration.
 *
 * SiYuan keymap structure:
 * {
 *   "general": { "command": { "default": "Ctrl+P", "custom": "" }, ... },
 *   "editor": { "command": { "default": "Ctrl+B", "custom": "Ctrl+Shift+B" }, ... },
 *   ...
 * }
 *
 * When "custom" is empty ("") the user hasn't changed it from the built-in default.
 * We only want to save entries where the user has actually set a custom binding,
 * avoiding hundreds of unchanged default entries in the diff view.
 */

interface KeyBinding {
    default: string;
    custom: string;
}

/**
 * Filter a keymap object to only include entries where the user has set a
 * custom binding that differs from the default.
 *
 * Returns a sparse keymap containing only user-customized bindings.
 */
export function filterCustomKeymap(keymap: Record<string, Record<string, KeyBinding>>): Record<string, Record<string, KeyBinding>> {
    const result: Record<string, Record<string, KeyBinding>> = {};

    for (const [category, commands] of Object.entries(keymap)) {
        if (!commands || typeof commands !== "object") continue;

        const filtered: Record<string, KeyBinding> = {};
        for (const [command, binding] of Object.entries(commands)) {
            if (!binding || typeof binding !== "object") continue;
            // Only keep bindings where user has set a custom value different from default
            if (binding.custom && binding.custom !== "" && binding.custom !== binding.default) {
                filtered[command] = { default: binding.default, custom: binding.custom };
            }
        }

        if (Object.keys(filtered).length > 0) {
            result[category] = filtered;
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
 */
export function mergeKeymap(
    currentKeymap: Record<string, Record<string, KeyBinding>>,
    savedKeymap: Record<string, Record<string, KeyBinding>>,
): Record<string, Record<string, KeyBinding>> {
    // Deep clone current keymap so we don't mutate the original
    const merged = JSON.parse(JSON.stringify(currentKeymap)) as Record<string, Record<string, KeyBinding>>;

    for (const [category, commands] of Object.entries(savedKeymap)) {
        if (!merged[category]) {
            // Category doesn't exist in current — add it as-is
            merged[category] = commands;
            continue;
        }

        for (const [command, binding] of Object.entries(commands)) {
            if (merged[category][command]) {
                // Apply the saved custom binding
                merged[category][command].custom = binding.custom;
            } else {
                // Command doesn't exist in current — add it
                merged[category][command] = binding;
            }
        }
    }

    return merged;
}

/**
 * Check if a keymap object is a sparse/filtered keymap (only customizations)
 * vs a full keymap. A sparse keymap will have significantly fewer entries.
 * We detect this by checking if any entry has custom === "" (full keymap) or not.
 */
export function isSparseKeymap(keymap: Record<string, Record<string, KeyBinding>>): boolean {
    for (const commands of Object.values(keymap)) {
        if (!commands || typeof commands !== "object") continue;
        for (const binding of Object.values(commands)) {
            if (!binding || typeof binding !== "object") continue;
            // If we find an entry with empty custom, it's a full keymap
            if (binding.custom === "") {
                return false;
            }
        }
    }
    return true;
}
