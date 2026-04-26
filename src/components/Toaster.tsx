import { Component, For } from "solid-js";
import { store } from "../store";
import "./toast.css";

const Toaster: Component = () => {
  return (
    <div class="toast-stack" role="status" aria-live="polite">
      <For each={store.toasts()}>
        {(t) => (
          <div class={`toast toast-${t.kind}`}>
            <div class="toast-msg">{t.message}</div>
            <button
              type="button"
              class="toast-close"
              aria-label="Dismiss"
              title="Dismiss"
              onClick={() => store.dismissToast(t.id)}
            >
              ×
            </button>
          </div>
        )}
      </For>
    </div>
  );
};

export default Toaster;
