import { Component, For, createSignal } from "solid-js";
import { store } from "../store";
import { api } from "../api";
import Sidebar from "../components/Sidebar";
import "./contacts.css";

const Contacts: Component = () => {
  const [address, setAddress] = createSignal("");
  const [publicKey, setPublicKey] = createSignal("");
  const [displayName, setDisplayName] = createSignal("");
  const [adding, setAdding] = createSignal(false);

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
    const pk = hexToBytes(publicKey());
    if (!pk) {
      store.setError("Public key must be 32 bytes in hex (64 characters)");
      return;
    }
    setAdding(true);
    try {
      await api.addContact(address(), pk, displayName());
      setAddress("");
      setPublicKey("");
      setDisplayName("");

      const contacts = await api.listContacts();
      store.setContacts(contacts);
    } catch (e) {
      store.setError(String(e));
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
      store.setError(String(e));
    }
  };

  const bytesToHex = (bytes: number[]): string =>
    bytes.map((b) => b.toString(16).padStart(2, "0")).join("");

  return (
    <div class="chat-layout">
      <Sidebar />
      <div class="contacts-main">
        <div class="contacts-header">
          <h2>Contacts</h2>
        </div>

        {/* Add contact form */}
        <div class="contacts-add">
          <h3>Add Contact</h3>
          <div class="contacts-add-form">
            <label class="field">
              <span class="field-label">Address</span>
              <input
                type="text"
                value={address()}
                onInput={(e) => setAddress(e.currentTarget.value)}
                placeholder="contact address"
              />
            </label>
            <label class="field">
              <span class="field-label">Public Key (hex)</span>
              <input
                type="text"
                value={publicKey()}
                onInput={(e) => setPublicKey(e.currentTarget.value)}
                placeholder="64-character hex string"
              />
            </label>
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
              disabled={adding() || !address()}
            >
              {adding() ? "Adding…" : "Add Contact"}
            </button>
          </div>
        </div>

        {/* Contact list */}
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
                  <div class="contact-row-name">
                    {contact.display_name || "Unnamed"}
                  </div>
                  <div class="contact-row-addr truncate">
                    {contact.address}
                  </div>
                  <div class="contact-row-pk truncate">
                    {bytesToHex(contact.public_key)}
                  </div>
                </div>
                <div class="contact-row-actions">
                  <button
                    class="btn btn-ghost"
                    onClick={() => {
                      store.setActiveContact(contact.address);
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
