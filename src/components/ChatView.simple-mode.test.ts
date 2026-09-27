import { Children, createElement, isValidElement, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot } from "@/state/store";

const fixture = vi.hoisted(() => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  return { dispatch: vi.fn(), simpleMode: false };
});
vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return { ...original, useStore: () => ({ state: original.initialState, dispatch: fixture.dispatch }) };
});
vi.mock("./DesktopCapabilities", async (importOriginal) => ({
  ...await importOriginal<typeof import("./DesktopCapabilities")>(),
  useDesktopCapabilities: () => ({ capabilities: { dictation: { available: false }, host: { packaged: true } }, ready: true }),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/simple-mode", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/simple-mode")>();
  return { ...original, useSimpleMode: () => fixture.simpleMode };
});

const { ChatView } = await import("./ChatView");
afterAll(() => vi.unstubAllGlobals());

const bot: Bot = {
  id: "pepper", threadId: "older", name: "Pepper", title: "", description: "", color: "green",
  notifications: true, unread: false, busy: false, messages: [],
  modelSelection: { instanceId: "test", model: "test" },
  tasks: [
    { threadId: "older", title: "Older chat", createdAt: 1 },
    { threadId: "latest", title: "Latest chat", createdAt: 2, updatedAt: 9 },
  ],
};

type ElementProps = { children?: ReactNode; onClick?: (event: MouseEvent) => void; [key: string]: unknown };
function findElement(tree: ReactNode, attribute: string, value: string): ReactElement<ElementProps> | undefined {
  for (const child of Children.toArray(tree)) {
    if (!isValidElement<ElementProps>(child)) continue;
    if (child.props[attribute] === value) return child;
    const found = findElement(child.props.children, attribute, value);
    if (found) return found;
  }
}

beforeEach(() => {
  fixture.simpleMode = false;
  fixture.dispatch.mockClear();
});

describe("simple mode chat header", () => {
  it("keeps the thread picker when simple mode is off", () => {
    const markup = renderToStaticMarkup(createElement(ChatView, { bot }));
    expect(markup).toContain('aria-label="All threads"');
    expect(markup).not.toContain('aria-label="Earlier conversations with Pepper"');
  });

  it("replaces the thread picker with a history entry into bot settings", () => {
    fixture.simpleMode = true;
    let tree: ReactNode;
    function Capture() { tree = ChatView({ bot }); return tree; }
    const markup = renderToStaticMarkup(createElement(Capture));
    expect(markup).not.toContain('aria-label="All threads"');
    expect(markup).not.toContain("New thread");
    expect(markup).toContain('aria-label="Earlier conversations with Pepper"');
    findElement(tree, "aria-label", "Earlier conversations with Pepper")!.props.onClick!({} as MouseEvent);
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "toggleSettings", open: true, section: "conversations" });
  });
});
