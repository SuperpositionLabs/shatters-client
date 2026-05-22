import { invoke } from "@tauri-apps/api/core";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type BackendErrorKind = "no_session" | "sdk" | "other";

/**
 * Error thrown from any Tauri command. `kind` lets callers branch on
 * meaningful classes of failure (e.g. NoSession triggers X3DH bootstrap)
 * without sniffing on the human-readable `message`.
 */
export class BackendError extends Error {
  kind: BackendErrorKind;
  code?: number;

  constructor(payload: unknown) {
    let message = "";
    let kind: BackendErrorKind = "other";
    let code: number | undefined;
    if (payload && typeof payload === "object") {
      const p = payload as { kind?: string; message?: string; code?: number };
      message = p.message ?? "";
      if (p.kind === "no_session" || p.kind === "sdk" || p.kind === "other") {
        kind = p.kind;
      }
      code = p.code;
    } else if (typeof payload === "string") {
      message = payload;
    } else {
      message = String(payload);
    }
    super(message || "backend error");
    this.kind = kind;
    this.code = code;
  }
}

function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Not running inside Tauri. Use 'cargo tauri dev' instead of 'npm run dev'."),
    );
  }
  return invoke<T>(cmd, args).catch((e) => {
    throw new BackendError(e);
  });
}

export interface ConnectResult {
  address: string;
}

export interface Contact {
  address: string;
  public_key: number[];
  display_name: string;
  added_at: number;
}

export interface HistoryMessage {
  id: number;
  contact_address: string;
  plaintext: number[];
  timestamp_ms: number;
  outgoing: boolean;
}

export const api = {
  connect(
    dbPath: string,
    dbPass: string,
    serverHost: string,
    serverPort: number,
  ): Promise<ConnectResult> {
    return tauriInvoke("connect", {
      dbPath,
      dbPass,
      serverHost,
      serverPort,
    });
  },

  disconnect(): Promise<void> {
    return tauriInvoke("disconnect");
  },

  isConnected(): Promise<boolean> {
    return tauriInvoke("is_connected");
  },

  getAddress(): Promise<string> {
    return tauriInvoke("get_address");
  },

  getPublicKey(): Promise<number[]> {
    return tauriInvoke("get_public_key");
  },

  sendMessage(contact: string, plaintext: Uint8Array): Promise<void> {
    return tauriInvoke("send_message", {
      contact,
      plaintext: Array.from(plaintext),
    });
  },

  messageHistory(
    contact: string,
    limit: number,
    offset: number = 0,
  ): Promise<HistoryMessage[]> {
    return tauriInvoke("message_history", { contact, limit, offset });
  },

  addContact(
    address: string,
    publicKey: number[],
    displayName: string,
  ): Promise<void> {
    return tauriInvoke("add_contact", {
      address,
      publicKey,
      displayName,
    });
  },

  removeContact(address: string): Promise<void> {
    return tauriInvoke("remove_contact", { address });
  },

  listContacts(): Promise<Contact[]> {
    return tauriInvoke("list_contacts");
  },

  uploadPrekeyBundle(numOneTime: number = 20): Promise<void> {
    return tauriInvoke("upload_prekey_bundle", { numOneTime });
  },

  resumeConversations(): Promise<void> {
    return tauriInvoke("resume_conversations");
  },

  startConversation(
    contact: string,
    bundleData: number[],
    firstMessage: Uint8Array,
  ): Promise<void> {
    return tauriInvoke("start_conversation", {
      contact,
      bundleData,
      firstMessage: Array.from(firstMessage),
    });
  },

  fetchBundle(address: string, timeoutSecs: number = 5): Promise<number[]> {
    return tauriInvoke("fetch_bundle", { address, timeoutSecs });
  },
};
