import { describe, it, expect, vi } from "vitest";

describe("Session model isolation", () => {
  function createMockCoordinator(entries = {}) {
    const sessions = new Map(Object.entries(entries));
    let currentPath = Object.keys(entries)[0] || null;
    return {
      _sessions: sessions,
      get currentSessionPath() { return currentPath; },
      set currentSessionPath(p) { currentPath = p; },
      updateCurrentSessionModelId(modelId) {
        if (!currentPath) return;
        const entry = sessions.get(currentPath);
        if (entry) entry.modelId = modelId;
      },
      getCurrentSessionModelId() {
        if (!currentPath) return null;
        return sessions.get(currentPath)?.modelId || null;
      },
    };
  }

  it("createSession stores modelId in SessionEntry", () => {
    const coord = createMockCoordinator({
      "/path/session-a": { modelId: "gpt-4o", session: {}, agentId: "hana" },
    });
    expect(coord.getCurrentSessionModelId()).toBe("gpt-4o");
  });

  it("updateCurrentSessionModelId changes the active session's modelId only", () => {
    const coord = createMockCoordinator({
      "/path/session-a": { modelId: "gpt-4o", session: {}, agentId: "hana" },
      "/path/session-b": { modelId: "claude-3-5-sonnet", session: {}, agentId: "hana" },
    });
    coord.currentSessionPath = "/path/session-a";
    coord.updateCurrentSessionModelId("qwen-72b");

    expect(coord._sessions.get("/path/session-a").modelId).toBe("qwen-72b");
    expect(coord._sessions.get("/path/session-b").modelId).toBe("claude-3-5-sonnet");
  });

  it("switching session path changes getCurrentSessionModelId", () => {
    const coord = createMockCoordinator({
      "/path/session-a": { modelId: "gpt-4o", session: {}, agentId: "hana" },
      "/path/session-b": { modelId: "claude-3-5-sonnet", session: {}, agentId: "hana" },
    });
    coord.currentSessionPath = "/path/session-a";
    expect(coord.getCurrentSessionModelId()).toBe("gpt-4o");

    coord.currentSessionPath = "/path/session-b";
    expect(coord.getCurrentSessionModelId()).toBe("claude-3-5-sonnet");
  });

  it("updateCurrentSessionModelId is no-op when no active session", () => {
    const coord = createMockCoordinator({});
    coord.updateCurrentSessionModelId("gpt-4o");
    expect(coord.getCurrentSessionModelId()).toBeNull();
  });
});
