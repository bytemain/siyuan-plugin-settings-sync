import { describe, it, expect } from "vitest";
import { buildApplySuccessMessage } from "../apply-message";

const i18n = {
    applySuccess: "DEFAULT",
    applySuccessLive: "LIVE",
    applySuccessNeedsRestart: "RESTART: ${modules}",
    applyMigratedToNewerNote: "TO-NEWER: ${modules}",
    applyMigratedToOlderNote: "TO-OLDER: ${modules}",
    applySkippedNote: "SKIPPED: ${modules}",
    editor: "Editor",
    appearance: "Appearance",
    account: "Account",
    keymap: "Keymap",
    ai: "AI",
};

const result = (
    applied: string[],
    migrated: { module: string; direction: "toNewer" | "toOlder" }[] = [],
    skipped: string[] = [],
) => ({ applied, migrated, skipped }) as any;

describe("buildApplySuccessMessage", () => {
    it("returns the live message when only live modules were applied", () => {
        expect(buildApplySuccessMessage(result(["appearance"]), i18n)).toBe("LIVE");
    });

    it("lists modules that need a restart", () => {
        expect(buildApplySuccessMessage(result(["appearance", "account", "editor"]), i18n))
            .toBe("RESTART: Account, Editor");
    });

    it("falls back to the generic message when no modules were applied", () => {
        expect(buildApplySuccessMessage(result([]), i18n)).toBe("DEFAULT");
    });

    it("uses safe defaults when i18n keys are missing", () => {
        expect(buildApplySuccessMessage(result(["appearance"]), {})).toBe("Configuration applied");
        const msg = buildApplySuccessMessage(result(["account"]), {});
        expect(msg).toContain("account");
    });

    it("uses direction-specific wording for migrated modules", () => {
        expect(buildApplySuccessMessage(result(["ai"], [{ module: "ai", direction: "toNewer" }]), i18n))
            .toBe("RESTART: AI TO-NEWER: AI");
        expect(buildApplySuccessMessage(result(["ai"], [{ module: "ai", direction: "toOlder" }]), i18n))
            .toBe("RESTART: AI TO-OLDER: AI");
    });

    it("appends a skip note for inapplicable modules", () => {
        expect(buildApplySuccessMessage(result(["editor"], [], ["ai"]), i18n))
            .toBe("RESTART: Editor SKIPPED: AI");
    });

    it("falls back to built-in wording for the notes when i18n keys are missing", () => {
        const msg = buildApplySuccessMessage(
            result(["ai"], [{ module: "ai", direction: "toNewer" }], ["keymap"]), {},
        );
        expect(msg).toContain("converted to the new format: ai");
        expect(msg).toContain("your existing settings were kept: keymap");
    });
});
