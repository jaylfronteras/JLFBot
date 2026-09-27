import { useSyncExternalStore } from "react";

export const SIMPLE_MODE_KEY = "jlfbot-simple-mode";

// Renderer preference only. Conversations, engines, and server configuration
// stay where they are. Default off so the existing thread UI is unchanged
// until someone opts in. A session choice survives a storage rejection; a
// storage event from another window can supersede it.
let sessionChoice: boolean | undefined;
const listeners = new Set<() => void>();

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function simpleMode(): boolean {
  if (sessionChoice !== undefined) return sessionChoice;
  try {
    return storage()?.getItem(SIMPLE_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== SIMPLE_MODE_KEY && event.key !== null) return;
  if (event.storageArea && event.storageArea !== storage()) return;
  sessionChoice = undefined;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function setSimpleMode(enabled: boolean): void {
  sessionChoice = enabled;
  try {
    storage()?.setItem(SIMPLE_MODE_KEY, enabled ? "1" : "0");
  } catch {
    // The visible setting still changes for this session when storage is full.
  }
  notify();
}

export function useSimpleMode(): boolean {
  // Server and static renders stay off. The stored choice is a browser
  // preference and must not flip markup before hydration.
  return useSyncExternalStore(subscribe, simpleMode, () => false);
}

/** Thread rows, new-thread buttons, and folder controls. Simple mode hides
 * them even when the separate "show threads" preference is still on. */
export function threadListsVisible(showThreads: boolean, simpleMode: boolean): boolean {
  return showThreads && !simpleMode;
}
