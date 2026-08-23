import { describe, it, expect } from "vitest";
import { isLegacyAI, isModernAI, migrateLegacyAI, migrateModernAIToLegacy } from "../ai-migrate";

describe("isLegacyAI / isModernAI", () => {
    it("detects the ≤3.6.x shape by the openAI key", () => {
        expect(isLegacyAI({ openAI: { apiKey: "k" } })).toBe(true);
        expect(isLegacyAI({ providers: [] })).toBe(false);
        expect(isLegacyAI(null)).toBe(false);
        expect(isLegacyAI({})).toBe(false);
    });

    it("detects the ≥3.8 shape by the providers array", () => {
        expect(isModernAI({ providers: [] })).toBe(true);
        expect(isModernAI({ openAI: {} })).toBe(false);
        expect(isModernAI(null)).toBe(false);
        expect(isModernAI({ providers: "x" })).toBe(false);
    });
});

describe("migrateLegacyAI", () => {
    const legacy = {
        openAI: {
            apiKey: "sk-test",
            apiBaseURL: "https://api.openai.com/v1",
            apiTimeout: 60,
            apiModel: "gpt-4o",
            apiTemperature: 0.7,
            apiMaxTokens: 4096,
            // No modern counterparts — must be dropped:
            apiProxy: "http://127.0.0.1:7890",
            apiUserAgent: "UA",
            apiVersion: "2024-01-01",
            apiMaxContexts: 9,
        },
    };

    it("appends a new provider when the current config has none", () => {
        const out = migrateLegacyAI(legacy, { providers: [] });
        expect(out.providers).toHaveLength(1);
        const p = out.providers[0];
        expect(p.enabled).toBe(true);
        expect(p.apiKey).toBe("sk-test");
        expect(p.baseURL).toBe("https://api.openai.com/v1");
        expect(p.requestTimeout).toBe(60);
        expect(p.models).toEqual([{ name: "gpt-4o", enabled: true }]);
        expect(out.agent.modelId).toBe("gpt-4o");
        expect(out.editing.modelId).toBe("gpt-4o");
        expect(out.agent.temperature).toBe(0.7);
        expect(out.editing.maxCompletionTokens).toBe(4096);
    });

    it("matches an existing provider by baseURL instead of duplicating it", () => {
        const current = {
            providers: [{
                id: "p1",
                displayName: "OpenAI",
                enabled: true,
                apiKey: "local-key",
                baseURL: "https://api.openai.com/v1",
                models: [{ id: "m1", name: "gpt-4o-mini", enabled: true }],
            }],
        };
        const out = migrateLegacyAI(legacy, current);
        expect(out.providers).toHaveLength(1);
        const p = out.providers[0];
        expect(p.id).toBe("p1");
        expect(p.apiKey).toBe("sk-test");
        // Existing model kept, migrated model upserted
        expect(p.models).toHaveLength(2);
        expect(p.models.find((m: any) => m.name === "gpt-4o").enabled).toBe(true);
    });

    it("does not overwrite the local apiKey when the legacy value is empty (skip-key stripped)", () => {
        const stripped = JSON.parse(JSON.stringify(legacy));
        delete stripped.openAI.apiKey;
        const current = {
            providers: [{
                id: "p1", enabled: true, apiKey: "local-key",
                baseURL: "https://api.openai.com/v1", models: [] as any[],
            }],
        };
        const out = migrateLegacyAI(stripped, current);
        expect(out.providers[0].apiKey).toBe("local-key");
    });

    it("preserves local sections that have no legacy counterpart", () => {
        const current = {
            providers: [] as any[],
            mcp: { servers: [{ name: "fs" }] },
            embedding: { enabled: true, name: "text-embedding-3-small" },
            rerank: { enabled: false },
        };
        const out = migrateLegacyAI(legacy, current);
        expect(out.mcp).toEqual({ servers: [{ name: "fs" }] });
        expect(out.embedding).toEqual({ enabled: true, name: "text-embedding-3-small" });
        expect(out.rerank).toEqual({ enabled: false });
    });

    it("works when the current config is not modern-shaped (defensive)", () => {
        const out = migrateLegacyAI(legacy, undefined);
        expect(out.providers).toHaveLength(1);
        expect(out.agent.modelId).toBe("gpt-4o");
    });
});

describe("migrateModernAIToLegacy", () => {
    it("maps the first enabled provider/model into the openAI section", () => {
        const modern = {
            providers: [
                { enabled: false, apiKey: "off", baseURL: "https://off", models: [{ name: "x", enabled: true }] },
                {
                    enabled: true, apiKey: "sk-test", baseURL: "https://api.deepseek.com/v1", requestTimeout: 45,
                    models: [{ name: "deepseek-chat", enabled: true }],
                },
            ],
            editing: { temperature: 0.5, maxCompletionTokens: 2048 },
            agent: { temperature: 0.9, maxCompletionTokens: 8192 },
        };
        const out = migrateModernAIToLegacy(modern);
        expect(out.openAI.apiKey).toBe("sk-test");
        expect(out.openAI.apiBaseURL).toBe("https://api.deepseek.com/v1");
        expect(out.openAI.apiTimeout).toBe(45);
        expect(out.openAI.apiModel).toBe("deepseek-chat");
        expect(out.openAI.apiTemperature).toBe(0.5);
        expect(out.openAI.apiMaxTokens).toBe(2048);
        expect(out.openAI.apiProvider).toBe("OpenAI");
    });

    it("returns null when there is no usable provider", () => {
        expect(migrateModernAIToLegacy({ providers: [] })).toBeNull();
        expect(migrateModernAIToLegacy({ providers: [{ enabled: true, models: [] }] })).toBeNull();
        expect(migrateModernAIToLegacy({})).toBeNull();
    });
});
