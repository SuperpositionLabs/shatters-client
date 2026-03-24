import { Component, For } from "solid-js";
import { store } from "../store";
import { api } from "../api";
import "./sidebar.css";

const Sidebar: Component = () => {
  const handleDisconnect = async () => {
    try {
      await api.disconnect();
    } catch (_) {}
    store.setConnected(false);
    store.setView("login");
  };

  return (
    <aside class="sidebar">
      {/* User info */}
      <div class="sidebar-header">
        <div class="sidebar-user">
          <div class="sidebar-avatar">
            {store.address().slice(0, 2).toUpperCase()}
          </div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-label truncate">You</div>
            <div class="sidebar-user-addr truncate">{store.address()}</div>
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
            <button
              type="button"
              class={`sidebar-contact ${store.activeContact() === contact.address ? "active" : ""}`}
              onClick={() => {
                store.setActiveContact(contact.address);
                store.setView("chat");
              }}
            >
              <div class="sidebar-contact-avatar">
                {(contact.display_name || contact.address).slice(0, 2).toUpperCase()}
              </div>
              <div class="sidebar-contact-info">
                <div class="sidebar-contact-name truncate">
                  {contact.display_name || contact.address}
                </div>
                <div class="sidebar-contact-addr truncate">
                  {contact.address}
                </div>
              </div>
            </button>
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
