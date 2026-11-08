import { createRoot } from "react-dom/client";
import App from "./App";
// Fonts ship with the game (latin only) so it looks right offline
import "@fontsource/sora/latin-400.css";
import "@fontsource/sora/latin-600.css";
import "@fontsource/sora/latin-700.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "./index.css";

// Errors outside drawing (a tap, a timer) don't stop the game, but the last one is kept to be fixed
const keepError = (message: string, stack?: string) => { try { localStorage.setItem("2059-last-error", JSON.stringify({ at: new Date().toISOString(), message, stack: String(stack ?? "").split("\n").slice(0, 6).join("\n") })); } catch { /* nowhere to keep it */ } };
window.addEventListener("error", e => keepError(e.message, e.error?.stack));
window.addEventListener("unhandledrejection", e => keepError(String(e.reason?.message ?? e.reason), e.reason?.stack));

createRoot(document.getElementById("root")!).render(<App />);

// Offline play: the service worker keeps a copy of the game once it has loaded.
// Only in production builds; in development it would serve stale code.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
