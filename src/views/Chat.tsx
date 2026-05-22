import { Component, For, Show, createSignal, createEffect, onMount, onCleanup, createMemo } from "solid-js";
import { store } from "../store";
import { api, BackendError, type HistoryMessage } from "../api";
import Sidebar from "../components/Sidebar";
import "./chat.css";

interface MessageRow {
  msg: HistoryMessage;
  showHeader: boolean;
  dateSeparator: string | null;
}

// Merge fetched list with previous, preserving reference identity for
// unchanged messages so SolidJS <For> only patches new/changed rows
// instead of rebuilding the whole list on every refresh.
const mergeMessages = (
  prev: HistoryMessage[],
  next: HistoryMessage[],
): HistoryMessage[] => {
  if (prev.length === 0) return next;
  const byId = new Map<number, HistoryMessage>();
  for (const m of prev) byId.set(m.id, m);
  let changed = prev.length !== next.length;
  const merged = next.map((m) => {
    const existing = byId.get(m.id);
    if (existing && existing.timestamp_ms === m.timestamp_ms) return existing;
    changed = true;
    return m;
  });
  return changed ? merged : prev;
};

const Chat: Component = () => {
  const [input, setInput] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [renamingHeader, setRenamingHeader] = createSignal(false);
  const [headerRenameValue, setHeaderRenameValue] = createSignal("");
  // Escape sets this so the subsequent blur (e.g. when focus moves away)
  // doesn't commit the rename with whatever was typed.
  let headerRenameCancelled = false;
  let messagesEnd: HTMLDivElement | undefined;
  let messagesContainer: HTMLDivElement | undefined;

  const isNearBottom = () => {
    const el = messagesContainer;
    if (!el) return true;
    // Within 80px of the bottom counts as "following".
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const scrollToBottom = (smooth = true) => {
    messagesEnd?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  };

  // Auto-scroll only when the user is already at/near the bottom, and only
  // when the *last* message id changes (so a re-render with the same tail
  // doesn't yank the viewport).
  let lastSeenTailId: number | null = null;
  createEffect(() => {
    const list = store.messages();
    const tail = list.length ? list[list.length - 1].id : null;
    if (tail === lastSeenTailId) return;
    const initial = lastSeenTailId === null;
    const wasFollowing = initial || isNearBottom();
    lastSeenTailId = tail;
    if (wasFollowing) {
      // initial load = jump, subsequent = smooth
      queueMicrotask(() => scrollToBottom(!initial));
    }
  });

  // Load messages when active contact changes; also clear unread for it.
  createEffect(async () => {
    const contact = store.activeContact();
    if (!contact) {
      store.setMessages([]);
      lastSeenTailId = null;
      return;
    }
    store.clearUnread(contact);
    lastSeenTailId = null;
    try {
      const msgs = await api.messageHistory(contact, 200);
      // Bail if the user switched contacts while history was loading;
      // otherwise A's history can overwrite B's after a fast switch.
      if (store.activeContact() !== contact) return;
      store.setMessages(msgs);
    } catch (e) {
      if (store.activeContact() !== contact) return;
      store.pushToast(String(e));
    }
  });

  // Backstop poll (rare; the event listener already handles real-time updates).
  // After several consecutive failures we surface a single warning so the user
  // notices when the relay connection has silently dropped instead of believing
  // their chat is just quiet.
  createEffect(() => {
    const contact = store.activeContact();
    if (!contact) return;
    let consecutiveFailures = 0;
    let warned = false;
    const timer = setInterval(async () => {
      try {
        const msgs = await api.messageHistory(contact, 200);
        consecutiveFailures = 0;
        if (warned) {
          store.pushToast("Reconnected to relay.", "success", 2500);
          warned = false;
        }
        store.setMessages((prev) => mergeMessages(prev, msgs));
      } catch {
        consecutiveFailures++;
        if (consecutiveFailures >= 2 && !warned) {
          store.pushToast(
            "Lost connection to the relay. Reconnecting in the background…",
            "error",
            8000,
          );
          warned = true;
        }
      }
    }, 30000);
    onCleanup(() => clearInterval(timer));
  });

  // Notification helper (best effort).
  const notify = (title: string, body: string) => {
    try {
      if (typeof Notification === "undefined") return;
      if (Notification.permission === "granted") {
        new Notification(title, { body });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((p) => {
          if (p === "granted") new Notification(title, { body });
        });
      }
    } catch {
      /* ignore */
    }
  };

  // Subtle ping using Web Audio (no asset required).
  const playPing = () => {
    try {
      const Ctx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.18);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.25);
      setTimeout(() => ctx.close().catch(() => {}), 400);
    } catch {
      /* ignore */
    }
  };

  // Listen for real-time incoming message events from the backend
  onMount(async () => {
    // Ask permission early so first incoming message can show a notification.
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    } catch {
      /* ignore */
    }

    const { listen } = await import("@tauri-apps/api/event");

    let unlisten: (() => void) | null = null;
    let cancelled = false;

    const listenPromise = listen<{ from?: string }>(
      "shatters://message",
      async (e) => {
        const fromAddr = (e.payload && e.payload.from) || null;
        const active = store.activeContact();
        const focused = (window as any).__shattersFocused?.() ?? true;

        // Refresh contacts (auto-add may have happened)
        try {
          const contacts = await api.listContacts();
          store.setContacts(contacts);
        } catch {
          /* ignore */
        }

        // Refresh active chat history only when the event is for the
        // active contact (or the relay didn't tell us who it's from).
        // Avoids rebuilding the message list when chatting with A and a
        // message arrives from B.
        if (active && (!fromAddr || fromAddr === active)) {
          try {
            const msgs = await api.messageHistory(active, 200);
            store.setMessages((prev) => mergeMessages(prev, msgs));
          } catch {
            /* ignore */
          }
        }

        // Decide if we should notify / mark unread.
        const isForActive = fromAddr && fromAddr === active;
        const shouldNotify = !isForActive || !focused;

        if (shouldNotify) {
          if (fromAddr) store.incrementUnread(fromAddr);
          const c = fromAddr
            ? store.contacts().find((x) => x.address === fromAddr)
            : null;
          const who =
            c?.display_name ||
            (fromAddr ? fromAddr.slice(0, 12) + "…" : "Someone");
          notify(`New message from ${who}`, "Tap to open Shatters.");
          playPing();
        }
      },
    );

    listenPromise.then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;

      // Once the listener is registered, do a one-shot history refresh
      // to catch any message that arrived in the gap between mount and
      // listen() resolving. Without this, those messages would be lost
      // until the 30s backstop poll fires.
      const active = store.activeContact();
      if (active) {
        api
          .messageHistory(active, 200)
          .then((msgs) => {
            if (store.activeContact() === active) {
              store.setMessages((prev) => mergeMessages(prev, msgs));
            }
          })
          .catch(() => {
            /* ignore */
          });
      }
    });

    onCleanup(() => {
      cancelled = true;
      if (unlisten) unlisten();
    });
  });

  const handleSend = async () => {
    const contact = store.activeContact();
    const text = input().trim();
    if (!contact || !text || sending()) return;

    setSending(true);
    const encoded = new TextEncoder().encode(text);

    try {
      await api.sendMessage(contact, encoded);
    } catch (sendErr) {
      const isNoSession =
        sendErr instanceof BackendError && sendErr.kind === "no_session";

      if (!isNoSession) {
        store.pushToast("Could not send message: " + String(sendErr));
        setSending(false);
        return;
      }

      try {
        const bundleData = await api.fetchBundle(contact, 10);
        await api.startConversation(contact, bundleData, encoded);
      } catch (e) {
        store.pushToast("Could not start conversation: " + String(e));
        setSending(false);
        return;
      }
    }

    setInput("");
    setSending(false);

    try {
      const msgs = await api.messageHistory(contact, 200);
      store.setMessages((prev) => mergeMessages(prev, msgs));
    } catch {
      /* ignore */
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDateLabel = (ts: number) => {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
    if (sameDay(d, today)) return "Today";
    if (sameDay(d, yesterday)) return "Yesterday";
    return d.toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  };

  const decodeMessage = (msg: HistoryMessage): string => {
    try {
      return new TextDecoder().decode(new Uint8Array(msg.plaintext));
    } catch {
      return "[binary data]";
    }
  };

  const activeContactName = createMemo(() => {
    const a = store.activeContact();
    if (!a) return "";
    const c = store.contacts().find((x) => x.address === a);
    return c?.display_name || a.slice(0, 16) + "…";
  });

  const myDisplayName = () => store.username() || "You";

  // Indexed lookup keeps senderName O(1) even with many contacts.
  const contactsByAddress = createMemo(() => {
    const map = new Map<string, string>();
    for (const c of store.contacts()) map.set(c.address, c.display_name);
    return map;
  });

  const senderName = (m: HistoryMessage): string => {
    if (m.outgoing) return myDisplayName();
    const name = contactsByAddress().get(m.contact_address);
    return name || m.contact_address.slice(0, 12) + "…";
  };

  // Build rows: group consecutive messages from same sender within 5 min;
  // emit a date separator when day changes.
  const rows = createMemo<MessageRow[]>(() => {
    const list = store.messages();
    const out: MessageRow[] = [];
    const GROUP_MS = 5 * 60 * 1000;
    let lastSender: string | null = null;
    let lastTs = 0;
    let lastDayKey = "";
    for (const m of list) {
      const d = new Date(m.timestamp_ms);
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const senderKey = (m.outgoing ? "_me_" : m.contact_address) + ":" + senderName(m);
      const dateSeparator = dayKey !== lastDayKey ? formatDateLabel(m.timestamp_ms) : null;
      const showHeader =
        dateSeparator !== null ||
        senderKey !== lastSender ||
        m.timestamp_ms - lastTs > GROUP_MS;
      out.push({ msg: m, showHeader, dateSeparator });
      lastSender = senderKey;
      lastTs = m.timestamp_ms;
      lastDayKey = dayKey;
    }
    return out;
  });

  const startHeaderRename = () => {
    const a = store.activeContact();
    if (!a) return;
    const c = store.contacts().find((x) => x.address === a);
    if (!c) return;
    setHeaderRenameValue(c.display_name || "");
    headerRenameCancelled = false;
    setRenamingHeader(true);
  };

  const cancelHeaderRename = () => {
    headerRenameCancelled = true;
    setRenamingHeader(false);
  };

  const commitHeaderRename = async () => {
    if (headerRenameCancelled) {
      headerRenameCancelled = false;
      setRenamingHeader(false);
      return;
    }
    const a = store.activeContact();
    if (!a) {
      setRenamingHeader(false);
      return;
    }
    const c = store.contacts().find((x) => x.address === a);
    if (!c) {
      setRenamingHeader(false);
      return;
    }
    const next = headerRenameValue().trim();
    if (next === c.display_name) {
      setRenamingHeader(false);
      return;
    }
    try {
      await api.addContact(a, c.public_key, next);
      const list = await api.listContacts();
      store.setContacts(list);
      store.pushToast("Contact renamed", "success", 1800);
    } catch (e) {
      store.pushToast("Rename failed: " + String(e));
    } finally {
      setRenamingHeader(false);
    }
  };

  return (
    <div class="chat-layout">
      <Sidebar />

      <div class="chat-main">
        <Show
          when={store.activeContact()}
          fallback={
            <div class="chat-empty">
              <p class="chat-empty-title">No conversation selected</p>
              <p class="chat-empty-hint">
                Pick a contact in the sidebar to open a chat. New incoming
                messages will appear there automatically.
              </p>
            </div>
          }
        >
          {/* Header */}
          <div class="chat-header">
            <div class="chat-header-info">
              <div class="chat-header-avatar">
                {(activeContactName() || "?").slice(0, 2).toUpperCase()}
              </div>
              <div class="chat-header-text">
                <Show
                  when={renamingHeader()}
                  fallback={
                    <button
                      type="button"
                      class="chat-header-name-btn"
                      title="Click to rename"
                      onClick={startHeaderRename}
                    >
                      <span class="chat-header-name truncate">
                        {activeContactName()}
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        class="chat-header-edit-icon"
                        aria-hidden="true"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                      </svg>
                    </button>
                  }
                >
                  <input
                    class="chat-header-rename"
                    autofocus
                    value={headerRenameValue()}
                    onInput={(e) => setHeaderRenameValue(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitHeaderRename();
                      else if (e.key === "Escape") cancelHeaderRename();
                    }}
                    onBlur={commitHeaderRename}
                    placeholder="display name"
                  />
                </Show>
                <div class="chat-header-address truncate">
                  {store.activeContact()}
                </div>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div class="chat-messages" ref={messagesContainer}>
            <For each={rows()}>
              {(row) => (
                <>
                  <Show when={row.dateSeparator}>
                    <div class="chat-date-sep">
                      <span>{row.dateSeparator}</span>
                    </div>
                  </Show>
                  <div
                    class={`chat-row ${row.showHeader ? "with-header" : "grouped"} ${
                      row.msg.outgoing ? "outgoing" : "incoming"
                    }`}
                  >
                    <div class="chat-row-gutter">
                      <Show
                        when={row.showHeader}
                        fallback={
                          <span class="chat-row-time-mini">
                            {formatTime(row.msg.timestamp_ms)}
                          </span>
                        }
                      >
                        <div class="chat-row-avatar">
                          {senderName(row.msg).slice(0, 2).toUpperCase()}
                        </div>
                      </Show>
                    </div>
                    <div class="chat-row-body">
                      <Show when={row.showHeader}>
                        <div class="chat-row-meta">
                          <span class="chat-row-name">{senderName(row.msg)}</span>
                          <span class="chat-row-time">
                            {formatTime(row.msg.timestamp_ms)}
                          </span>
                        </div>
                      </Show>
                      <div class="chat-row-text">{decodeMessage(row.msg)}</div>
                    </div>
                  </div>
                </>
              )}
            </For>
            <div ref={messagesEnd} />
          </div>

          {/* Input */}
          <div class="chat-input-bar">
            <input
              type="text"
              class="chat-input"
              value={input()}
              onInput={(e) => setInput(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${activeContactName()}…`}
            />
            <button
              type="button"
              class="btn btn-primary chat-send-btn"
              onClick={handleSend}
              disabled={!input().trim() || sending()}
            >
              {sending() ? "…" : "Send"}
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default Chat;
