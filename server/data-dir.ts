// Where JLFBot keeps its data when JLFBOT_DATA_DIR is not set.
//
// JLFBot is a fork of OpenMausBot, which used ~/.openmausbot. An install that
// already has that folder (and no ~/.jlfbot yet) keeps using it in place:
// bots, threads and credentials stay put and absolute paths recorded inside
// the data (attachments, working folders) keep resolving. Moving it is a
// manual, one-time step: quit JLFBot, `mv ~/.openmausbot ~/.jlfbot`.
import { existsSync } from "node:fs";
import { join } from "node:path";

export const DATA_DIR_NAME = ".jlfbot";
export const LEGACY_DATA_DIR_NAME = ".openmausbot";

export function defaultDataDir(home: string, exists: (path: string) => boolean = existsSync): string {
  const current = join(home, DATA_DIR_NAME);
  if (exists(current)) return current;
  const legacy = join(home, LEGACY_DATA_DIR_NAME);
  return exists(legacy) ? legacy : current;
}
