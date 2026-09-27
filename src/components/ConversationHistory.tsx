// Earlier conversations, without the thread manager. Simple mode keeps one
// chat on screen; this list is how a person opens an older one. It never
// creates or deletes a thread.
import { X } from "lucide-react";
import { t } from "@/lib/i18n";
import type { ThreadCloser, ThreadOpener } from "@/state/store";
import { formatUpdatedAt, threadByline, threadRecency } from "./SidebarThreadRow";

export type HistoryThread = {
  threadId: string;
  title: string;
  updatedAt?: number;
  createdAt?: number;
  archivedAt?: number;
  routineRunId?: string;
  openedBy?: ThreadOpener;
  closedBy?: ThreadCloser;
};

/** Newest first. Routine runs stay on their receipts, not in this list. */
export function conversationHistoryThreads<T extends HistoryThread>(
  tasks: readonly T[] | undefined,
  fallback: T,
): T[] {
  const source = tasks?.filter((task) => !task.routineRunId) ?? [];
  const rows = source.length > 0 ? source : [fallback];
  return rows
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const recency = threadRecency(b.task) - threadRecency(a.task);
      if (recency) return recency;
      return a.index - b.index;
    })
    .map((entry) => entry.task);
}

export function ConversationHistoryList({
  threads,
  currentId,
  onOpen,
}: {
  threads: readonly HistoryThread[];
  currentId: string;
  onOpen: (threadId: string) => void;
}) {
  if (threads.length === 0) {
    return <p className="px-3 py-2 text-[13px] text-ink-secondary">{t("botSettings.conversations.only")}</p>;
  }
  return (
    <div className="flex flex-col" role="list">
      {threads.map((thread) => {
        const current = thread.threadId === currentId;
        const when = formatUpdatedAt(threadRecency(thread));
        const byline = threadByline(thread);
        const detail = [when, byline].filter(Boolean).join(" · ");
        const body = (
          <>
            <span className="block truncate text-[13px] text-ink">{thread.title}</span>
            <span className="block truncate text-[11px] text-ink-secondary">
              {current ? t("botSettings.conversations.current") : detail}
            </span>
          </>
        );
        if (current) {
          return (
            <div
              key={thread.threadId}
              role="listitem"
              aria-current="true"
              data-conversation-thread={thread.threadId}
              className="rounded-lg px-3 py-2"
            >
              {body}
            </div>
          );
        }
        return (
          <button
            key={thread.threadId}
            type="button"
            role="listitem"
            data-conversation-thread={thread.threadId}
            aria-label={t("botSettings.conversations.openAria", { title: thread.title })}
            onClick={() => onOpen(thread.threadId)}
            className="rounded-lg px-3 py-2 text-left hover:bg-raised/70"
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

/** Rooms have no settings accordion. This dialog is their history entry:
 * closed until asked, and it does not sit in the chat as a thread list. */
export function ConversationHistoryDialog({
  name,
  threads,
  currentId,
  onOpen,
  onClose,
}: {
  name: string;
  threads: readonly HistoryThread[];
  currentId: string;
  onOpen: (threadId: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 px-4 pt-24"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label={t("chat.historyAria", { name })}
        className="w-full max-w-[360px] rounded-2xl border border-hairline/50 bg-card p-3 shadow-2xl"
      >
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <span className="text-[14px] font-medium text-ink">{t("chat.history")}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-md p-1 text-ink-secondary hover:bg-raised hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <p className="mb-2 px-3 text-[12px] leading-relaxed text-ink-secondary">{t("botSettings.conversations.subtitle")}</p>
        <ConversationHistoryList
          threads={threads}
          currentId={currentId}
          onOpen={(threadId) => {
            onOpen(threadId);
            onClose();
          }}
        />
      </div>
    </div>
  );
}

export function ConversationsSection({
  tasks,
  currentId,
  fallbackTitle,
  onOpen,
}: {
  tasks: readonly HistoryThread[] | undefined;
  currentId: string;
  fallbackTitle: string;
  onOpen: (threadId: string) => void;
}) {
  const threads = conversationHistoryThreads(tasks, {
    threadId: currentId,
    title: fallbackTitle,
    createdAt: 0,
  });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] leading-relaxed text-ink-secondary">{t("botSettings.conversations.subtitle")}</p>
      {threads.length <= 1 && (
        <p className="text-[13px] text-ink-secondary">{t("botSettings.conversations.only")}</p>
      )}
      <ConversationHistoryList threads={threads} currentId={currentId} onOpen={onOpen} />
    </div>
  );
}
