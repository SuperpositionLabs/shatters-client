import { createSignal, createRoot } from "solid-js";
import type { Contact, HistoryMessage } from "./api";

export type ToastKind = "error" | "info" | "success";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  ttlMs: number;
}

let toastSeq = 0;

function createAppStore() {
  const [connected, setConnected] = createSignal(false);
  const [address, setAddress] = createSignal("");
  const [username, setUsername] = createSignal("");
  const [contacts, setContacts] = createSignal<Contact[]>([]);
  const [activeContact, setActiveContact] = createSignal<string | null>(null);
  const [messages, setMessages] = createSignal<HistoryMessage[]>([]);
  const [view, setView] = createSignal<"login" | "chat" | "contacts" | "settings">("login");
  const [toasts, setToasts] = createSignal<Toast[]>([]);

  // unread counts keyed by contact address (does not include the active chat)
  const [unread, setUnread] = createSignal<Record<string, number>>({});

  const dismissToast = (id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  };

  // Visible-toast cap. A rapid burst of failures (e.g. a relay outage hitting
  // every in-flight command) would otherwise stack dozens of toasts that
  // bury the UI; we drop the oldest of the same kind once over the cap.
  const MAX_TOASTS_PER_KIND = 5;

  const pushToast = (message: string, kind: ToastKind = "error", ttlMs = 5000) => {
    const id = ++toastSeq;
    setToasts((cur) => {
      const next = [...cur, { id, kind, message, ttlMs }];
      const sameKind = next.filter((t) => t.kind === kind);
      if (sameKind.length <= MAX_TOASTS_PER_KIND) return next;
      const overflow = sameKind.length - MAX_TOASTS_PER_KIND;
      const toDrop = new Set(sameKind.slice(0, overflow).map((t) => t.id));
      return next.filter((t) => !toDrop.has(t.id));
    });
    if (ttlMs > 0) {
      setTimeout(() => dismissToast(id), ttlMs);
    }
    return id;
  };

  // Backward-compat: setError(string) pushes an error toast; setError(null) clears all.
  const setError = (msg: string | null) => {
    if (msg === null) {
      setToasts([]);
      return;
    }
    pushToast(msg, "error");
  };
  const error = () => {
    const errs = toasts().filter((t) => t.kind === "error");
    return errs.length ? errs[errs.length - 1].message : null;
  };

  const incrementUnread = (addr: string) => {
    setUnread((cur) => ({ ...cur, [addr]: (cur[addr] ?? 0) + 1 }));
  };

  const clearUnread = (addr: string) => {
    setUnread((cur) => {
      if (!cur[addr]) return cur;
      const next = { ...cur };
      delete next[addr];
      return next;
    });
  };

  return {
    connected,
    setConnected,
    address,
    setAddress,
    username,
    setUsername,
    contacts,
    setContacts,
    activeContact,
    setActiveContact,
    messages,
    setMessages,
    error,
    setError,
    view,
    setView,
    toasts,
    pushToast,
    dismissToast,
    unread,
    incrementUnread,
    clearUnread,
  };
}

export const store = createRoot(createAppStore);
