import { describe, expect, it } from "vitest";
import { visibleBotSettingsSections } from "./sections";

const ids = (options: { simpleMode: boolean; slack: boolean; visibility: boolean }) =>
  visibleBotSettingsSections(options).map((entry) => entry.id);

describe("bot settings rail", () => {
  it("keeps the existing sections when simple mode is off", () => {
    expect(ids({ simpleMode: false, slack: false, visibility: false })).not.toContain("conversations");
    expect(ids({ simpleMode: false, slack: true, visibility: true })).toEqual([
      "overview", "identity", "slack", "soul", "skills", "memory", "routines", "access", "model", "permissions", "voice", "visibility", "history", "usage",
    ]);
  });

  it("adds Conversations only in simple mode, still ahead of profile history", () => {
    const rail = ids({ simpleMode: true, slack: false, visibility: false });
    expect(rail).toContain("conversations");
    expect(rail.indexOf("conversations")).toBeLessThan(rail.indexOf("history"));
    expect(rail).not.toContain("slack");
    expect(rail).not.toContain("visibility");
  });
});
