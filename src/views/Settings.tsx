import { Component, createSignal } from "solid-js";
import { store } from "../store";
import { api } from "../api";
import Sidebar from "../components/Sidebar";
import "./settings.css";

const Settings: Component = () => {
  const [publicKey, setPublicKey] = createSignal<string>("");
  const [uploading, setUploading] = createSignal(false);

  const loadPublicKey = async () => {
    try {
      const pk = await api.getPublicKey();
      setPublicKey(pk.map((b) => b.toString(16).padStart(2, "0")).join(""));
    } catch (e) {
      store.setError(String(e));
    }
  };
  loadPublicKey();

  const handleUploadBundle = async () => {
    setUploading(true);
    try {
      await api.uploadPrekeyBundle(20);
      store.setError(null);
    } catch (e) {
      store.setError(String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div class="chat-layout">
      <Sidebar />
      <div class="settings-main">
        <div class="settings-header">
          <h2>Settings</h2>
        </div>

        <div class="settings-content">
          {/* Identity */}
          <section class="settings-section">
            <h3>Identity</h3>
            <div class="settings-field">
              <label class="field-label">Address</label>
              <div class="settings-mono">{store.address()}</div>
            </div>
            <div class="settings-field">
              <label class="field-label">Public Key</label>
              <div class="settings-mono">{publicKey() || "loading…"}</div>
            </div>
          </section>

          {/* Key management */}
          <section class="settings-section">
            <h3>Key Management</h3>
            <p class="settings-desc">
              Upload a fresh pre-key bundle to the relay so others can initiate
              end-to-end encrypted conversations with you.
            </p>
            <button
              class="btn btn-primary"
              onClick={handleUploadBundle}
              disabled={uploading()}
            >
              {uploading() ? "Uploading…" : "Upload Pre-Key Bundle"}
            </button>
          </section>

          {/* About */}
          <section class="settings-section">
            <h3>About</h3>
            <p class="settings-desc">
              Shatters v0.1.0 — end-to-end encrypted messaging with X3DH key
              agreement and Double Ratchet forward secrecy.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Settings;
