import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import axios from "axios";

// 🛡️ SECURITY Fix: Ensure credentials are sent with all API requests
axios.defaults.withCredentials = true;
// import { registerSW } from 'virtual:pwa-register';

// Register service worker for offline support
// registerSW({ immediate: true });

// 🛠️ EMERGENCY Fix: Force-unregister any legacy Service Workers and CLEAR ALL CACHES
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
    window.caches.keys().then((names) => {
      for (const name of names) {
        window.caches.delete(name);
      }
    });
    sessionStorage.clear();
    // Only reload once if we found stuff to clear
    if (localStorage.getItem("sam_reset_v6")) {
      // already reset
    } else {
      localStorage.setItem("sam_reset_v6", "true");
      window.location.reload();
    }
}

// 🛡️ SECURITY: Wipe all old caches to prevent Workbox/PWA fetch interception
if ('caches' in window) {
  caches.keys().then((names) => {
    for (let name of names) {
      caches.delete(name);
      console.log(`🗑️ [SAM Compiler] Cache cleared: ${name}`);
    }
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

