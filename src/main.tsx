/**
 * DELIS — Точка входа приложения — монтирует React-приложение в элемент #root на странице.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Pause ambient motion when Telegram is backgrounded. This saves battery and
// prevents WebView from catching up dozens of animation frames on resume.
const syncPageVisibility = () => document.documentElement.classList.toggle("page-hidden", document.hidden);
syncPageVisibility();
document.addEventListener("visibilitychange", syncPageVisibility, { passive: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
