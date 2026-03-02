/* ═══════════════════════════════════════════════════════════════
   PROFILE PAGE — LOGIC
   Photo upload | Name/Address/Phone | Document upload with labels
   ═══════════════════════════════════════════════════════════════ */

"use strict";

// ─── Auth Guard ───────────────────────────────────────────────
const CURRENT_USER = requireAuth();

// ─── API Helpers ─────────────────────────────────────────────
let profileCache = { address: "", phone: "", age: "", gender: "", bloodGroup: "", emergencyContactName: "", emergencyContactPhone: "", memberSince: null, photo: null, documents: [] };

async function apiGetProfile() {
  try {
    const res = await fetch(`/api/profile/${CURRENT_USER.id}`);
    const data = await res.json();
    if (data.success && data.profile) {
      profileCache = {
        address:                data.profile.address                || "",
        phone:                  data.profile.phone                  || "",
        age:                    data.profile.age                    || "",
        gender:                 data.profile.gender                 || "",
        bloodGroup:             data.profile.bloodGroup             || "",
        emergencyContactName:   data.profile.emergencyContactName   || "",
        emergencyContactPhone:  data.profile.emergencyContactPhone  || "",
        memberSince:            data.profile.memberSince            || null,
        photo:                  data.profile.photo                  || null,
        documents:              data.profile.documents              || [],
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

// ─── PDF first-page thumbnail via PDF.js ─────────────────────
async function generatePdfThumbnail(dataUrl, canvas) {
  try {
    if (typeof pdfjsLib === "undefined") return;
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const loadingTask = pdfjsLib.getDocument(dataUrl);
    const pdf  = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    // use higher scale for crisp render, then CSS scales it down
    const scale  = Math.min(120 / viewport.width, 120 / viewport.height);
    const scaled = page.getViewport({ scale });
    canvas.width  = scaled.width;
    canvas.height = scaled.height;
    const ctx = canvas.getContext("2d");
    // fill white so transparent PDF areas don't appear black
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: scaled, background: "white" }).promise;
  } catch (e) { console.warn("PDF thumb error:", e.message); }
}

// ─── Open document in full-screen viewer ─────────────────────
function openDocViewer(doc) {
  const overlay = document.getElementById("docViewerOverlay");
  const body    = document.getElementById("docViewerBody");
  const title   = document.getElementById("docViewerTitle");
  const dlBtn   = document.getElementById("docViewerDownload");

  title.textContent = doc.label || doc.filename;
  body.innerHTML = "";

  if (doc.mimeType && doc.mimeType.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = doc.data;
    img.className = "doc-viewer-img";
    body.appendChild(img);
  } else if (doc.mimeType === "application/pdf") {
    // Convert data URL to blob URL so iframe can load it
    const byteStr = atob(doc.data.split(",")[1]);
    const ab = new ArrayBuffer(byteStr.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
    const blob    = new Blob([ab], { type: "application/pdf" });
    const blobUrl = URL.createObjectURL(blob);
    const iframe  = document.createElement("iframe");
    iframe.src = blobUrl;
    iframe.className = "doc-viewer-iframe";
    body.appendChild(iframe);
    // revoke after a moment
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } else {
    body.innerHTML = `<div class="doc-viewer-nopreview">
      <div style="font-size:3rem">${fileIcon(doc.mimeType)}</div>
      <p>Preview not available for this file type.</p>
      <button class="doc-viewer-btn" onclick="document.getElementById('docViewerDownload').click()">⬇ Download</button>
    </div>`;
  }

  dlBtn.onclick = () => { const a = document.createElement("a"); a.href = doc.data; a.download = doc.filename; a.click(); };
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

// ─── Viewer close logic ───────────────────────────────────────
(function initViewer() {
  const overlay = document.getElementById("docViewerOverlay");
  if (!overlay) return;
  document.getElementById("docViewerClose").addEventListener("click", () => {
    overlay.classList.remove("open"); document.body.style.overflow = "";
  });
  overlay.addEventListener("click", e => {
    if (e.target === overlay) { overlay.classList.remove("open"); document.body.style.overflow = ""; }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && overlay.classList.contains("open")) {
      overlay.classList.remove("open"); document.body.style.overflow = "";
    }
  });
})();

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
  document.getElementById("ageInput").value               = profile.age || "";
  document.getElementById("genderInput").value            = profile.gender || "";
  document.getElementById("bloodGroupInput").value        = profile.bloodGroup || "";
  /* Set identity inputs to readonly (view mode) */
  setIdentityReadonly(true);

  /* ── Emergency Contact ── */
  document.getElementById("ecNameInput").value  = profile.emergencyContactName  || "";
  document.getElementById("ecPhoneInput").value = profile.emergencyContactPhone || "";
  setEcReadonly(true);

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

// ─── Identity Edit Mode ──────────────────────────────────────
const _identityInputIds  = ["nameInput", "addressInput", "phoneInput", "ageInput"];
const _identitySelectIds = ["genderInput", "bloodGroupInput"];

function setIdentityReadonly(readonly) {
  _identityInputIds.forEach(id => {
    const el = document.getElementById(id);
    if (readonly) {
      el.setAttribute("readonly", true);
      el.classList.add("readonly-mode");
    } else {
      el.removeAttribute("readonly");
      el.classList.remove("readonly-mode");
    }
  });
  _identitySelectIds.forEach(id => {
    const el = document.getElementById(id);
    if (readonly) {
      el.setAttribute("disabled", true);
      el.classList.add("readonly-mode");
    } else {
      el.removeAttribute("disabled");
      el.classList.remove("readonly-mode");
    }
  });
}

/* Snapshot of values before edit (for cancel) */
let _identitySnapshot = {};

document.getElementById("editProfileBtn").addEventListener("click", () => {
  /* Save snapshot */
  _identitySnapshot = {
    name:             document.getElementById("nameInput").value,
    address:          document.getElementById("addressInput").value,
    phone:            document.getElementById("phoneInput").value,
    age:              document.getElementById("ageInput").value,
    gender:           document.getElementById("genderInput").value,
    bloodGroup:       document.getElementById("bloodGroupInput").value,
  };
  setIdentityReadonly(false);
  document.getElementById("editProfileBtn").style.display    = "none";
  document.getElementById("identityActions").style.display   = "flex";
  /* Add glow effect to the card */
  document.getElementById("editProfileBtn").closest(".profile-card").classList.add("card-editing");
  document.getElementById("nameInput").focus();
});

document.getElementById("cancelEditBtn").addEventListener("click", () => {
  /* Restore snapshot */
  document.getElementById("nameInput").value              = _identitySnapshot.name || "";
  document.getElementById("addressInput").value           = _identitySnapshot.address || "";
  document.getElementById("phoneInput").value             = _identitySnapshot.phone || "";
  document.getElementById("ageInput").value               = _identitySnapshot.age || "";
  document.getElementById("genderInput").value            = _identitySnapshot.gender || "";
  document.getElementById("bloodGroupInput").value        = _identitySnapshot.bloodGroup || "";
  setIdentityReadonly(true);
  document.getElementById("identityActions").style.display = "none";
  document.getElementById("editProfileBtn").style.display  = "inline-flex";
  document.getElementById("cancelEditBtn").closest(".profile-card").classList.remove("card-editing");
});

// ─── Save Profile ─────────────────────────────────────────────
document.getElementById("saveProfileBtn").addEventListener("click", async () => {
  try {
    const newName     = document.getElementById("nameInput").value.trim();
    const address     = document.getElementById("addressInput").value.trim();
    const phone       = document.getElementById("phoneInput").value.trim();
    const age         = document.getElementById("ageInput").value.trim();
    const gender      = document.getElementById("genderInput").value;
    const bloodGroup  = document.getElementById("bloodGroupInput").value;

    if (!newName) { showToast("Name cannot be empty", "warning"); return; }

    /* Save to MongoDB via API (also updates name in User collection) */
    const result = await apiSaveProfile({ name: newName, address, phone, age, gender, bloodGroup });
    if (!result.success) { showToast("Error saving profile. Please try again.", "error"); return; }

    /* Update cache */
    profileCache.address    = address;
    profileCache.phone      = phone;
    profileCache.age        = age;
    profileCache.gender     = gender;
    profileCache.bloodGroup = bloodGroup;

    /* Update sessionStorage user name */
    const currentUser = JSON.parse(sessionStorage.getItem("seap_user") || "{}");
    const user = { ...currentUser, name: newName };
    sessionStorage.setItem("seap_user", JSON.stringify(user));

    /* Refresh displayed name */
    document.getElementById("heroName").textContent     = newName;
    document.getElementById("userMenuName").textContent = newName;
    const initFallback = document.getElementById("heroAvatarInitials");
    initFallback.textContent = initials(newName);

    /* Return to view mode */
    setIdentityReadonly(true);
    document.getElementById("identityActions").style.display = "none";
    document.getElementById("editProfileBtn").style.display  = "inline-flex";
    document.getElementById("saveProfileBtn").closest(".profile-card").classList.remove("card-editing");

    showToast("Profile saved successfully!", "success");
  } catch (err) {
    console.error("saveProfile error:", err);
    showToast("Error saving profile. Please try again.", "error");
  }
});

// ─── Emergency Contact Edit / Save ──────────────────────────
function setEcReadonly(readonly) {
  ["ecNameInput", "ecPhoneInput"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (readonly) {
      el.setAttribute("readonly", true);
      el.classList.add("readonly-mode");
    } else {
      el.removeAttribute("readonly");
      el.classList.remove("readonly-mode");
    }
  });
}

let _ecSnapshot = {};

document.getElementById("editEcBtn").addEventListener("click", () => {
  _ecSnapshot = {
    name:  document.getElementById("ecNameInput").value,
    phone: document.getElementById("ecPhoneInput").value,
  };
  setEcReadonly(false);
  document.getElementById("editEcBtn").style.display = "none";
  document.getElementById("ecActions").style.display = "flex";
  document.getElementById("editEcBtn").closest(".profile-card").classList.add("card-editing");
  document.getElementById("ecNameInput").focus();
});

document.getElementById("cancelEcBtn").addEventListener("click", () => {
  document.getElementById("ecNameInput").value  = _ecSnapshot.name  || "";
  document.getElementById("ecPhoneInput").value = _ecSnapshot.phone || "";
  setEcReadonly(true);
  document.getElementById("ecActions").style.display  = "none";
  document.getElementById("editEcBtn").style.display   = "inline-flex";
  document.getElementById("cancelEcBtn").closest(".profile-card").classList.remove("card-editing");
});

document.getElementById("saveEcBtn").addEventListener("click", async () => {
  const ecName  = document.getElementById("ecNameInput").value.trim();
  const ecPhone = document.getElementById("ecPhoneInput").value.trim();

  if (!ecPhone) { showToast("Please enter the emergency contact phone number", "warning"); return; }

  document.getElementById("saveEcBtn").disabled = true;
  document.getElementById("saveEcBtn").textContent = "Saving...";

  const result = await apiSaveProfile({ emergencyContactName: ecName, emergencyContactPhone: ecPhone });

  document.getElementById("saveEcBtn").disabled = false;
  document.getElementById("saveEcBtn").innerHTML = "<span>💾</span> Save Contact";

  if (!result.success) { showToast("Error saving contact. Please try again.", "error"); return; }

  profileCache.emergencyContactName  = ecName;
  profileCache.emergencyContactPhone = ecPhone;

  setEcReadonly(true);
  document.getElementById("ecActions").style.display  = "none";
  document.getElementById("editEcBtn").style.display   = "inline-flex";
  document.getElementById("saveEcBtn").closest(".profile-card").classList.remove("card-editing");

  showToast("Emergency contact saved! " + (ecName ? ecName + " — " : "") + ecPhone, "success");
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

    const isImage = doc.mimeType && doc.mimeType.startsWith("image/");
    const isPdf   = doc.mimeType === "application/pdf";

    const date = doc.uploadedAt
      ? new Date(doc.uploadedAt).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
      : "—";

    const thumbHtml = (isImage || isPdf)
      ? `<div class="doc-thumb-wrap" id="thumbWrap-${doc.id}"></div>`
      : `<span class="doc-type-icon">${fileIcon(doc.mimeType)}</span>`;

    item.innerHTML = `
      ${thumbHtml}
      <div class="doc-info">
        <div class="doc-label">${escHtml(doc.label)}</div>
        <div class="doc-meta">${escHtml(doc.filename)} · ${formatBytes(doc.size)} · ${date}</div>
      </div>
      <div class="doc-actions">
        <button class="doc-action-btn view"     title="View"     data-id="${doc.id}">👁</button>
        <button class="doc-action-btn download" title="Download" data-id="${doc.id}">⬇</button>
        <button class="doc-action-btn delete"   title="Delete"   data-id="${doc.id}">🗑</button>
      </div>
    `;
    list.appendChild(item);

    // Fill thumbnail asynchronously
    const wrap = document.getElementById(`thumbWrap-${doc.id}`);
    if (wrap) {
      if (isImage) {
        const img = document.createElement("img");
        img.src = doc.data;
        img.className = "doc-thumb";
        wrap.appendChild(img);
      } else if (isPdf) {
        const canvas = document.createElement("canvas");
        canvas.className = "doc-thumb";
        wrap.appendChild(canvas);
        generatePdfThumbnail(doc.data, canvas);
      }
    }
  });

  /* View */
  list.querySelectorAll(".doc-action-btn.view").forEach(btn => {
    btn.addEventListener("click", () => {
      const doc = profileCache.documents.find(d => d.id === btn.dataset.id);
      if (doc) openDocViewer(doc);
    });
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
