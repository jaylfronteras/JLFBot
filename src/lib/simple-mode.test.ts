import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hook = vi.hoisted(() => ({
  subscribe: undefined as undefined | ((listener: () => void) => () => void),
  snapshot: undefined as undefined | (() => boolean),
  serverSnapshot: undefined as undefined | (() => boolean),
}));

vi.mock("react", () => ({
  useSyncExternalStore: (
    subscribe: (listener: () => void) => () => void,
    snapshot: () => boolean,
    serverSnapshot: () => boolean,
  ) => {
    Object.assign(hook, { subscribe, snapshot, serverSnapshot });
    return snapshot();
  },
}));

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
}

let local: ReturnType<typeof memoryStorage>;
let browser: EventTarget;

function storageEvent(key: string | null, storageArea: unknown = local) {
  browser.dispatchEvent(Object.assign(new Event("storage"), { key, storageArea }));
}

beforeEach(() => {
  vi.resetModules();
  local = memoryStorage();
  browser = new EventTarget();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("window", browser);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("simple mode preference", () => {
  it("defaults off and ignores malformed values without writing anything", async () => {
    const preference = await import("./simple-mode");
    expect(preference.useSimpleMode()).toBe(false);
    expect(hook.serverSnapshot!()).toBe(false);
    for (const value of ["", "false", "broken", "0", "true"]) {
      local.setItem(preference.SIMPLE_MODE_KEY, value);
      expect(preference.useSimpleMode()).toBe(false);
    }
    local.setItem.mockClear();
    preference.useSimpleMode();
    expect(local.setItem).not.toHaveBeenCalled();
  });

  it("persists both choices through a renderer reload", async () => {
    let preference = await import("./simple-mode");
    preference.setSimpleMode(true);
    expect(local.getItem(preference.SIMPLE_MODE_KEY)).toBe("1");
    expect(preference.useSimpleMode()).toBe(true);

    vi.resetModules();
    preference = await import("./simple-mode");
    expect(preference.useSimpleMode()).toBe(true);
    preference.setSimpleMode(false);
    expect(local.getItem(preference.SIMPLE_MODE_KEY)).toBe("0");
    vi.resetModules();
    preference = await import("./simple-mode");
    expect(preference.useSimpleMode()).toBe(false);
  });

  it("notifies mounted consumers immediately and unsubscribes cleanly", async () => {
    const preference = await import("./simple-mode");
    preference.useSimpleMode();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = hook.subscribe!(first);
    const unsubscribeSecond = hook.subscribe!(second);
    preference.setSimpleMode(true);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(hook.snapshot!()).toBe(true);

    unsubscribeFirst();
    preference.setSimpleMode(false);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledTimes(2);
    unsubscribeSecond();
    preference.setSimpleMode(true);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("follows cross-window changes and clear, ignoring other storage", async () => {
    const preference = await import("./simple-mode");
    preference.useSimpleMode();
    const listener = vi.fn();
    const unsubscribe = hook.subscribe!(listener);
    local.setItem(preference.SIMPLE_MODE_KEY, "1");
    storageEvent(preference.SIMPLE_MODE_KEY);
    expect(listener).toHaveBeenCalledOnce();
    expect(hook.snapshot!()).toBe(true);

    storageEvent("other-key");
    storageEvent(preference.SIMPLE_MODE_KEY, memoryStorage());
    expect(listener).toHaveBeenCalledOnce();

    local.clear();
    storageEvent(null);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(hook.snapshot!()).toBe(false);
    unsubscribe();
    storageEvent(null);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it.each(["getter", "read", "write", "missing"])("keeps the choice usable when storage fails at %s", async (failure) => {
    if (failure === "getter") {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    } else if (failure === "missing") {
      vi.stubGlobal("localStorage", undefined);
    } else {
      if (failure === "write") local.setItem.mockImplementation(() => { throw new Error("blocked"); });
      if (failure === "read") local.getItem.mockImplementation(() => { throw new Error("blocked"); });
    }
    const preference = await import("./simple-mode");
    expect(preference.useSimpleMode()).toBe(false);
    preference.setSimpleMode(true);
    expect(preference.useSimpleMode()).toBe(true);
    preference.setSimpleMode(false);
    expect(preference.useSimpleMode()).toBe(false);
  });

  it("hides thread lists only while simple mode is on", async () => {
    const { threadListsVisible } = await import("./simple-mode");
    expect(threadListsVisible(true, false)).toBe(true);
    expect(threadListsVisible(false, false)).toBe(false);
    expect(threadListsVisible(true, true)).toBe(false);
    expect(threadListsVisible(false, true)).toBe(false);
  });
});
