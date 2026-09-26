// JLFBot ships no analytics client. These tests pin that the shim stays inert:
// nothing can switch it on and no call reaches the network.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import { analyticsEnabled, identifyEmail, initAnalytics, setAnalyticsEnabled, track } from "./analytics";

afterEach(() => vi.unstubAllGlobals());

describe("analytics shim", () => {
  it("is off and cannot be switched on", () => {
    expect(analyticsEnabled()).toBe(false);
    setAnalyticsEnabled(true);
    expect(analyticsEnabled()).toBe(false);
  });

  it("never touches the network", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    initAnalytics();
    track("app_opened", { platform: "desktop" });
    identifyEmail("someone@example.com");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not bundle a third-party analytics SDK", () => {
    const source = readFileSync(new URL("./analytics.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["']posthog-js["']/);
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(pkg.dependencies?.["posthog-js"]).toBeUndefined();
  });
});
