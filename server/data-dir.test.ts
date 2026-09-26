import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { defaultDataDir } from "./data-dir.ts";

const homes: string[] = [];
const home = () => { const dir = mkdtempSync(join(tmpdir(), "jlfbot-home-")); homes.push(dir); return dir; };
afterEach(() => { for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("defaultDataDir", () => {
  it("uses ~/.jlfbot on a fresh machine", () => {
    const h = home();
    expect(defaultDataDir(h)).toBe(join(h, ".jlfbot"));
  });

  it("keeps using an existing ~/.openmausbot when there is no ~/.jlfbot yet", () => {
    const h = home();
    mkdirSync(join(h, ".openmausbot"));
    expect(defaultDataDir(h)).toBe(join(h, ".openmausbot"));
  });

  it("prefers ~/.jlfbot once it exists", () => {
    const h = home();
    mkdirSync(join(h, ".openmausbot"));
    mkdirSync(join(h, ".jlfbot"));
    expect(defaultDataDir(h)).toBe(join(h, ".jlfbot"));
  });
});
