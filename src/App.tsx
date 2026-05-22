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
const RESIZE_DURATION_MS = 420;

async function setWindowSize(w: number, h: number, recenter = false) {
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

// Cubic ease-in-out
const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

let activeAnim = 0;

async function animateResize(
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
  durationMs = RESIZE_DURATION_MS,
) {
  const win = (() => {
    try {
      return getCurrentWindow();
    } catch {
      return null;
    }
  })();
  if (!win) return;

  const myAnim = ++activeAnim;
  const start = performance.now();

  return new Promise<void>((resolve) => {
    const step = async () => {
      if (myAnim !== activeAnim) {
        resolve();
        return;
      }
      const t = Math.min(1, (performance.now() - start) / durationMs);
      const k = easeInOut(t);
      const w = Math.round(fromW + (toW - fromW) * k);
      const h = Math.round(fromH + (toH - fromH) * k);
      try {
        await win.setSize(new LogicalSize(w, h));
        try {
          await win.center();
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
      if (t >= 1) {
        resolve();
        return;
      }
      requestAnimationFrame(() => {
        step();
      });
    };
    requestAnimationFrame(() => {
      step();
    });
  });
}

const App: Component = () => {
  let prevView: string | null = null;

  createEffect(() => {
    const v = store.view();
    if (prevView === v) return;
    const wasLogin = prevView === "login" || prevView === null;
    prevView = v;
    if (v === "login" && !wasLogin) {
      // App → login: shrink with animation
      animateResize(APP_SIZE.w, APP_SIZE.h, LOGIN_SIZE.w, LOGIN_SIZE.h);
    } else if (v === "login") {
      // First mount on login: snap (no animation needed)
      setWindowSize(LOGIN_SIZE.w, LOGIN_SIZE.h, true);
    } else if (wasLogin) {
      // Login → app: gradual grow
      animateResize(LOGIN_SIZE.w, LOGIN_SIZE.h, APP_SIZE.w, APP_SIZE.h);
    }
    // app ↔ app navigation: do nothing (no resize, no fade)
  });

  // Track focus so message notifications only fire when window is hidden / blurred.
  //
  // Listening only to DOM focus/blur is unreliable for a Tauri webview: when
  // the user minimizes to the tray on some platforms, neither event fires
  // (the webview just stops painting). Combine three signals so the state
  // stays accurate across minimize, hide, tray, and ordinary focus loss:
  //   - DOM window focus/blur     (most reliable in foreground)
  //   - document.visibilitychange (catches tab/hide)
  //   - Tauri tauri://focus/blur  (catches OS-level focus on the native window)
  const [focused, setFocused] = createSignal(true);
  onMount(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    const onVisibility = () => setFocused(document.visibilityState === "visible");
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    setFocused(document.hasFocus() && document.visibilityState === "visible");

    let unlistenFocus: (() => void) | null = null;
    let unlistenBlur: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const win = getCurrentWindow();
        const [uf, ub] = await Promise.all([
          win.listen("tauri://focus", () => setFocused(true)),
          win.listen("tauri://blur", () => setFocused(false)),
        ]);
        if (cancelled) {
          uf();
          ub();
        } else {
          unlistenFocus = uf;
          unlistenBlur = ub;
        }
      } catch {
        /* not running in Tauri */
      }
    })();

    onCleanup(() => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      if (unlistenFocus) unlistenFocus();
      if (unlistenBlur) unlistenBlur();
    });
  });
  (window as any).__shattersFocused = focused;

  return (
    <div class="app">
      <Titlebar />
      <div class="app-content">
        <Switch>
          <Match when={store.view() === "login"}>
            <Login />
          </Match>
          <Match when={store.view() === "chat"}>
            <Chat />
          </Match>
          <Match when={store.view() === "contacts"}>
            <Contacts />
          </Match>
          <Match when={store.view() === "settings"}>
            <Settings />
          </Match>
        </Switch>
      </div>

      <Toaster />
    </div>
  );
};

export default App;
