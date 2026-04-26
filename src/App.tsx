import { Component, Switch, Match, createEffect, createSignal, onMount, onCleanup } from "solid-js";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { store } from "./store";
import Login from "./views/Login";
import Chat from "./views/Chat";
import Contacts from "./views/Contacts";
import Settings from "./views/Settings";
import Titlebar from "./components/Titlebar";
import Toaster from "./components/Toaster";
import "./styles/app.css";

const LOGIN_SIZE = { w: 460, h: 600 };
const APP_SIZE = { w: 960, h: 680 };

async function resizeWindow(w: number, h: number, recenter = false) {
  try {
    const win = getCurrentWindow();
    await win.setSize(new LogicalSize(w, h));
    if (recenter) {
      try {
        await win.center();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* not running in Tauri */
  }
}

const App: Component = () => {
  let prevView: string | null = null;

  createEffect(() => {
    const v = store.view();
    if (prevView === v) return;
    const wasLogin = prevView === "login" || prevView === null;
    prevView = v;
    if (v === "login") {
      resizeWindow(LOGIN_SIZE.w, LOGIN_SIZE.h, true);
    } else if (wasLogin) {
      resizeWindow(APP_SIZE.w, APP_SIZE.h, true);
    }
  });

  // Track focus so message notifications only fire when window is hidden / blurred.
  const [focused, setFocused] = createSignal(true);
  onMount(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    setFocused(document.hasFocus());
    onCleanup(() => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    });
  });
  (window as any).__shattersFocused = focused;

  return (
    <div class="app">
      <Titlebar />
      <div class="app-content">
        <Switch>
          <Match when={store.view() === "login"}>
            <div class="view-fade"><Login /></div>
          </Match>
          <Match when={store.view() === "chat"}>
            <div class="view-fade"><Chat /></div>
          </Match>
          <Match when={store.view() === "contacts"}>
            <div class="view-fade"><Contacts /></div>
          </Match>
          <Match when={store.view() === "settings"}>
            <div class="view-fade"><Settings /></div>
          </Match>
        </Switch>
      </div>

      <Toaster />
    </div>
  );
};

export default App;
