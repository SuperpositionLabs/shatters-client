import { Component, For, createSignal, Show } from "solid-js";
import { store } from "../store";
import { api } from "../api";
import "./sidebar.css";

const Sidebar: Component = () => {
  const [renaming, setRenaming] = createSignal<string | null>(null);
  const [renameValue, setRenameValue] = createSignal("");
  // Escape sets this so a subsequent blur doesn't commit the rename.
  let renameCancelled = false;

  const handleDisconnect = async () => {
    try {
      await api.disconnect();
    } catch (e) {
      // Still drop the UI back to login — leaving the user stuck on the
      // chat view with no working session is worse than a stale handle
      // on the backend — but tell them so they can investigate.
      store.pushToast("Disconnect reported an error: " + String(e), "error", 5000);
    }
    store.setConnected(false);
    store.setAddress("");
    store.setUsername("");
    store.setContacts([]);
    store.setActiveContact(null);
    store.setMessages([]);
    store.setView("login");
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(store.address());
      store.pushToast("Address copied", "success", 1800);
    } catch {
      // Clipboard API can be blocked; fall back to selecting the address
      // text so the user can Ctrl/Cmd+C it themselves.
      const el = document.querySelector(".sidebar-user-addr");
      const sel = window.getSelection();
      if (el && sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      store.pushToast(
        "Could not copy automatically — address selected, press Ctrl/Cmd+C",
        "info",
        4000,
      );
    }
  };

  const startRename = (addr: string, current: string) => {
    renameCancelled = false;
    setRenaming(addr);
    setRenameValue(current);
  };

  const cancelRename = () => {
    renameCancelled = true;
    setRenaming(null);
    setRenameValue("");
  };

  const commitRename = async (addr: string) => {
    if (renameCancelled) {
      renameCancelled = false;
      return;
    }
    const next = renameValue().trim();
    const c = store.contacts().find((x) => x.address === addr);
    if (!c) {
      cancelRename();
      return;
    }
    if (next === c.display_name) {
      cancelRename();
      return;
    }
    try {
      await api.addContact(addr, c.public_key, next);
      const list = await api.listContacts();
      store.setContacts(list);
      store.pushToast("Contact renamed", "success", 1800);
    } catch (e) {
      store.pushToast("Rename failed: " + String(e), "error");
    } finally {
      cancelRename();
    }
  };

  const openContact = (addr: string) => {
    store.setActiveContact(addr);
    store.clearUnread(addr);
    store.setView("chat");
  };

  const displayLabel = () => store.username() || "user";
  const initials = () => {
    const u = store.username().trim();
    const src = u || store.address();
    return src.slice(0, 2).toUpperCase();
  };

  return (
    <aside class="sidebar">
      {/* User info */}
      <div class="sidebar-header">
        <div class="sidebar-user">
          <div class="sidebar-avatar">{initials()}</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-label truncate" title={displayLabel()}>
              {displayLabel()}
            </div>
            <button
              type="button"
              class="sidebar-user-addr-btn"
              title="Click to copy address"
              onClick={copyAddress}
            >
              <span class="sidebar-user-addr truncate">{store.address()}</span>
              <svg
                viewBox="0 0 24 24"
                class="sidebar-user-addr-icon"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="1" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav class="sidebar-nav">
        <button
          type="button"
          class={`sidebar-nav-btn ${store.view() === "chat" ? "active" : ""}`}
          onClick={() => store.setView("chat")}
        >
          Chats
        </button>
        <button
          type="button"
          class={`sidebar-nav-btn ${store.view() === "contacts" ? "active" : ""}`}
          onClick={() => store.setView("contacts")}
        >
          Contacts
        </button>
        <button
          type="button"
          class={`sidebar-nav-btn ${store.view() === "settings" ? "active" : ""}`}
          onClick={() => store.setView("settings")}
        >
          Settings
        </button>
      </nav>

      {/* Contact list */}
      <div class="sidebar-list">
        <For each={store.contacts()}>
          {(contact) => (
            <div
              class={`sidebar-contact ${store.activeContact() === contact.address ? "active" : ""}`}
            >
              <button
                type="button"
                class="sidebar-contact-main"
                onClick={() => openContact(contact.address)}
                onDblClick={() =>
                  startRename(contact.address, contact.display_name || "")
                }
                title="Click to open · double-click to rename"
              >
                <div class="sidebar-contact-avatar">
                  {(contact.display_name || contact.address).slice(0, 2).toUpperCase()}
                </div>
                <div class="sidebar-contact-info">
                  <Show
                    when={renaming() === contact.address}
                    fallback={
                      <div class="sidebar-contact-name truncate">
                        {contact.display_name || contact.address.slice(0, 16) + "…"}
                      </div>
                    }
                  >
                    <input
                      class="sidebar-contact-rename"
                      autofocus
                      value={renameValue()}
                      onClick={(e) => e.stopPropagation()}
                      onInput={(e) => setRenameValue(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") commitRename(contact.address);
                        else if (e.key === "Escape") cancelRename();
                      }}
                      onBlur={() => commitRename(contact.address)}
                      placeholder="display name"
                    />
                  </Show>
                  <div class="sidebar-contact-addr truncate">{contact.address}</div>
                </div>
                <Show when={(store.unread()[contact.address] ?? 0) > 0}>
                  <span class="sidebar-contact-badge">
                    {store.unread()[contact.address]}
                  </span>
                </Show>
              </button>
            </div>
          )}
        </For>
      </div>

      {/* Bottom  */}
      <div class="sidebar-footer">
        <button
          type="button"
          class="btn btn-ghost sidebar-disconnect"
          onClick={handleDisconnect}
        >
          Disconnect
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
