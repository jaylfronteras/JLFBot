import { Children, createElement, isValidElement, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ConversationHistoryDialog,
  ConversationHistoryList,
  ConversationsSection,
  conversationHistoryThreads,
  type HistoryThread,
} from "./ConversationHistory";

const threads: HistoryThread[] = [
  { threadId: "older", title: "Older notes", createdAt: 10, updatedAt: 10 },
  { threadId: "latest", title: "Latest chat", createdAt: 20, updatedAt: 50 },
  { threadId: "archived", title: "Put away", createdAt: 80, updatedAt: 90, archivedAt: 90 },
  { threadId: "routine", title: "Nightly run", createdAt: 100, updatedAt: 100, routineRunId: "run-1" },
];

type ElementProps = { children?: ReactNode; onClick?: (event: MouseEvent) => void; [key: string]: unknown };
function findElement(tree: ReactNode, attribute: string, value: string): ReactElement<ElementProps> | undefined {
  for (const child of Children.toArray(tree)) {
    if (!isValidElement<ElementProps>(child)) continue;
    if (child.props[attribute] === value) return child;
    const found = findElement(child.props.children, attribute, value);
    if (found) return found;
  }
}

describe("conversation history", () => {
  it("orders live and archived chats newest first and omits routine runs", () => {
    expect(conversationHistoryThreads(threads, { threadId: "fallback", title: "Fallback", createdAt: 0 }).map((thread) => thread.threadId))
      .toEqual(["archived", "latest", "older"]);
  });

  it("keeps a fallback row when a bot has no task list yet", () => {
    expect(conversationHistoryThreads(undefined, { threadId: "only", title: "Only chat", createdAt: 1 }).map((thread) => thread.title))
      .toEqual(["Only chat"]);
  });

  it("opens an older chat and does not offer create or delete", () => {
    const onOpen = vi.fn();
    let tree: ReactNode;
    function Capture() {
      tree = ConversationHistoryList({ threads: conversationHistoryThreads(threads, threads[0]!), currentId: "latest", onOpen });
      return tree;
    }
    const markup = renderToStaticMarkup(createElement(Capture));
    expect(markup).toContain('data-conversation-thread="latest"');
    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain("Latest chat");
    expect(markup).toContain("Older notes");
    expect(markup).toContain("Put away");
    expect(markup).not.toContain("Nightly run");
    expect(markup).not.toContain("New thread");
    expect(markup).not.toContain("Delete");
    findElement(tree, "data-conversation-thread", "older")!.props.onClick!({} as MouseEvent);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("older");
    expect(findElement(tree, "data-conversation-thread", "latest")!.type).not.toBe("button");
  });

  it("closes the room dialog after a choice and on the backdrop", () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    let tree: ReactNode;
    function Capture() {
      tree = ConversationHistoryDialog({
        name: "Planning",
        threads: conversationHistoryThreads(threads, threads[0]!),
        currentId: "latest",
        onOpen,
        onClose,
      });
      return tree;
    }
    const markup = renderToStaticMarkup(createElement(Capture));
    expect(markup).toContain('aria-label="Earlier conversations with Planning"');
    expect(markup).toContain("Older notes");
    expect(markup).not.toContain("New thread");
    expect(markup).not.toContain("Nightly run");
    const list = findElement(tree, "currentId", "latest")!;
    (list.props.onOpen as (threadId: string) => void)("older");
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("older");
    expect(onClose).toHaveBeenCalledOnce();
    const backdrop = tree as ReactElement<ElementProps>;
    (backdrop.props.onMouseDown as (event: MouseEvent) => void)({ target: backdrop, currentTarget: backdrop } as unknown as MouseEvent);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("tells a bot with one chat that nothing else is filed away", () => {
    const markup = renderToStaticMarkup(createElement(ConversationsSection, {
      tasks: [{ threadId: "only", title: "Only chat", createdAt: 1 }],
      currentId: "only",
      fallbackTitle: "Only chat",
      onOpen: vi.fn(),
    }));
    expect(markup).toContain("This is the only conversation.");
    expect(markup).toContain("Opening one does not delete the others.");
    expect(markup).not.toContain("<button");
  });
});
