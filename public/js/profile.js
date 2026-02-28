/* ═══════════════════════════════════════════════════════════════
   PROFILE PAGE — LOGIC
   Photo upload | Name/Address/Phone | Document upload with labels
   ═══════════════════════════════════════════════════════════════ */

"use strict";

// ─── Auth Guard ───────────────────────────────────────────────
const CURRENT_USER = requireAuth();

// ─── API Helpers ─────────────────────────────────────────────
let profileCache = { address: "", phone: "", emergencyContact: "", memberSince: null, photo: null, documents: [] };

async function apiGetProfile() {
  try {
    const res = await fetch(`/api/profile/${CURRENT_USER.id}`);
    const data = await res.json();
    if (data.success && data.profile) {
      profileCache = {
        address:          data.profile.address          || "",
        phone:            data.profile.phone            || "",
        emergencyContact: data.profile.emergencyContact || "",
        memberSince:      data.profile.memberSince      || null,
        photo:            data.profile.photo            || null,
        documents:        data.profile.documents        || [],
      };
    }
  } catch (err) { console.warn("apiGetProfile error:", err.message); }
}

async function apiSaveProfile(fields) {
  try {
    const res = await fetch(`/api/profile/${CURRENT_USER.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    return await res.json();
  } catch (err) { console.warn("apiSaveProfile error:", err.message); return { success: false }; }
}

async function apiSavePhoto(base64) {
  try {
    await fetch(`/api/profile/${CURRENT_USER.id}/photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo: base64 }),
    });
    profileCache.photo = base64;
  } catch (err) { console.warn("apiSavePhoto error:", err.message); }
}

async function apiRemovePhoto() {
  try {
    await fetch(`/api/profile/${CURRENT_USER.id}/photo`, { method: "DELETE" });
    profileCache.photo = null;
  } catch (err) { console.warn("apiRemovePhoto error:", err.message); }
}

