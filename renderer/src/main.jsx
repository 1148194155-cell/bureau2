import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { I18nProvider } from "./i18n";
import useStore from "./store/store";

// Expose store on window for programmatic access (tests, headless environment, etc.)
// Usage: window.__store.getState().onConnect({ source: "node_1", target: "node_2" })
window.__store = useStore;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
