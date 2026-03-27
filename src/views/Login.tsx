import { Component, createSignal, onMount, onCleanup, createEffect } from "solid-js";
import { store } from "../store";
import { api } from "../api";
import "./login.css";

const LS_DB_DIR = "shatters.dbDirectory";
const LS_HOST = "shatters.serverHost";
const LS_PORT = "shatters.serverPort";
const LS_USERNAME = "shatters.username";

const DEFAULT_DB_DIR = ".";

function sanitizeFilenamePart(name: string): string {
  const t = name.trim();
  if (!t) return "shatters";
  return t.replace(/[^\w.\-]/g, "_").replace(/^_+|_+$/g, "") || "shatters";
}

function joinDir(base: string, file: string): string {
  const d = base.trim();
  if (!d || d === ".") return file;
  const sep = d.includes("\\") ? "\\" : "/";
  return `${d.replace(/[/\\]+$/, "")}${sep}${file}`;
}

const Login: Component = () => {
  const [username, setUsername] = createSignal("shatters");
  const [dbPass, setDbPass] = createSignal("");
  const [dbDirectory, setDbDirectory] = createSignal(DEFAULT_DB_DIR);
  const [host, setHost] = createSignal("127.0.0.1");
  const [port, setPort] = createSignal(4433);
  const [loading, setLoading] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);

  onMount(() => {
    const h = localStorage.getItem(LS_HOST);
    if (h) setHost(h);
    const p = localStorage.getItem(LS_PORT);
    if (p) {
      const n = parseInt(p, 10);
      if (!Number.isNaN(n)) setPort(n);
    }
    const dir = localStorage.getItem(LS_DB_DIR);
    if (dir !== null) setDbDirectory(dir || DEFAULT_DB_DIR);
    const u = localStorage.getItem(LS_USERNAME);
    if (u) setUsername(u);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  const dbFileName = () => `${sanitizeFilenamePart(username())}.db`;

  const resolvedDbPath = () => joinDir(dbDirectory(), dbFileName());

  const persistPrefs = () => {
    localStorage.setItem(LS_HOST, host());
    localStorage.setItem(LS_PORT, String(port()));
    localStorage.setItem(LS_DB_DIR, dbDirectory());
    localStorage.setItem(LS_USERNAME, username());
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      persistPrefs();
      const result = await api.connect(
        resolvedDbPath(),
        dbPass(),
        host(),
        port(),
      );
      store.setAddress(result.address);
      store.setConnected(true);

      const contacts = await api.listContacts();
      store.setContacts(contacts);
      if (contacts.length > 0) {
        store.setActiveContact(contacts[0].address);
      }

      await api.resumeConversations();

      // Upload prekey bundle so other users can initiate conversations with us
      try {
        await api.uploadPrekeyBundle(20);
      } catch {
        /* non-critical — user can do this later from Settings */
      }

      store.setView("chat");
    } catch (e) {
      store.setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  /* auto-persist whenever a settings field changes */
  createEffect(() => {
    host();
    port();
    dbDirectory();
    username();
    persistPrefs();
  });

  return (
    <div class="login">
      <div class="login-card">
        <div class="login-brand">
          <img
            class="login-brand-img"
            src="/branding.svg"
            alt="Shatters"
            width="280"
            height="102"
            decoding="async"
          />
        </div>

        <div class="login-divider" />

        <div class="login-form">
          <label class="field">
            <span class="field-label">Username</span>
            <input
              type="text"
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
            />
            <span class="field-hint">
              Used as the database file name ({dbFileName()}).
            </span>
          </label>

          <label class="field">
            <span class="field-label">Password</span>
            <input
              type="password"
              value={dbPass()}
              onInput={(e) => setDbPass(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConnect();
              }}
            />
            <span class="field-hint">Local database encryption passphrase.</span>
          </label>

          <div class="login-actions">
            <button
              type="button"
              class="btn btn-primary login-btn"
              onClick={handleConnect}
              disabled={loading()}
            >
              {loading() ? "CONNECTING" : "CONNECT"}
            </button>
            <button
              type="button"
              class={`login-settings-btn ${settingsOpen() ? "active" : ""}`}
              onClick={() => setSettingsOpen(!settingsOpen())}
              title="Client connection settings"
              aria-label="Settings"
              aria-expanded={settingsOpen()}
            >
              <svg
                viewBox="0 0 24 24"
                class="login-settings-icon"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>

          {/* Inline collapsible settings */}
          <div class={`login-settings-inline ${settingsOpen() ? "open" : ""}`}>
            <div class="login-settings-inner">
              <div class="login-settings-label">
                <span class="login-settings-label-text">Connection</span>
              </div>

              <div class="login-row">
                <label class="field login-field-server">
                  <span class="field-label">Host</span>
                  <input
                    type="text"
                    value={host()}
                    onInput={(e) => setHost(e.currentTarget.value)}
                    placeholder="127.0.0.1"
                  />
                </label>
                <label class="field login-field-port">
                  <span class="field-label">Port</span>
                  <input
                    type="number"
                    value={port()}
                    onInput={(e) =>
                      setPort(parseInt(e.currentTarget.value) || 4433)
                    }
                  />
                </label>
              </div>

              <div class="login-settings-label">
                <span class="login-settings-label-text">Storage</span>
              </div>

              <label class="field">
                <span class="field-label">Database folder</span>
                <input
                  type="text"
                  value={dbDirectory()}
                  onInput={(e) => setDbDirectory(e.currentTarget.value)}
                  placeholder={DEFAULT_DB_DIR}
                />
              </label>

              <div class="login-settings-preview">
                <span class="login-settings-preview-label">Resolved path</span>
                <span class="login-settings-preview-path">{resolvedDbPath()}</span>
              </div>
            </div>
          </div>
        </div>

        <p class="login-footer">
          Don't have a server?{" "}
          <a
            class="login-footer-link"
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Check out the Github Repo!
          </a>
        </p>
      </div>
    </div>
  );
};

export default Login;
