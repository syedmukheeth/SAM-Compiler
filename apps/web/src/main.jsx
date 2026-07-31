import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import axios from "axios";

// 🛡️ SECURITY Fix: Ensure credentials are sent with all API requests
axios.defaults.withCredentials = true;

// Clean up any service worker left behind by the removed PWA plugin.
//
// This replaces a block that also cleared sessionStorage on *every* load and
// forced window.location.reload() for every first-time visitor (gated on a
// shipped `sam_reset_v6` localStorage flag) - a white flash and doubled load
// time before any UI painted. The cache-clearing logic was additionally
// duplicated, with `window.caches` accessed behind a `'serviceWorker' in
// navigator` check rather than its own feature detect.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => registrations.forEach((r) => r.unregister()))
    .catch(() => {});
}

if ('caches' in window) {
  window.caches.keys()
    .then((names) => names.forEach((name) => window.caches.delete(name)))
    .catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

