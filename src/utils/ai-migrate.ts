/**
 * Cross-version migration for the `ai` config module.
 *
 * SiYuan 3.8 restructured the AI settings: the single `ai.openAI` section
 * (≤3.6.x) became a provider list (`ai.providers[]`) plus per-scene model
 * references (`ai.agent` / `ai.editing` / `ai.imageGeneration`) and new
 * `embedding` / `rerank` / `mcp` sections. Applying a profile across that
 * boundary with the raw payload would either be dropped wholesale by the
 * kernel's JSON unmarshal (legacy → modern) or wipe the target's settings
 * with a near-empty object (modern → legacy).
 *
 * These helpers migrate the mappable subset between the two shapes:
 * provider credentials/endpoint, the chat model, temperature and max
 * tokens. Everything without a counterpart (proxy, user agent, Azure API
 * version, max contexts on the legacy side; embedding / rerank / MCP /
 * image generation on the modern side) is intentionally left untouched.
 *
 * Detection is shape-based rather than version-based so it keeps working
 * for any kernel that exposes either structure.
 */

/** True when the AI config uses the ≤3.6.x shape (`ai.openAI`). */
export function isLegacyAI(data: any): boolean {
    return !!data && typeof data === "object" && !!data.openAI && typeof data.openAI === "object";
}

/** True when the AI config uses the ≥3.8 shape (`ai.providers`). */
export function isModernAI(data: any): boolean {
    return !!data && typeof data === "object" && Array.isArray(data.providers);
}

/**
 * Migrate a legacy (≤3.6.x) AI config into the modern (≥3.8) shape.
 *
 * The result is built on top of a deep clone of `currentAI` (the target
 * device's current modern config) so that sections which did not exist in
 * the legacy shape — MCP servers, embedding, rerank, image generation —
 * keep their local values instead of being reset to kernel defaults.
 *
 * The migrated provider is matched by `baseURL` when possible, otherwise
 * appended. Provider / model IDs are left empty on purpose: the kernel's
 * `setAI` handler runs `Normalize()` + `ReconcileModelIDs()`, which assigns
 * IDs and resolves the name-based `modelId` references written here.
 */
export function migrateLegacyAI(legacyAI: any, currentAI: any): any {
    const src = legacyAI.openAI;
    const base = isModernAI(currentAI) ? JSON.parse(JSON.stringify(currentAI)) : {};
    if (!Array.isArray(base.providers)) base.providers = [];

    let provider = null;
    if (typeof src.apiBaseURL === "string" && src.apiBaseURL !== "") {
        provider = base.providers.find((p: any) => p && p.baseURL === src.apiBaseURL) || null;
    }
    if (!provider) {
        provider = { enabled: true, models: [] };
        base.providers.push(provider);
    }
    if (typeof provider.enabled !== "boolean") provider.enabled = true;
    if (typeof src.apiKey === "string" && src.apiKey !== "") provider.apiKey = src.apiKey;
    if (typeof src.apiBaseURL === "string" && src.apiBaseURL !== "") provider.baseURL = src.apiBaseURL;
    if (typeof src.apiTimeout === "number" && src.apiTimeout > 0) provider.requestTimeout = src.apiTimeout;
    if (!Array.isArray(provider.models)) provider.models = [];

    const modelName = typeof src.apiModel === "string" ? src.apiModel : "";
    if (modelName) {
        let model = provider.models.find((m: any) => m && m.name === modelName);
        if (!model) {
            model = { name: modelName, enabled: true };
            provider.models.push(model);
        } else {
            model.enabled = true;
        }
        // Name-based reference — the kernel reconciles it into a model ID.
        if (!base.agent || typeof base.agent !== "object") base.agent = {};
        if (!base.editing || typeof base.editing !== "object") base.editing = {};
        base.agent.modelId = modelName;
        base.editing.modelId = modelName;
        if (typeof src.apiTemperature === "number" && src.apiTemperature > 0) {
            base.agent.temperature = src.apiTemperature;
            base.editing.temperature = src.apiTemperature;
        }
        if (typeof src.apiMaxTokens === "number" && src.apiMaxTokens > 0) {
            base.agent.maxCompletionTokens = src.apiMaxTokens;
            base.editing.maxCompletionTokens = src.apiMaxTokens;
        }
    }
    return base;
}

/**
 * Migrate a modern (≥3.8) AI config into the legacy (≤3.6.x) shape.
 *
 * Returns null when the modern config has no usable provider/model —
 * callers should skip the module rather than apply an empty `openAI`
 * object that would wipe the target device's working AI settings.
 *
 * Sections with no legacy counterpart (embedding, rerank, MCP, image
 * generation) are dropped by design.
 */
export function migrateModernAIToLegacy(modernAI: any): any | null {
    const providers = Array.isArray(modernAI?.providers) ? modernAI.providers : [];
    const usable = (p: any) => p && p.enabled && Array.isArray(p.models) && p.models.some((m: any) => m && m.enabled && m.name);
    const provider = providers.find(usable) || providers.find((p: any) => p && Array.isArray(p.models) && p.models.length > 0);
    if (!provider) {
        return null;
    }
    const models = provider.models.filter((m: any) => m && m.name);
    const model = models.find((m: any) => m.enabled) || models[0];
    if (!model) {
        return null;
    }

    const editing = modernAI.editing && typeof modernAI.editing === "object" ? modernAI.editing : {};
    const agent = modernAI.agent && typeof modernAI.agent === "object" ? modernAI.agent : {};
    return {
        openAI: {
            apiKey: typeof provider.apiKey === "string" ? provider.apiKey : "",
            apiBaseURL: typeof provider.baseURL === "string" ? provider.baseURL : "",
            apiTimeout: typeof provider.requestTimeout === "number" && provider.requestTimeout > 0 ? provider.requestTimeout : 30,
            apiModel: model.name,
            apiTemperature: editing.temperature || agent.temperature || 1.0,
            apiMaxTokens: editing.maxCompletionTokens || agent.maxCompletionTokens || 0,
            // Legacy-only fields without a modern counterpart: kernel defaults.
            apiMaxContexts: 7,
            apiProvider: "OpenAI",
            apiVersion: "",
            apiProxy: "",
            apiUserAgent: "",
        },
    };
}
