import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { initSentry } from "./sentry.js";
import { installDomGuard } from "./dom-guard.js";

// Before React's first DOM call: auto-translate can move nodes at any time.
installDomGuard(Node.prototype);
initSentry();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
