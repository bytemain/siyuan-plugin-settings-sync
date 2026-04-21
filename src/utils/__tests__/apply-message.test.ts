import { describe, it, expect } from "vitest";
import { buildApplySuccessMessage } from "../apply-message";

const i18n = {
    applySuccess: "DEFAULT",
    applySuccessLive: "LIVE",
    applySuccessNeedsRestart: "RESTART: ${modules}",
    editor: "Editor",
    appearance: "Appearance",
    account: "Account",
    keymap: "Keymap",
};

describe("buildApplySuccessMessage", () => {
    it("returns the live message when only live modules were applied", () => {
        expect(buildApplySuccessMessage(["appearance"] as any, i18n)).toBe("LIVE");
    });

    it("lists modules that need a restart", () => {
        expect(buildApplySuccessMessage(["appearance", "account", "editor"] as any, i18n))
            .toBe("RESTART: Account, Editor");
    });

    it("falls back to the generic message when no modules were applied", () => {
        expect(buildApplySuccessMessage([], i18n)).toBe("DEFAULT");
    });

    it("uses safe defaults when i18n keys are missing", () => {
        expect(buildApplySuccessMessage(["appearance"] as any, {})).toBe("Configuration applied");
        const msg = buildApplySuccessMessage(["account"] as any, {});
        expect(msg).toContain("account");
    });
});
