import { threadRecency } from "@/components/SidebarThreadRow";

export type ThreadStamp = {
  threadId: string;
  updatedAt?: number;
  createdAt?: number;
  archivedAt?: number;
  routineRunId?: string;
};

/** The ongoing chat: newest live thread. Archived rows and routine runs are
 * history, not the conversation a contact opens. Equal stamps keep the
 * thread already on screen so a click does not swap identical rows. */
export function mostRecentThreadId(tasks: readonly ThreadStamp[] | undefined, currentId: string): string {
  let bestId = currentId;
  let bestAt = -1;
  let found = false;
  for (const task of tasks ?? []) {
    if (task.routineRunId || task.archivedAt !== undefined) continue;
    const at = threadRecency(task);
    const preferCurrent = at === bestAt && task.threadId === currentId;
    if (!found || at > bestAt || preferCurrent) {
      found = true;
      bestAt = at;
      bestId = task.threadId;
    }
  }
  return bestId;
}

export type OpenBotTarget =
  | { type: "select"; id: string }
  | { type: "switchTask"; botId: string; threadId: string };

export type OpenRoomTarget =
  | { type: "select"; id: string }
  | { type: "switchGroupTask"; groupId: string; threadId: string };

export function openBotTarget(
  botId: string,
  tasks: readonly ThreadStamp[] | undefined,
  currentThreadId: string,
  simpleMode: boolean,
): OpenBotTarget {
  if (!simpleMode) return { type: "select", id: botId };
  const latest = mostRecentThreadId(tasks, currentThreadId);
  if (latest !== currentThreadId) return { type: "switchTask", botId, threadId: latest };
  return { type: "select", id: botId };
}

export function openRoomTarget(
  groupId: string,
  tasks: readonly ThreadStamp[] | undefined,
  currentThreadId: string,
  simpleMode: boolean,
): OpenRoomTarget {
  if (!simpleMode) return { type: "select", id: groupId };
  const latest = mostRecentThreadId(tasks, currentThreadId);
  if (latest !== currentThreadId) return { type: "switchGroupTask", groupId, threadId: latest };
  return { type: "select", id: groupId };
}
