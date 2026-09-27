import { describe, expect, it } from "vitest";
import { mostRecentThreadId, openBotTarget, openRoomTarget, type ThreadStamp } from "./simple-mode-open";

const tasks: ThreadStamp[] = [
  { threadId: "older", createdAt: 10, updatedAt: 10 },
  { threadId: "latest", createdAt: 20, updatedAt: 50 },
  { threadId: "archived", createdAt: 80, updatedAt: 90, archivedAt: 90 },
  { threadId: "routine", createdAt: 100, updatedAt: 100, routineRunId: "run-1" },
  { threadId: "current", createdAt: 30, updatedAt: 40 },
];

describe("most recent conversation", () => {
  it("picks the newest live thread and skips archives and routine runs", () => {
    expect(mostRecentThreadId(tasks, "current")).toBe("latest");
  });

  it("keeps the current thread when stamps tie", () => {
    const tied = [
      { threadId: "a", createdAt: 5, updatedAt: 5 },
      { threadId: "current", createdAt: 1, updatedAt: 5 },
    ];
    expect(mostRecentThreadId(tied, "current")).toBe("current");
  });

  it("falls back to the open thread when every other row is archived or a routine", () => {
    expect(mostRecentThreadId([
      { threadId: "archived", createdAt: 9, archivedAt: 9 },
      { threadId: "routine", createdAt: 8, routineRunId: "run" },
    ], "current")).toBe("current");
  });

  it("uses createdAt when a thread has never been updated", () => {
    expect(mostRecentThreadId([
      { threadId: "old", createdAt: 1 },
      { threadId: "new", createdAt: 4 },
    ], "old")).toBe("new");
  });
});

describe("opening a contact", () => {
  it("leaves the existing selection alone when simple mode is off", () => {
    expect(openBotTarget("atlas", tasks, "current", false)).toEqual({ type: "select", id: "atlas" });
    expect(openRoomTarget("planning", tasks, "current", false)).toEqual({ type: "select", id: "planning" });
  });

  it("switches to the latest conversation when simple mode is on", () => {
    expect(openBotTarget("atlas", tasks, "current", true)).toEqual({
      type: "switchTask", botId: "atlas", threadId: "latest",
    });
    expect(openRoomTarget("planning", tasks, "current", true)).toEqual({
      type: "switchGroupTask", groupId: "planning", threadId: "latest",
    });
  });

  it("selects in place when the latest conversation is already open", () => {
    expect(openBotTarget("atlas", tasks, "latest", true)).toEqual({ type: "select", id: "atlas" });
    expect(openRoomTarget("planning", tasks, "latest", true)).toEqual({ type: "select", id: "planning" });
  });
});
