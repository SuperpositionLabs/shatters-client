import { Component, Show, Switch, Match } from "solid-js";
import { store } from "./store";
import Login from "./views/Login";
import Chat from "./views/Chat";
import Contacts from "./views/Contacts";
import Settings from "./views/Settings";
import "./styles/app.css";

const App: Component = () => {
  return (
    <div class="app">
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

      <Show when={store.error()}>
        <div class="toast-error" onClick={() => store.setError(null)}>
          {store.error()}
        </div>
      </Show>
    </div>
  );
};

export default App;
