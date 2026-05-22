import { Component, For, createMemo } from "solid-js";
import { store } from "../store";
import "./toast.css";

const Toaster: Component = () => {
  // Errors need role="alert" + aria-live="assertive" so screen readers
  // announce them immediately. Info/success use polite so they don't
  // interrupt the user mid-action.
  const errorToasts = createMemo(() => store.toasts().filter((t) => t.kind === "error"));
  const otherToasts = createMemo(() => store.toasts().filter((t) => t.kind !== "error"));

  return (
    <>
      <div class="toast-stack toast-stack-alert" role="alert" aria-live="assertive">
        <For each={errorToasts()}>
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
      <div class="toast-stack toast-stack-status" role="status" aria-live="polite">
        <For each={otherToasts()}>
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
    </>
  );
};

export default Toaster;
