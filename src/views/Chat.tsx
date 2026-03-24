import { Component, For, Show, createSignal, createEffect } from "solid-js";
import { store } from "../store";
import { api, type HistoryMessage } from "../api";
import Sidebar from "../components/Sidebar";
import "./chat.css";

const Chat: Component = () => {
  const [input, setInput] = createSignal("");
  let messagesEnd: HTMLDivElement | undefined;

  const scrollToBottom = () => {
    messagesEnd?.scrollIntoView({ behavior: "smooth" });
  };

  createEffect(() => {
    store.messages();
    scrollToBottom();
  });

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

  const handleSend = async () => {
    const contact = store.activeContact();
    const text = input().trim();
    if (!contact || !text) return;

    try {
      const encoded = new TextEncoder().encode(text);
      await api.sendMessage(contact, encoded);
      setInput("");

      // Refresh
      const msgs = await api.messageHistory(contact, 100);
      store.setMessages(msgs);
    } catch (e) {
      store.setError(String(e));
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
              disabled={!input().trim()}
            >
              Send
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default Chat;