async function apiAddDocument(doc) {
  try {
    const res = await fetch(`/api/profile/${CURRENT_USER.id}/document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
    const data = await res.json();
    if (data.success) profileCache.documents.push(doc);
    return data.success;
  } catch (err) { console.warn("apiAddDocument error:", err.message); return false; }
}

async function apiDeleteDocument(docId) {
  try {
    await fetch(`/api/profile/${CURRENT_USER.id}/document/${docId}`, { method: "DELETE" });
    profileCache.documents = profileCache.documents.filter(d => d.id !== docId);
  } catch (err) { console.warn("apiDeleteDocument error:", err.message); }
}

async function apiClearDocuments() {
  try {
    await fetch(`/api/profile/${CURRENT_USER.id}/documents`, { method: "DELETE" });
    profileCache.documents = [];
  } catch (err) { console.warn("apiClearDocuments error:", err.message); }
}

// ─── File Type → Emoji Icon ───────────────────────────────────
function fileIcon(mimeType = "") {
  if (mimeType.startsWith("image/"))                        return "🖼️";
  if (mimeType === "application/pdf")                       return "📄";
  if (mimeType.includes("word") || mimeType.includes("doc")) return "📝";
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType.includes("csv")) return "📊";
  if (mimeType.includes("presentation") || mimeType.includes("ppt")) return "📑";
  if (mimeType.includes("zip") || mimeType.includes("rar")) return "🗜️";
  return "📁";
}

// ─── Format Bytes ─────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024)       return bytes + " B";
  if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
}

// ─── Apply theme from sessionStorage (matches dashboard logic) ──
(function applyTheme() {
  const t = sessionStorage.getItem("seap_theme");
  if (t === "light") document.body.classList.add("light-mode");
})();

// ─── User Menu Behaviour ──────────────────────────────────────
const userMenuBtn = document.getElementById("userMenuBtn");
userMenuBtn.addEventListener("click", e => {
  e.stopPropagation();
  userMenuBtn.classList.toggle("open");
});
document.addEventListener("click", () => userMenuBtn.classList.remove("open"));
document.getElementById("logoutBtn").addEventListener("click", logout);

// ─── Initialize UI ────────────────────────────────────────────
async function init() {
  await apiGetProfile();
  const user    = CURRENT_USER;
  const profile = profileCache;
  const photo   = profileCache.photo;

  /* ── Topbar avatar & name ── */
  const topbarAvatar = document.getElementById("userAvatarInitials");
  const topbarName   = document.getElementById("userMenuName");
  topbarName.textContent = user.name || "User";
  if (photo) {
    topbarAvatar.innerHTML = `<img src="${photo}" alt="photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    topbarAvatar.textContent = initials(user.name);
  }

  /* ── Identity card ── */
  document.getElementById("heroName").textContent  = user.name  || "—";
  document.getElementById("heroEmail").textContent = user.email || "—";

  applyPhotoUI(photo);

  document.getElementById("nameInput").value              = user.name || "";
  document.getElementById("addressInput").value           = profile.address || "";
  document.getElementById("phoneInput").value             = profile.phone || "";
  document.getElementById("emergencyContactInput").value  = profile.emergencyContact || "";

  /* ── Account info ── */
  document.getElementById("infoEmail").textContent       = user.email || "—";
  const ms = profile.memberSince || user.createdAt || null;
  document.getElementById("infoMemberSince").textContent = ms
    ? new Date(ms).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
    : "—";

  /* ── Documents ── */
  renderDocs();
}

function initials(name = "") {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?";
}

function applyPhotoUI(photo) {
  const img         = document.getElementById("heroAvatarImg");
  const initFallback = document.getElementById("heroAvatarInitials");
  const removeBtn   = document.getElementById("removePhotoBtn");

  if (photo) {
    img.src = photo;
    img.style.display = "block";
    initFallback.style.display = "none";
    removeBtn.style.display = "inline-block";
  } else {
    img.src = "";
    img.style.display = "none";
    initFallback.textContent  = initials(CURRENT_USER.name);
    initFallback.style.display = "flex";
    removeBtn.style.display = "none";
  }
}

// ─── Photo Upload ─────────────────────────────────────────────
document.getElementById("heroAvatarWrap").addEventListener("click", () => {
  document.getElementById("photoInput").click();
});
document.getElementById("changePhotoBtn").addEventListener("click", () => {
  document.getElementById("photoInput").click();
});
document.getElementById("photoInput").addEventListener("change", function () {
  const file = this.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast("Photo must be under 5 MB", "warning"); return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    const b64 = e.target.result;
    apiSavePhoto(b64).then(() => {
      applyPhotoUI(b64);
      // Update topbar avatar live
      const topbarAvatar = document.getElementById("userAvatarInitials");
      topbarAvatar.innerHTML = `<img src="${b64}" alt="photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      showToast("Profile photo updated!", "success");
    });
  };
  reader.readAsDataURL(file);
});

document.getElementById("removePhotoBtn").addEventListener("click", () => {
  apiRemovePhoto().then(() => {
    applyPhotoUI(null);
    const topbarAvatar = document.getElementById("userAvatarInitials");
    topbarAvatar.innerHTML = "";
    topbarAvatar.textContent = initials(CURRENT_USER.name);
    showToast("Profile photo removed", "info");
  });
});

// ─── Save Profile ─────────────────────────────────────────────
document.getElementById("saveProfileBtn").addEventListener("click", async () => {
  try {
    const newName     = document.getElementById("nameInput").value.trim();
    const address     = document.getElementById("addressInput").value.trim();
    const phone       = document.getElementById("phoneInput").value.trim();
    const emergency   = document.getElementById("emergencyContactInput").value.trim();

    if (!newName) { showToast("Name cannot be empty", "warning"); return; }

    /* Save to MongoDB via API (also updates name in User collection) */
    const result = await apiSaveProfile({ name: newName, address, phone, emergencyContact: emergency });
    if (!result.success) { showToast("Error saving profile. Please try again.", "error"); return; }

    /* Update cache */
    profileCache.address = address;
    profileCache.phone = phone;
    profileCache.emergencyContact = emergency;

    /* Update sessionStorage user name */
    const currentUser = JSON.parse(sessionStorage.getItem("seap_user") || "{}");
    const user = { ...currentUser, name: newName };
    sessionStorage.setItem("seap_user", JSON.stringify(user));

    /* Refresh displayed name */
    document.getElementById("heroName").textContent     = newName;
    document.getElementById("userMenuName").textContent = newName;
    const initFallback = document.getElementById("heroAvatarInitials");
    initFallback.textContent = initials(newName);

    showToast("Profile saved successfully!", "success");
  } catch (err) {
    console.error("saveProfile error:", err);
    showToast("Error saving profile. Please try again.", "error");
  }
});

// ─── Document Upload ──────────────────────────────────────────
let pendingFile = null;

/* Drag-and-drop on upload zone */
const uploadZone = document.getElementById("uploadZone");
uploadZone.addEventListener("dragenter", e => {
  e.preventDefault();
  uploadZone.classList.add("drag-over");
});
uploadZone.addEventListener("dragover", e => {
  e.preventDefault();
  uploadZone.classList.add("drag-over");
});
uploadZone.addEventListener("dragleave", e => {
  // Only remove class when leaving the zone itself, not its children
  if (!uploadZone.contains(e.relatedTarget)) {
    uploadZone.classList.remove("drag-over");
  }
});
uploadZone.addEventListener("drop", e => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) handleFilePicked(file);
});

/* Clicking anywhere on upload zone (except the button) opens file dialog */
uploadZone.addEventListener("click", (e) => {
  if (!e.target.closest("#chooseFileBtn")) {
    document.getElementById("docFileInput").click();
  }
});

document.getElementById("chooseFileBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  e.preventDefault();
  document.getElementById("docFileInput").click();
});
document.getElementById("docFileInput").addEventListener("change", function () {
  if (this.files[0]) handleFilePicked(this.files[0]);
});

function handleFilePicked(file) {
  if (file.size > 10 * 1024 * 1024) {
    showToast("File must be under 10 MB", "warning"); return;
  }
  pendingFile = file;

  /* Show selected file card */
  document.getElementById("selectedFileCard").innerHTML = `
    <span class="selected-file-icon">${fileIcon(file.type)}</span>
    <div class="selected-file-info">
      <div class="selected-file-name">${escHtml(file.name)}</div>
      <div class="selected-file-size">${formatBytes(file.size)} · ${file.type || "Unknown type"}</div>
    </div>
  `;

  /* Suggest label from filename */
  const labelInput = document.getElementById("docLabelInput");
  if (!labelInput.value) {
    labelInput.value = suggestLabel(file.name);
  }

  document.getElementById("uploadZone").style.display    = "none";
  document.getElementById("docUploadForm").style.display = "block";
  labelInput.focus();
}

function suggestLabel(filename) {
  const lower = filename.toLowerCase();
  const map = [
    ["aadhar","Aadhar Card"], ["aadhaar","Aadhar Card"],
    ["pan","PAN Card"], ["passport","Passport"],
    ["driving","Driving Licence"], ["licence","Driving Licence"],
    ["insurance","Insurance Paper"], ["medical","Medical Record"],
    ["prescription","Prescription"], ["report","Medical Report"],
    ["birth","Birth Certificate"], ["voter","Voter ID"],
    ["marksheet","Marksheet"], ["certificate","Certificate"],
  ];
  for (const [kw, label] of map) {
    if (lower.includes(kw)) return label;
  }
  /* Strip extension */
  return filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
}

document.getElementById("cancelUploadBtn").addEventListener("click", resetUploadForm);

document.getElementById("confirmUploadBtn").addEventListener("click", () => {
  if (!pendingFile) return;
  const label = document.getElementById("docLabelInput").value.trim();
  if (!label) {
    showToast("Please enter a label for this document", "warning");
    document.getElementById("docLabelInput").focus();
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    const newDoc = {
      id:         Date.now().toString(),
      label,
      filename:   pendingFile.name,
      mimeType:   pendingFile.type,
      size:       pendingFile.size,
      data:       e.target.result,   // base64 data URL
      uploadedAt: new Date().toISOString(),
    };
    apiAddDocument(newDoc).then(ok => {
      resetUploadForm();
      renderDocs();
      if (ok) showToast(`"${label}" uploaded successfully!`, "success");
      else showToast("Upload failed, please try again.", "error");
    });
  };
  reader.readAsDataURL(pendingFile);
});

function resetUploadForm() {
  pendingFile = null;
  document.getElementById("docFileInput").value       = "";
  document.getElementById("docLabelInput").value      = "";
  document.getElementById("docUploadForm").style.display = "none";
  document.getElementById("uploadZone").style.display    = "block";
}

// ─── Render Documents List ────────────────────────────────────
function renderDocs() {
  const docs    = profileCache.documents;
  const list    = document.getElementById("docsList");
  const empty   = document.getElementById("docsEmpty");
  const badge   = document.getElementById("docCountBadge");
  const infoCount   = document.getElementById("infoDocCount");
  const infoStorage = document.getElementById("infoStorage");

  badge.textContent = docs.length;
  infoCount.textContent = `${docs.length} file${docs.length !== 1 ? "s" : ""}`;

  const totalBytes = docs.reduce((sum, d) => sum + (d.size || 0), 0);
  infoStorage.textContent = formatBytes(totalBytes);

  /* Remove previous items (keep #docsEmpty) */
  list.querySelectorAll(".doc-item").forEach(el => el.remove());

  if (docs.length === 0) {
    empty.style.display = "flex"; return;
  }
  empty.style.display = "none";

  docs.forEach(doc => {
    const item = document.createElement("div");
    item.className = "doc-item";
    item.dataset.id = doc.id;

    const date = doc.uploadedAt
      ? new Date(doc.uploadedAt).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
      : "—";

    item.innerHTML = `
      <span class="doc-type-icon">${fileIcon(doc.mimeType)}</span>
      <div class="doc-info">
        <div class="doc-label">${escHtml(doc.label)}</div>
        <div class="doc-meta">${escHtml(doc.filename)} · ${formatBytes(doc.size)} · ${date}</div>
      </div>
      <div class="doc-actions">
        <button class="doc-action-btn download" title="Download" data-id="${doc.id}">⬇</button>
        <button class="doc-action-btn delete"   title="Delete"   data-id="${doc.id}">🗑</button>
      </div>
    `;
    list.appendChild(item);
  });

  /* Download */
  list.querySelectorAll(".doc-action-btn.download").forEach(btn => {
    btn.addEventListener("click", () => downloadDoc(btn.dataset.id));
  });
  /* Delete */
  list.querySelectorAll(".doc-action-btn.delete").forEach(btn => {
    btn.addEventListener("click", () => deleteDoc(btn.dataset.id));
  });
}

function downloadDoc(id) {
  const doc  = profileCache.documents.find(d => d.id === id);
  if (!doc) return;
  const a = document.createElement("a");
  a.href = doc.data;
  a.download = doc.filename;
  a.click();
}

function deleteDoc(id) {
  const doc = profileCache.documents.find(d => d.id === id);
  if (!doc) return;
  if (!confirm(`Delete "${doc.label}" (${doc.filename})?`)) return;
  apiDeleteDocument(id).then(() => {
    renderDocs();
    showToast(`"${doc.label}" deleted`, "info");
  });
}

// ─── Escape HTML ──────────────────────────────────────────────
function escHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Settings Modal ───────────────────────────────────────────
(function () {
  const overlay      = document.getElementById("settingsOverlay");
  const openBtn      = document.getElementById("openSettingsBtn");
  const closeBtn     = document.getElementById("closeSettingsBtn");
  const themeDarkBtn = document.getElementById("themeDarkBtn");
  const themeLightBtn= document.getElementById("themeLightBtn");
  const clearDocsBtn = document.getElementById("clearDocsBtn");

  if (!overlay || !openBtn) return; // guard

  function applySettingsTheme(theme) {
    if (theme === "light") {
      document.body.classList.add("light-mode");
      themeLightBtn.classList.add("active");
      themeDarkBtn.classList.remove("active");
    } else {
      document.body.classList.remove("light-mode");
      themeDarkBtn.classList.add("active");
      themeLightBtn.classList.remove("active");
    }
    sessionStorage.setItem("seap_theme", theme);
  }

  // Sync buttons to saved theme
  const savedTheme = sessionStorage.getItem("seap_theme") || "dark";
  applySettingsTheme(savedTheme);

  openBtn.addEventListener("click", e => {
    e.stopPropagation();
    userMenuBtn.classList.remove("open");
    overlay.classList.add("open");
  });

  closeBtn.addEventListener("click", () => overlay.classList.remove("open"));
  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.classList.remove("open");
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") overlay.classList.remove("open");
  });

  themeDarkBtn.addEventListener("click",  () => applySettingsTheme("dark"));
  themeLightBtn.addEventListener("click", () => applySettingsTheme("light"));

  clearDocsBtn.addEventListener("click", () => {
    const docs = profileCache.documents;
    if (docs.length === 0) { showToast("No documents to clear", "info"); return; }
    if (!confirm(`Delete all ${docs.length} document(s)?`)) return;
    apiClearDocuments().then(() => {
      renderDocs();
      overlay.classList.remove("open");
      showToast("All documents cleared", "info");
    });
  });
})();

// ─── Boot ─────────────────────────────────────────────────────
init();
