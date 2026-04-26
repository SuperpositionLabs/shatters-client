import { Component, For, Show, createSignal } from "solid-js";
import { store } from "../store";
import { api } from "../api";
import Sidebar from "../components/Sidebar";
import "./contacts.css";

const Contacts: Component = () => {
  const [address, setAddress] = createSignal("");
  const [publicKey, setPublicKey] = createSignal("");
  const [displayName, setDisplayName] = createSignal("");
  const [adding, setAdding] = createSignal(false);
  const [showManualKey, setShowManualKey] = createSignal(false);
  const [renaming, setRenaming] = createSignal<string | null>(null);
  const [renameValue, setRenameValue] = createSignal("");
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({});

  const hexToBytes = (hex: string): number[] | null => {
    const clean = hex.replace(/\s/g, "");
    if (clean.length !== 64) return null;
    const bytes: number[] = [];
    for (let i = 0; i < 64; i += 2) {
      const b = parseInt(clean.substring(i, i + 2), 16);
      if (isNaN(b)) return null;
      bytes.push(b);
    }
    return bytes;
  };

  const handleAdd = async () => {
    const addr = address().trim();
    if (!addr) return;

    setAdding(true);

    if (showManualKey()) {
      const pk = hexToBytes(publicKey());
      if (!pk) {
        store.pushToast("Public key must be 32 bytes in hex (64 characters)");
        setAdding(false);
        return;
      }
      try {
        await api.addContact(addr, pk, displayName());
        setAddress("");
        setPublicKey("");
        setDisplayName("");
        setShowManualKey(false);
        const contacts = await api.listContacts();
        store.setContacts(contacts);
        store.pushToast("Contact added", "success", 1800);
      } catch (e) {
        store.pushToast(String(e));
      } finally {
        setAdding(false);
      }
      return;
    }

    try {
      const bundleData = await api.fetchBundle(addr, 8);
      const pk = bundleData.slice(0, 32);
      await api.addContact(addr, pk, displayName());
      setAddress("");
      setDisplayName("");
      const contacts = await api.listContacts();
      store.setContacts(contacts);
      store.pushToast("Contact added", "success", 1800);
    } catch {
      store.pushToast(
        "Could not resolve this address. They may be offline. You can enter the public key manually.",
        "info",
        7000,
      );
      setShowManualKey(true);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (addr: string) => {
    try {
      await api.removeContact(addr);
      const contacts = await api.listContacts();
      store.setContacts(contacts);
    } catch (e) {
      store.pushToast(String(e));
    }
  };

  const bytesToHex = (bytes: number[]): string =>
    bytes.map((b) => b.toString(16).padStart(2, "0")).join("");

  const startRename = (addr: string, current: string) => {
    setRenaming(addr);
    setRenameValue(current);
  };

  const cancelRename = () => {
    setRenaming(null);
    setRenameValue("");
  };

  const commitRename = async (addr: string) => {
    const c = store.contacts().find((x) => x.address === addr);
    if (!c) return cancelRename();
    const next = renameValue().trim();
    if (next === c.display_name) return cancelRename();
    try {
      await api.addContact(addr, c.public_key, next);
      const list = await api.listContacts();
      store.setContacts(list);
      store.pushToast("Contact renamed", "success", 1800);
    } catch (e) {
      store.pushToast("Rename failed: " + String(e));
    } finally {
      cancelRename();
    }
  };

  const toggleExpand = (addr: string) =>
    setExpanded((prev) => ({ ...prev, [addr]: !prev[addr] }));

  const copyPk = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      store.pushToast("Public key copied", "success", 1500);
    } catch {
      store.pushToast("Could not copy", "error");
    }
  };

  return (
    <div class="chat-layout">
      <Sidebar />
      <div class="contacts-main">
        <div class="contacts-header">
          <h2>Contacts</h2>
        </div>

        <div class="contacts-add">
          <h3>Add Contact</h3>
          <div class="contacts-add-form">
            <label class="field">
              <span class="field-label">Address</span>
              <input
                type="text"
                value={address()}
                onInput={(e) => {
                  setAddress(e.currentTarget.value);
                  setShowManualKey(false);
                }}
                placeholder="contact address"
              />
            </label>

            <Show when={showManualKey()}>
              <label class="field">
                <span class="field-label">Public Key (hex)</span>
                <input
                  type="text"
                  value={publicKey()}
                  onInput={(e) => setPublicKey(e.currentTarget.value)}
                  placeholder="64-character hex string"
                />
                <span class="field-hint">
                  Could not auto-resolve. Paste the 32-byte Ed25519 public key.
                </span>
              </label>
            </Show>

            <label class="field">
              <span class="field-label">Display name</span>
              <input
                type="text"
                value={displayName()}
                onInput={(e) => setDisplayName(e.currentTarget.value)}
                placeholder="optional"
              />
            </label>
            <button
              class="btn btn-primary"
              onClick={handleAdd}
              disabled={adding() || !address().trim()}
            >
              {adding() ? "Resolving…" : "Add Contact"}
            </button>
          </div>
        </div>

        <div class="contacts-list">
          <For
            each={store.contacts()}
            fallback={
              <p class="contacts-empty">No contacts yet. Add one above.</p>
            }
          >
            {(contact) => (
              <div class="contact-row">
                <div class="contact-row-avatar">
                  {(contact.display_name || contact.address)
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div class="contact-row-info">
                  <Show
                    when={renaming() === contact.address}
                    fallback={
                      <div class="contact-row-name-line">
                        <span class="contact-row-name">
                          {contact.display_name || "Unnamed"}
                        </span>
                        <button
                          type="button"
                          class="contact-row-icon-btn"
                          title="Rename"
                          onClick={() =>
                            startRename(
                              contact.address,
                              contact.display_name || "",
                            )
                          }
                        >
                          <svg
                            viewBox="0 0 24 24"
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
                      </div>
                    }
                  >
                    <div class="contact-row-name-line">
                      <input
                        class="contact-row-rename"
                        autofocus
                        value={renameValue()}
                        onInput={(e) => setRenameValue(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(contact.address);
                          else if (e.key === "Escape") cancelRename();
                        }}
                        onBlur={() => commitRename(contact.address)}
                        placeholder="display name"
                      />
                    </div>
                  </Show>
                  <div class="contact-row-addr truncate">{contact.address}</div>
                  <button
                    type="button"
                    class="contact-row-pk-toggle"
                    onClick={() => toggleExpand(contact.address)}
                  >
                    {expanded()[contact.address]
                      ? "▾ Hide public key"
                      : "▸ Show public key"}
                  </button>
                  <Show when={expanded()[contact.address]}>
                    <button
                      type="button"
                      class="contact-row-pk truncate"
                      title="Click to copy"
                      onClick={() => copyPk(bytesToHex(contact.public_key))}
                    >
                      {bytesToHex(contact.public_key)}
                    </button>
                  </Show>
                </div>
                <div class="contact-row-actions">
                  <button
                    class="btn btn-ghost"
                    onClick={() => {
                      store.setActiveContact(contact.address);
                      store.clearUnread(contact.address);
                      store.setView("chat");
                    }}
                  >
                    Chat
                  </button>
                  <button
                    class="btn btn-danger"
                    onClick={() => handleRemove(contact.address)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

export default Contacts;
