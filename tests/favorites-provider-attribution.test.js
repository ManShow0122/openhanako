import { describe, it, expect } from "vitest";

describe("Favorites provider attribution", () => {
  // Simulate sync-favorites Step 4 core logic
  function resolveProviderModels(mustKeep, modelToProvider) {
    const providerModels = new Map();
    for (const item of mustKeep) {
      let prov, modelId;
      if (typeof item === "object" && item !== null && item.id) {
        if (item.provider) {
          prov = item.provider;
          modelId = item.id;
        } else {
          prov = modelToProvider.get(item.id);
          modelId = item.id;
        }
      } else if (typeof item === "string") {
        const mid = item;
        if (mid.includes("/")) {
          const slashIdx = mid.indexOf("/");
          prov = mid.slice(0, slashIdx);
          modelId = mid.slice(slashIdx + 1);
        }
        if (!prov) {
          prov = modelToProvider.get(mid);
          modelId = mid;
        }
      }
      if (!prov) continue;
      if (!providerModels.has(prov)) providerModels.set(prov, new Set());
      providerModels.get(prov).add(modelId);
    }
    return providerModels;
  }

  it("object entries use their own provider, skip reverse lookup", () => {
    const mustKeep = [{ id: "minimax-2.5", provider: "dashscope" }];
    const reverseMap = new Map([["minimax-2.5", "minimax"]]);
    const result = resolveProviderModels(mustKeep, reverseMap);
    expect(result.get("dashscope")?.has("minimax-2.5")).toBe(true);
    expect(result.has("minimax")).toBe(false);
  });

  it("string entries still use reverse lookup (backward compat)", () => {
    const mustKeep = ["gpt-4o"];
    const reverseMap = new Map([["gpt-4o", "openai"]]);
    const result = resolveProviderModels(mustKeep, reverseMap);
    expect(result.get("openai")?.has("gpt-4o")).toBe(true);
  });

  it("same model ID under different providers coexist", () => {
    const mustKeep = [
      { id: "minimax-2.5", provider: "dashscope" },
      { id: "minimax-2.5", provider: "minimax" },
    ];
    const result = resolveProviderModels(mustKeep, new Map());
    expect(result.get("dashscope")?.has("minimax-2.5")).toBe(true);
    expect(result.get("minimax")?.has("minimax-2.5")).toBe(true);
  });

  it("mixed old and new format works together", () => {
    const mustKeep = ["gpt-4o", { id: "minimax-2.5", provider: "dashscope" }];
    const reverseMap = new Map([["gpt-4o", "openai"]]);
    const result = resolveProviderModels(mustKeep, reverseMap);
    expect(result.get("openai")?.has("gpt-4o")).toBe(true);
    expect(result.get("dashscope")?.has("minimax-2.5")).toBe(true);
  });

  it("object entry without provider falls back to reverse lookup", () => {
    const mustKeep = [{ id: "gpt-4o" }];
    const reverseMap = new Map([["gpt-4o", "openai"]]);
    const result = resolveProviderModels(mustKeep, reverseMap);
    expect(result.get("openai")?.has("gpt-4o")).toBe(true);
  });
});
