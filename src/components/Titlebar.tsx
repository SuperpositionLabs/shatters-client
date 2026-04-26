import { Component } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./titlebar.css";

const Titlebar: Component = () => {
  const win = () => {
    try {
      return getCurrentWindow();
    } catch {
      return null;
    }
  };

  const onMinimize = () => win()?.minimize();
  const onMaximize = () => win()?.toggleMaximize();
  const onClose = () => win()?.close();

  return (
    <div class="titlebar" data-tauri-drag-region>
      <div class="titlebar-left" data-tauri-drag-region>
        <span class="titlebar-title" data-tauri-drag-region>
          Shatters
        </span>
      </div>
      <div class="titlebar-controls">
        <button
          type="button"
          class="titlebar-btn"
          aria-label="Minimize"
          title="Minimize"
          onClick={onMinimize}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true" fill="currentColor">
            <rect x="2" y="5.5" width="8" height="1" />
          </svg>
        </button>
        <button
          type="button"
          class="titlebar-btn"
          aria-label="Maximize"
          title="Maximize"
          onClick={onMaximize}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1">
            <rect x="2.5" y="2.5" width="7" height="7" />
          </svg>
        </button>
        <button
          type="button"
          class="titlebar-btn titlebar-btn-close"
          aria-label="Close"
          title="Close"
          onClick={onClose}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2">
            <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" />
            <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Titlebar;
