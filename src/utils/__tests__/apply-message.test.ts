import { describe, it, expect } from "vitest";
import { buildApplySuccessMessage } from "../apply-message";

const i18n = {
    applySuccess: "DEFAULT",
    applySuccessLive: "LIVE",
    applySuccessNeedsRestart: "RESTART: ${modules}",
    applyMigratedNote: "MIGRATED: ${modules}",
    applySkippedNote: "SKIPPED: ${modules}",
    editor: "Editor",
    appearance: "Appearance",
    account: "Account",
    keymap: "Keymap",
    ai: "AI",
};

const result = (applied: string[], migrated: string[] = [], skipped: string[] = []) =>
    ({ applied, migrated, skipped }) as any;

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

    it("appends a migration note for modules migrated across SiYuan versions", () => {
        expect(buildApplySuccessMessage(result(["ai"], ["ai"]), i18n)).toBe("RESTART: AI MIGRATED: AI");
    });

    it("appends a skip note for inapplicable modules", () => {
        expect(buildApplySuccessMessage(result(["editor"], [], ["ai"]), i18n))
            .toBe("RESTART: Editor SKIPPED: AI");
    });

    it("falls back to built-in wording for the notes when i18n keys are missing", () => {
        const msg = buildApplySuccessMessage(result(["ai"], ["ai"], ["keymap"]), {});
        expect(msg).toContain("Migrated to this SiYuan version's config structure: ai");
        expect(msg).toContain("skipped: keymap");
    });
});
