/* ═══════════════════════════════════════════════════════════════
   AUTH UTILITIES - SHARED ACROSS ALL PAGES
   ═══════════════════════════════════════════════════════════════ */

"use strict";

// ─── Toast Notifications ──────────────────────────────────────
function showToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const icons = { success: "✓", error: "✕", info: "ℹ", warning: "⚠" };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || "ℹ"}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="removeToast(this.parentElement)">✕</button>
  `;
  container.appendChild(toast);

  const timer = setTimeout(() => removeToast(toast), duration);
  toast._timer = timer;
}

function removeToast(toast) {
  if (!toast || toast.classList.contains("hiding")) return;
  if (toast._timer) clearTimeout(toast._timer);
  toast.classList.add("hiding");
  setTimeout(() => toast.remove(), 300);
}

// ─── Auth Guards ──────────────────────────────────────────────
function getUser() {
  try {
    return JSON.parse(localStorage.getItem("seap_user") || "null");
  } catch {
    return null;
  }
}

function requireAuth() {
  const user = getUser();
  if (!user) {
    window.location.href = "index.html";
    return null;
  }
  return user;
}

function redirectIfAuth() {
  const user = getUser();
  if (user) {
    window.location.href = "dashboard.html";
  }
}

function logout() {
  localStorage.removeItem("seap_user");
  showToast("Logged out successfully", "info", 2000);
  setTimeout(() => {
    window.location.href = "index.html";
  }, 1000);
}

// ─── Auto-redirect if already logged in (auth pages) ──────────
if (
  window.location.pathname.includes("index.html") ||
  window.location.pathname.includes("signup.html") ||
  window.location.pathname === "/"
) {
  redirectIfAuth();
}

// ─── Clock for Topbar ─────────────────────────────────────────
function startClock() {
  const el = document.getElementById("topbarClock");
  if (!el) return;
  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleTimeString("en-GB", { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
}

startClock();
