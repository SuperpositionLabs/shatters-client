import { Component, For, Show, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import { store } from "../store";
import { api, type HistoryMessage } from "../api";
import Sidebar from "../components/Sidebar";
import "./chat.css";

const Chat: Component = () => {
  const [input, setInput] = createSignal("");
  const [sending, setSending] = createSignal(false);
  let messagesEnd: HTMLDivElement | undefined;

  const scrollToBottom = () => {
    messagesEnd?.scrollIntoView({ behavior: "smooth" });
  };

  // Scroll when messages change
  createEffect(() => {
    store.messages();
    scrollToBottom();
  });

  // Load messages when active contact changes
  createEffect(async () => {
    const contact = store.activeContact();
    if (!contact) {
      store.setMessages([]);
      return;
    }
    try {
      const msgs = await api.messageHistory(contact, 100);
      store.setMessages(msgs);
    } catch (e) {
      store.setError(String(e));
    }
  });

  // Poll for new messages every 3 seconds + listen for real-time events
  createEffect(() => {
    const contact = store.activeContact();
    if (!contact) return;

    const timer = setInterval(async () => {
      try {
        const msgs = await api.messageHistory(contact, 100);
        store.setMessages(msgs);
      } catch {
        /* ignore polling errors */
      }
    }, 3000);

    onCleanup(() => clearInterval(timer));
  });

  // Listen for real-time incoming message events from the backend
  onMount(async () => {
    const { listen } = await import("@tauri-apps/api/event");

    const unlisten = await listen("shatters://message", async () => {
      // Refresh the active chat
      const contact = store.activeContact();
      if (contact) {
        try {
          const msgs = await api.messageHistory(contact, 100);
          store.setMessages(msgs);
        } catch {
          /* ignore */
        }
      }
      // Refresh contacts (new contacts may have been auto-added)
      try {
        const contacts = await api.listContacts();
        store.setContacts(contacts);
      } catch {
        /* ignore */
      }
    });

    onCleanup(() => unlisten());
  });

  const handleSend = async () => {
    const contact = store.activeContact();
    const text = input().trim();
    if (!contact || !text || sending()) return;

    setSending(true);
    const encoded = new TextEncoder().encode(text);

    try {
      await api.sendMessage(contact, encoded);
    } catch {
      // No established session — try to initiate via X3DH key exchange
      try {
        const bundleData = await api.fetchBundle(contact, 10);
        await api.startConversation(contact, bundleData, encoded);
      } catch (e) {
        store.setError("Could not send message: " + String(e));
        setSending(false);
        return;
      }
    }

    setInput("");
    setSending(false);

    // Refresh message history
    try {
      const msgs = await api.messageHistory(contact, 100);
      store.setMessages(msgs);
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

  const decodeMessage = (msg: HistoryMessage): string => {
    try {
      return new TextDecoder().decode(new Uint8Array(msg.plaintext));
    } catch {
      return "[binary data]";
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
                Choose a contact in the sidebar to open a thread. Only buttons and
                links respond to clicks.
              </p>
              <ul class="chat-empty-list">
                <li>Messages appear here in plain bordered blocks.</li>
                <li>Use the field below to type and Send.</li>
              </ul>
            </div>
          }
        >
          {/* Header */}
          <div class="chat-header">
            <div class="chat-header-info">
              <div class="chat-header-avatar">
                {store.activeContact()?.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h1 class="chat-header-name truncate">
                  {store.contacts().find(
                    (c) => c.address === store.activeContact(),
                  )?.display_name || store.activeContact()}
                </h1>
                <div class="chat-header-address truncate">
                  {store.activeContact()}
                </div>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div class="chat-messages">
            <For each={store.messages()}>
              {(msg) => (
                <div
                  class={`chat-bubble ${msg.outgoing ? "outgoing" : "incoming"}`}
                >
                  <div class="chat-bubble-text">{decodeMessage(msg)}</div>
                  <div class="chat-bubble-time">
                    {formatTime(msg.timestamp_ms)}
                  </div>
                </div>
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
              placeholder="Type a message…"
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
