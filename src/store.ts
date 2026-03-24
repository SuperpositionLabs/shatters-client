import { createSignal, createRoot } from "solid-js";
import type { Contact, HistoryMessage } from "./api";

function createAppStore() {
  const [connected, setConnected] = createSignal(false);
  const [address, setAddress] = createSignal("");
  const [contacts, setContacts] = createSignal<Contact[]>([]);
  const [activeContact, setActiveContact] = createSignal<string | null>(null);
  const [messages, setMessages] = createSignal<HistoryMessage[]>([]);
  const [error, setError] = createSignal<string | null>(null);
  const [view, setView] = createSignal<"login" | "chat" | "contacts" | "settings">("login");

  return {
    connected,
    setConnected,
    address,
    setAddress,
    contacts,
    setContacts,
    activeContact,
    setActiveContact,
    messages,
    setMessages,
    error,
    setError,
    view,
    setView,
  };
}

export const store = createRoot(createAppStore);
