// Mirror of server/data-dir.ts for the Electron main process (which cannot
// import the server's TypeScript). Keep the two in sync.
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR_NAME = ".jlfbot";
export const LEGACY_DATA_DIR_NAME = ".openmausbot";

/** ~/.jlfbot, or a pre-existing ~/.openmausbot from the upstream app when
 * ~/.jlfbot does not exist yet (used in place, never moved). */
export function defaultDataDir(home, exists = fs.existsSync) {
  const current = path.join(home, DATA_DIR_NAME);
  if (exists(current)) return current;
  const legacy = path.join(home, LEGACY_DATA_DIR_NAME);
  return exists(legacy) ? legacy : current;
}
