/* ═══════════════════════════════════════════════════════════════
   DASHBOARD - MAIN LOGIC (Google Maps Edition)
   IoT Location Polling | Live Map | Nearby Services | SOS
   ═══════════════════════════════════════════════════════════════ */

"use strict";

// ─── Auth Guard ───────────────────────────────────────────────
const CURRENT_USER = requireAuth();

// ─── DOM References ───────────────────────────────────────────
const DOM = {
  coordLat: document.getElementById("coordLat"),
  coordLng: document.getElementById("coordLng"),
  deviceId: document.getElementById("deviceId"),
  deviceSpeed: document.getElementById("deviceSpeed"),
  deviceSignal: document.getElementById("deviceSignal"),
  batteryPct: document.getElementById("batteryPct"),
  batteryBar: document.getElementById("batteryBar"),
  lastUpdateTime: document.getElementById("lastUpdateTime"),
  updateTimeAgo: document.getElementById("updateTimeAgo"),
  hospitalsList: document.getElementById("hospitalsList"),
  policeList: document.getElementById("policeList"),
  hospitalCount: document.getElementById("hospitalCount"),
  policeCount: document.getElementById("policeCount"),
  hospitalCountBadge: document.getElementById("hospitalCountBadge"),
  policeCountBadge: document.getElementById("policeCountBadge"),
  sosBtn: document.getElementById("sosBtn"),
  sosBanner: document.getElementById("sosBanner"),
  mapZoomLevel: document.getElementById("mapZoomLevel"),
  userMenuName: document.getElementById("userMenuName"),
  userAvatarInitials: document.getElementById("userAvatarInitials"),
  dropdownUserName: document.getElementById("dropdownUserName"),
  logoutBtn: document.getElementById("logoutBtn"),
  userMenuBtn: document.getElementById("userMenuBtn"),
  mapLoadingOverlay: document.getElementById("mapLoadingOverlay"),
  sosLogList: document.getElementById("sosLogList"),
  radiusDecBtn: document.getElementById("radiusDecBtn"),
  radiusIncBtn: document.getElementById("radiusIncBtn"),
  radiusStepDisplay: document.getElementById("radiusStepDisplay"),
  searchRadiusDisplay: document.getElementById("searchRadiusDisplay"),
};

// ─── IoT Fetch Interval Handle (for Auto Refresh toggle) ────
let iotFetchInterval = null;

// ─── State ────────────────────────────────────────────────────
let state = {
  lat: 28.6139,
  lng: 77.209,
  prevLat: null,
  prevLng: null,
  hospitals: [],
  policeStations: [],
  activeFilter: "all",
  sosActive: false,
  mapReady: false,
  lastFetchTime: null,
  locationHistory: [],
  sosLog: [],
  searchRadius: 10000,  // metres — default 10 km
};

// ─── Active Navigation State ───────────────────────────────────
let navState = {
  active: false,
  destLat: null,
  destLng: null,
  destName: "",
  lastUpdateLat: null,
  lastUpdateLng: null,
};

// ─── Initialize User UI ───────────────────────────────────────
if (CURRENT_USER) {
  const initials = CURRENT_USER.name
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  DOM.userMenuName.textContent = CURRENT_USER.name;
  DOM.dropdownUserName.textContent = CURRENT_USER.name;

  // Load profile photo from MongoDB API
  fetch(`/api/profile/${CURRENT_USER.id}`)
    .then(r => r.json())
    .then(data => {
      if (data.success && data.profile && data.profile.photo) {
        DOM.userAvatarInitials.innerHTML =
          `<img src="${data.profile.photo}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      } else {
        DOM.userAvatarInitials.textContent = initials;
      }
    })
    .catch(() => { DOM.userAvatarInitials.textContent = initials; });
}

DOM.userMenuBtn.addEventListener("click", e => {
  e.stopPropagation();
  DOM.userMenuBtn.classList.toggle("open");
});
document.addEventListener("click", () =>
  DOM.userMenuBtn.classList.remove("open"),
);
DOM.logoutBtn.addEventListener("click", logout);

// ─── Search Radius Stepper (− / +) ───────────────────────────
const RADIUS_STEPS = [1000, 2000, 5000, 10000, 15000, 20000]; // metres
let radiusStepIdx = 3; // default → 10 km

function setSearchRadius(idx) {
  radiusStepIdx = Math.max(0, Math.min(RADIUS_STEPS.length - 1, idx));
  const newRadius = RADIUS_STEPS[radiusStepIdx];
  state.searchRadius = newRadius;
  const label = (newRadius / 1000) + " km";
  if (DOM.radiusStepDisplay)   DOM.radiusStepDisplay.textContent  = label;
  if (DOM.searchRadiusDisplay) DOM.searchRadiusDisplay.textContent = label;
  // Disable buttons at boundaries
  if (DOM.radiusDecBtn) DOM.radiusDecBtn.disabled = radiusStepIdx === 0;
  if (DOM.radiusIncBtn) DOM.radiusIncBtn.disabled = radiusStepIdx === RADIUS_STEPS.length - 1;
  updateSearchRadiusCircle();
  fetchNearbyServices(state.lat, state.lng, newRadius);
  showToast("Search radius set to " + label + " — refreshing...", "info", 2000);
}

if (DOM.radiusDecBtn) DOM.radiusDecBtn.addEventListener("click", () => setSearchRadius(radiusStepIdx - 1));
if (DOM.radiusIncBtn) DOM.radiusIncBtn.addEventListener("click", () => setSearchRadius(radiusStepIdx + 1));

// ─── Google Maps Light Style ─────────────────────────────────
const LIGHT_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f8faff" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#334155" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#c7d2e8" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#1e3a5f" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#e8eef8" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#64748b" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#cfe8d4" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#3a7a50" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#dde4f0" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#334155" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#fde68a" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#fbbf24" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#1e3a5f" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#f0f4ff" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#e2e8f5" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#64748b" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#bfdbfe" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#3b6fa0" }],
  },
];

// ─── Google Maps Dark Style ───────────────────────────────────
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0a0f1e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b8fa8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#020510" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1a2744" }],
  },
  {
    featureType: "administrative.land_parcel",
    elementType: "labels.text.fill",
    stylers: [{ color: "#344e6b" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#0d1626" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4a7090" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#071220" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#2a5a40" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#1a2744" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#0d1626" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#8090a8" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#1e3060" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#0a1830" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#a0b8d0" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#0d1626" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4a6a8a" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#020d1a" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#1a3a5c" }],
  },
];

// ─── Map & Markers ────────────────────────────────────────────
let map = null;
let placesService = null;
let directionsService = null;
let directionsRenderer = null;
let deviceMarker = null;
let trailPolyline = null;
let sosCircle = null;
let searchRadiusCircle = null;
let infoWindow = null;
let facilityMarkers = { hospitals: [], police: [] };

// ─── Google Maps Callback ─────────────────────────────────────
window.initMap = function () {
  const initTheme = localStorage.getItem("seap_theme") || "dark";
  const initStyle = initTheme === "light" ? LIGHT_MAP_STYLE : DARK_MAP_STYLE;
  const initBg    = initTheme === "light" ? "#f8faff" : "#020510";

  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: state.lat, lng: state.lng },
    zoom: 15,
    styles: initStyle,
    disableDefaultUI: false,
    zoomControl: true,
    zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: "greedy",
    backgroundColor: initBg,
  });

  // Sync InfoWindow style to initial theme
  const iwStyle = document.getElementById("seap-iw-style");
  if (iwStyle && initTheme === "light") {
    iwStyle.textContent = `
      .gm-style .gm-style-iw-c {
        background: #ffffff !important;
        border: 1px solid rgba(37,99,235,0.2) !important;
        border-radius: 12px !important;
        box-shadow: 0 4px 20px rgba(15,23,42,0.12) !important;
        padding: 0 !important;
      }
      .gm-style .gm-style-iw-d { overflow: auto !important; }
      .gm-style .gm-style-iw-t::after { background: #ffffff !important; box-shadow: none !important; }
      .gm-style-iw-chr { display: none !important; }
      .gm-ui-hover-effect { display: none !important; }
    `;
  }

  infoWindow = new google.maps.InfoWindow();
  placesService = new google.maps.places.PlacesService(map);
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map,
    suppressMarkers: false,
    polylineOptions: {
      strokeColor: "#00ff88",
      strokeWeight: 5,
      strokeOpacity: 0.85,
    },
  });

  map.addListener("zoom_changed", () => {
    DOM.mapZoomLevel.textContent = map.getZoom();
  });

  // Get real GPS location from browser first
  startRealGeoTracking();

  // Start IoT polling
  fetchIoTLocation();
  iotFetchInterval = setInterval(fetchIoTLocation, 3000);
};

// ─── Real Browser Geolocation ─────────────────────────────────
let geoWatchId = null;

function startRealGeoTracking() {
  if (!navigator.geolocation) {
    showToast("Geolocation not supported by browser", "warning", 4000);
    return;
  }

  // One-time high-accuracy fix first
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      pushRealLocation(lat, lng);
      // Center map immediately on real location
      if (map) {
        map.panTo({ lat, lng });
        map.setZoom(16);
      }
      // Update state and re-fetch nearby services for real location
      state.lat = lat;
      state.lng = lng;
      state.mapReady = true;
      hideMapLoading();
      updateSearchRadiusCircle();
      fetchNearbyServices(lat, lng);
      showToast(
        `📍 Real GPS locked (±${Math.round(accuracy)}m)`,
        "success",
        3000,
      );
    },
    err => {
      console.warn("Geolocation error:", err.message);
      if (err.code === 1) {
        showToast(
          "Location permission denied — showing simulated location",
          "warning",
          5000,
        );
      } else {
        showToast(
          "GPS unavailable — showing simulated location",
          "warning",
          4000,
        );
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  );

  // Continuous tracking — update every time the device moves
  geoWatchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      pushRealLocation(lat, lng);
    },
    err => console.warn("Watch position error:", err.message),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 },
  );
}

// ─── Real System Battery ──────────────────────────────────────
let realBatteryLevel = null; // 0–100 or null if unavailable

async function startBatteryTracking() {
  if (!navigator.getBattery) return;
  try {
    const bat = await navigator.getBattery();

    function applyBattery() {
      realBatteryLevel = Math.round(bat.level * 100);
      const val = realBatteryLevel;

      DOM.batteryPct.textContent = val + "%";
      DOM.batteryBar.style.width = val + "%";

      // Color based on level
      if (val < 20) {
        DOM.batteryBar.style.background = "var(--danger)";
        DOM.batteryBar.style.boxShadow = "0 0 8px var(--danger)";
      } else if (val < 40) {
        DOM.batteryBar.style.background = "var(--warning)";
        DOM.batteryBar.style.boxShadow = "0 0 8px var(--warning)";
      } else {
        DOM.batteryBar.style.background = "";
        DOM.batteryBar.style.boxShadow = "";
      }
    }

    applyBattery();
    bat.addEventListener("levelchange", applyBattery);
    bat.addEventListener("chargingchange", applyBattery);
  } catch (e) {
    console.warn("Battery API unavailable:", e.message);
  }
}
startBatteryTracking();

async function pushRealLocation(lat, lng) {
  try {
    const body = { lat, lng };
    if (realBatteryLevel !== null) body.battery = realBatteryLevel;
    await fetch("/api/iot/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn("Failed to push real location:", err.message);
  }
}

// ─── SVG Marker Icons ─────────────────────────────────────────
function deviceIconUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="46" height="46" viewBox="0 0 46 46">
    <circle cx="23" cy="23" r="22" fill="none" stroke="rgba(0,245,255,0.6)" stroke-width="1.5">
      <animate attributeName="r" from="14" to="22" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="1" to="0" dur="2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="23" cy="23" r="13" fill="url(#dg)" stroke="white" stroke-width="2.5"/>
    <text x="23" y="27" text-anchor="middle" font-size="12">📍</text>
    <defs>
      <radialGradient id="dg"><stop offset="0%" stop-color="#00f5ff"/><stop offset="100%" stop-color="#0099cc"/></radialGradient>
    </defs>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

function hospitalIconUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
    <circle cx="22" cy="22" r="20" fill="#cc4400" stroke="rgba(255,140,80,0.9)" stroke-width="2"/>
    <text x="22" y="20" text-anchor="middle" font-size="9" font-weight="800" fill="rgba(255,200,160,0.9)" font-family="Arial,sans-serif" letter-spacing="1">HOSP</text>
    <text x="22" y="31" text-anchor="middle" font-size="14" fill="white">🏥</text>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

function policeIconUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
    <circle cx="22" cy="22" r="20" fill="#0044bb" stroke="rgba(80,160,255,0.9)" stroke-width="2"/>
    <text x="22" y="20" text-anchor="middle" font-size="9" font-weight="800" fill="rgba(160,200,255,0.9)" font-family="Arial,sans-serif" letter-spacing="1">POLICE</text>
    <text x="22" y="31" text-anchor="middle" font-size="14" fill="white">🚔</text>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

// ─── Update Device Marker ─────────────────────────────────────
function updateDeviceMarker(lat, lng) {
  const pos = { lat, lng };

  if (!deviceMarker) {
    deviceMarker = new google.maps.Marker({
      position: pos,
      map,
      icon: {
        url: deviceIconUrl(),
        scaledSize: new google.maps.Size(46, 46),
        anchor: new google.maps.Point(23, 23),
      },
      zIndex: 1000,
      title: "IoT Device",
    });

    deviceMarker.addListener("click", () => {
      infoWindow.setContent(buildDevicePopup(lat, lng));
      infoWindow.open(map, deviceMarker);
    });
  } else {
    deviceMarker.setPosition(pos);
    // Keep radius circle centred on device
    if (searchRadiusCircle) searchRadiusCircle.setCenter(pos);
  }

  // Trail (last 20 positions)
  state.locationHistory.push({ lat, lng });
  if (state.locationHistory.length > 20) state.locationHistory.shift();

  if (trailPolyline) {
    trailPolyline.setPath(state.locationHistory);
  } else {
    trailPolyline = new google.maps.Polyline({
      path: state.locationHistory,
      map,
      strokeColor: "rgba(0,245,255,0.5)",
      strokeWeight: 2,
      strokeOpacity: 1,
      icons: [
        {
          icon: {
            path: google.maps.SymbolPath.FORWARD_OPEN_ARROW,
            scale: 2,
            strokeColor: "#00f5ff",
            strokeOpacity: 0.7,
          },
          repeat: "60px",
        },
      ],
    });
  }
}

function buildDevicePopup(lat, lng) {
  return `<div style="background:#050d1e;color:#e8f4ff;padding:12px;min-width:200px;font-family:Rajdhani,sans-serif;border-radius:8px;">
    <div style="font-family:Orbitron,monospace;color:#00f5ff;font-size:0.65rem;letter-spacing:2px;margin-bottom:8px;">📡 IoT DEVICE</div>
    <div style="font-size:0.8rem;color:#a0b8d8;">ID: <span style="color:#00f5ff;">${state.deviceId || "IOT-001"}</span></div>
    <div style="font-size:0.88rem;margin-top:6px;">
      Lat: <b style="color:#00ff88;">${lat.toFixed(6)}</b><br/>
      Lng: <b style="color:#00ff88;">${lng.toFixed(6)}</b>
    </div>
  </div>`;
}

// ─── Hide Map Loading Overlay ──────────────────────────────────
function hideMapLoading() {
  if (DOM.mapLoadingOverlay) {
    DOM.mapLoadingOverlay.style.opacity = "0";
    setTimeout(() => {
      DOM.mapLoadingOverlay.style.display = "none";
    }, 500);
  }
}

// ─── IoT Location Polling ─────────────────────────────────────
async function fetchIoTLocation() {
  try {
    const res = await fetch("/api/iot/location");
    const data = await res.json();
    if (!data.success) return;

    const { lat, lng, deviceId, speed, signal, battery, lastUpdate } =
      data.data;

    state.prevLat = state.lat;
    state.prevLng = state.lng;
    state.lat = parseFloat(lat);
    state.lng = parseFloat(lng);
    state.lastFetchTime = new Date();
    state.deviceId = deviceId;

    DOM.coordLat.textContent = `${Math.abs(state.lat).toFixed(6)}°${state.lat >= 0 ? "N" : "S"}`;
    DOM.coordLng.textContent = `${Math.abs(state.lng).toFixed(6)}°${state.lng >= 0 ? "E" : "W"}`;
    if (DOM.deviceId) DOM.deviceId.textContent = deviceId;
    DOM.deviceSpeed.textContent = Math.round(speed || 0);
    DOM.deviceSignal.textContent = signal || "Strong";

    // Only use server battery if real device battery not available
    if (realBatteryLevel === null) {
      const battVal = parseFloat(battery).toFixed(0);
      DOM.batteryPct.textContent = battVal + "%";
      DOM.batteryBar.style.width = battVal + "%";
      if (battVal < 20) {
        DOM.batteryBar.style.background = "var(--danger)";
        DOM.batteryBar.style.boxShadow = "0 0 8px var(--danger)";
      } else if (battVal < 40) {
        DOM.batteryBar.style.background = "var(--warning)";
        DOM.batteryBar.style.boxShadow = "0 0 8px var(--warning)";
      }
    }

    const updateDate = new Date(lastUpdate);
    DOM.lastUpdateTime.textContent = updateDate.toLocaleTimeString();
    DOM.updateTimeAgo.textContent = "just now";

    if (map) updateDeviceMarker(state.lat, state.lng);

    // Live navigation update — recalculate if moved >10m
    if (navState.active) {
      const movedEnough =
        navState.lastUpdateLat === null ||
        getDistanceKm(
          state.lat,
          state.lng,
          navState.lastUpdateLat,
          navState.lastUpdateLng,
        ) > 0.01;
      if (movedEnough) {
        navState.lastUpdateLat = state.lat;
        navState.lastUpdateLng = state.lng;
        updateLiveNavPanel();
      }
    }

    if (!state.mapReady && map) {
      map.panTo({ lat: state.lat, lng: state.lng });
      map.setZoom(15);
      state.mapReady = true;
      hideMapLoading();
      updateSearchRadiusCircle();
      fetchNearbyServices(state.lat, state.lng);
    }
  } catch (err) {
    console.warn("IoT fetch error:", err.message);
    showToast("IoT connection error. Retrying...", "warning", 3000);
  }
}

// ─── Draw / Update search-radius circle on map ───────────────
function updateSearchRadiusCircle() {
  if (!map) return;
  if (searchRadiusCircle) searchRadiusCircle.setMap(null);
  searchRadiusCircle = new google.maps.Circle({
    map,
    center: { lat: state.lat, lng: state.lng },
    radius: state.searchRadius,
    strokeColor: "#00f5ff",
    strokeOpacity: 0.55,
    strokeWeight: 1.5,
    fillColor: "#00f5ff",
    fillOpacity: 0.05,
    clickable: false,
  });
}

// ─── Fetch Nearby Services (Google Places API) ────────────────
function fetchNearbyServices(lat, lng, radius = state.searchRadius) {
  showToast("Scanning nearby emergency services...", "info", 2500);

  // Try Google Places API first; fallback to Overpass (OpenStreetMap real data)
  if (placesService) {
    // Run 3 searches: hospital type, multispecialty/emergency keyword, police
    let hospitalsTypeResult   = null;  // type="hospital"
    let hospitalsKwResult     = null;  // keyword="multispecialty hospital emergency trauma"
    let policeResult          = null;

    function checkDone() {
      if (hospitalsTypeResult === null || hospitalsKwResult === null || policeResult === null) return;

      // Merge & deduplicate hospital results — big hospitals appear in both
      const seenIds = new Set();
      const mergedRaw = [...(hospitalsTypeResult || []), ...(hospitalsKwResult || [])];
      const uniqueRaw = mergedRaw.filter(p => {
        if (!p.geometry || seenIds.has(p.place_id)) return false;
        seenIds.add(p.place_id);
        return true;
      });

      // Type-priority score: pure "hospital" type gets priority over clinics
      function hospitalPriority(p) {
        const t = (p.types || []);
        if (t.includes("hospital")) return 0;
        if (t.includes("health"))   return 1;
        return 2;
      }

      const hospitals = uniqueRaw
        .map(p => ({
          id: p.place_id,
          name: p.name,
          lat: p.geometry.location.lat(),
          lng: p.geometry.location.lng(),
          phone: null,
          address: p.vicinity || "",
          type: "hospital",
          dist: getDistanceKm(lat, lng, p.geometry.location.lat(), p.geometry.location.lng()),
          _priority: hospitalPriority(p),
        }))
        // Sort: hospital-type first, then by distance — big hospitals stay visible
        .sort((a, b) => a._priority - b._priority || a.dist - b.dist)
        .slice(0, 30);

      const police = (policeResult || [])
        .filter(p => p.geometry)
        .map(p => ({
          id: p.place_id,
          name: p.name,
          lat: p.geometry.location.lat(),
          lng: p.geometry.location.lng(),
          phone: null,
          address: p.vicinity || "",
          type: "police",
          dist: getDistanceKm(lat, lng, p.geometry.location.lat(), p.geometry.location.lng()),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 20);

      if (hospitals.length === 0 && police.length === 0) {
        // Places API returned nothing — use Overpass real data
        fetchOverpassServices(lat, lng, radius);
        return;
      }

      // Enrich all facilities with phone numbers via getDetails
      const allFacilities = [...hospitals, ...police];
      let enriched = 0;
      const totalToEnrich = allFacilities.length;

      function onEnrichDone() {
        enriched++;
        if (enriched === totalToEnrich) {
          state.hospitals = hospitals;
          state.policeStations = police;
          applyFacilityResults();
        }
      }

      if (totalToEnrich === 0) {
        state.hospitals = hospitals;
        state.policeStations = police;
        applyFacilityResults();
        return;
      }

      allFacilities.forEach(f => {
        placesService.getDetails(
          {
            placeId: f.id,
            fields: ["formatted_phone_number", "international_phone_number"],
          },
          (place, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && place) {
              f.phone =
                place.formatted_phone_number ||
                place.international_phone_number ||
                null;
            } else if (status !== google.maps.places.PlacesServiceStatus.OK) {
              console.warn(`[Places getDetails] ${f.name}: status = ${status}`);
            }
            onEnrichDone();
          },
        );
      });
    }

    // Search 1: type="hospital" — finds all hospitals registered on Google Maps
    placesService.nearbySearch(
      { location: { lat, lng }, radius, type: "hospital" },
      (results, status) => {
        hospitalsTypeResult = status === google.maps.places.PlacesServiceStatus.OK ? results : [];
        checkDone();
      },
    );

    // Search 2: keyword search — specifically targets big multispecialty/emergency hospitals
    placesService.nearbySearch(
      { location: { lat, lng }, radius, keyword: "multispecialty hospital emergency trauma" },
      (results, status) => {
        hospitalsKwResult = status === google.maps.places.PlacesServiceStatus.OK ? results : [];
        checkDone();
      },
    );

    // Search 3: police stations
    placesService.nearbySearch(
      { location: { lat, lng }, radius, type: "police" },
      (results, status) => {
        policeResult =
          status === google.maps.places.PlacesServiceStatus.OK ? results : [];
        checkDone();
      },
    );
  } else {
    fetchOverpassServices(lat, lng, radius);
  }
}

// ─── Overpass API (OpenStreetMap) — real data, no billing needed ──────────────
async function fetchOverpassServices(lat, lng, radius = 10000) {
  const query = `
    [out:json][timeout:45];
    (
      node["amenity"="hospital"](around:${radius},${lat},${lng});
      way["amenity"="hospital"](around:${radius},${lat},${lng});
      relation["amenity"="hospital"](around:${radius},${lat},${lng});
      node["healthcare"="hospital"](around:${radius},${lat},${lng});
      way["healthcare"="hospital"](around:${radius},${lat},${lng});
      node["healthcare"="emergency"](around:${radius},${lat},${lng});
      way["healthcare"="emergency"](around:${radius},${lat},${lng});
      node["emergency"="yes"]["amenity"="hospital"](around:${radius},${lat},${lng});
      node["hospital"="yes"](around:${radius},${lat},${lng});
      way["hospital"="yes"](around:${radius},${lat},${lng});
      node["amenity"="clinic"](around:${radius},${lat},${lng});
      way["amenity"="clinic"](around:${radius},${lat},${lng});
      node["healthcare"="clinic"](around:${radius},${lat},${lng});
      node["amenity"="doctors"](around:${radius},${lat},${lng});
      node["amenity"="police"](around:${radius},${lat},${lng});
      way["amenity"="police"](around:${radius},${lat},${lng});
    );
    out center;
  `;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!res.ok) throw new Error("Overpass unavailable");
    const data = await res.json();

    const hospitals = [];
    const police = [];

    (data.elements || []).forEach(el => {
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (!elLat || !elLng) return;
      // Determine facility type — check both amenity & healthcare tags
      const amenityTag = el.tags?.amenity || "";
      const healthcareTag = el.tags?.healthcare || "";
      const facilityType = amenityTag || healthcareTag || "";

      // Priority: amenity=hospital > healthcare=hospital/emergency > clinic > doctors
      function overpassHospitalPriority(amenity, healthcare) {
        if (amenity === "hospital") return 0;
        if (healthcare === "hospital" || healthcare === "emergency") return 1;
        if (amenity === "clinic"  || healthcare === "clinic") return 2;
        return 3;
      }
      const item = {
        id: el.id,
        name:
          el.tags?.name ||
          el.tags?.["name:en"] ||
          el.tags?.["official_name"] ||
          null,
        lat: elLat,
        lng: elLng,
        phone:
          el.tags?.phone ||
          el.tags?.["contact:phone"] ||
          el.tags?.["contact:mobile"] ||
          el.tags?.["phone:mobile"] ||
          el.tags?.["contact:telephone"] ||
          el.tags?.telephone ||
          null,
        address:
          el.tags?.["addr:full"] ||
          el.tags?.["addr:street"] ||
          el.tags?.["addr:suburb"] ||
          el.tags?.["addr:city"] ||
          "",
        type: facilityType,
        dist: getDistanceKm(lat, lng, elLat, elLng),
        _priority: overpassHospitalPriority(amenityTag, healthcareTag),
      };
      // Skip entries with no name (unimportant unnamed nodes)
      if (!item.name) return;
      if (
        facilityType === "hospital" ||
        facilityType === "clinic" ||
        facilityType === "doctors"
      ) {
        hospitals.push(item);
      } else if (facilityType === "police") {
        police.push(item);
      }
    });

    // Sort hospitals: big hospitals (amenity=hospital) first, then by distance
    hospitals.sort((a, b) => (a._priority - b._priority) || (a.dist - b.dist));
    police.sort((a, b) => a.dist - b.dist);
    // Filter out entries with no useful name, keep proper facilities
    const knownHospitals = hospitals.filter(h => h.name && h.name !== "Unknown Facility");
    const knownPolice = police.filter(p => p.name && p.name !== "Unknown Facility");
    // If we have named ones, prefer them; otherwise use all — limit increased to 30
    state.hospitals = (knownHospitals.length > 0 ? knownHospitals : hospitals).slice(0, 30);
    state.policeStations = (knownPolice.length > 0 ? knownPolice : police).slice(0, 20);
    applyFacilityResults();
  } catch (err) {
    console.warn("Overpass error:", err.message);
    showToast("Could not load real data — retrying in 10s", "warning", 3000);
    setTimeout(() => fetchOverpassServices(lat, lng, radius), 10000);
  }
}

// ─── Saved Phone Numbers Cache (placeId → phone) ────────────
const savedPhones = {};   // populated from DB on each facility refresh

async function applyFacilityResults() {
  // 1. Fetch user-added phone numbers from DB for all current facilities
  const allFacilities = [...state.hospitals, ...state.policeStations];
  if (allFacilities.length > 0) {
    try {
      const res = await fetch("/api/place-phones/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeIds: allFacilities.map(f => String(f.id)) }),
      });
      const data = await res.json();
      if (data.success) {
        Object.assign(savedPhones, data.phones);
        // Merge into facility objects so phoneButtonHTML picks them up
        allFacilities.forEach(f => {
          if (!f.phone && savedPhones[String(f.id)]) {
            f.phone = savedPhones[String(f.id)];
            f.phoneSavedByUser = true;
          }
        });
      }
    } catch (e) { /* non-fatal */ }
  }

  // 2. Render with distances so UI is not blocked
  renderFacilityCards();
  renderFacilityMarkers();
  DOM.hospitalCount.textContent = state.hospitals.length;
  DOM.policeCount.textContent = state.policeStations.length;
  DOM.hospitalCountBadge.textContent = state.hospitals.length;
  DOM.policeCountBadge.textContent = state.policeStations.length;
  showToast(
    `Found ${state.hospitals.length} hospitals, ${state.policeStations.length} police stations`,
    "success",
  );

  // 3. Enrich with real road distances progressively in the background
  enrichWithRoadDistances([...state.hospitals, ...state.policeStations], state.lat, state.lng);
}

// ─── Phone button HTML helper ───────────────────────────────
function phoneButtonHTML(f) {
  if (f.phone) {
    const savedBadge = f.phoneSavedByUser
      ? ` <span style="font-size:0.55rem;color:var(--success,#00ff88);flex-shrink:0;">✔</span>`
      : "";
    return `<a href="tel:${f.phone}" class="facility-action-btn call"><span style="flex-shrink:0;">📞</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.phone}</span>${savedBadge}</a>`;
  }
  // No phone — show Find Number only (Edit button is always added separately)
  const nameEsc = encodeURIComponent(f.name + ' phone number contact');
  return `<a href="https://www.google.com/search?q=${nameEsc}" target="_blank" rel="noopener"
     class="facility-action-btn call" style="opacity:0.85;"><span style="flex-shrink:0;">🔍</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Find Number</span></a>`;
}

// ─── Add Phone Modal helpers ──────────────────────────────────
let _addPhonePlaceId   = null;
let _addPhonePlaceName = null;

function openAddPhoneModal(placeId, placeName) {
  _addPhonePlaceId   = placeId;
  _addPhonePlaceName = placeName;
  const overlay = document.getElementById("addPhoneOverlay");
  const nameEl  = document.getElementById("addPhoneplaceName");
  const input   = document.getElementById("addPhoneInput");
  nameEl.textContent = placeName;
  // Pre-fill with already-saved number if present
  input.value = savedPhones[placeId] || "";
  overlay.style.display = "flex";
  setTimeout(() => input.focus(), 80);
}

function closeAddPhoneModal() {
  document.getElementById("addPhoneOverlay").style.display = "none";
  _addPhonePlaceId   = null;
  _addPhonePlaceName = null;
}

async function saveAddedPhone() {
  const phone = document.getElementById("addPhoneInput").value.trim();
  if (!phone) { showToast("Please enter a phone number", "warning", 2500); return; }
  if (!_addPhonePlaceId) return;

  try {
    const res = await fetch("/api/place-phones/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placeId:   _addPhonePlaceId,
        placeName: _addPhonePlaceName,
        phone,
        userId: CURRENT_USER?.id || "",
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    // Update local cache
    savedPhones[_addPhonePlaceId] = phone;

    // Update facility object so the card re-renders correctly
    const all = [...state.hospitals, ...state.policeStations];
    const fac = all.find(f => String(f.id) === _addPhonePlaceId);
    if (fac) {
      fac.phone = phone;
      fac.phoneSavedByUser = true;
    }

    // Live-update just the phone slot in the DOM (no full re-render)
    const slot = document.querySelector(`[data-phone-slot="${_addPhonePlaceId}"]`);
    if (slot && fac) slot.innerHTML = phoneButtonHTML(fac);

    showToast(`Number saved for ${_addPhonePlaceName}`, "success", 2500);
    closeAddPhoneModal();
  } catch (err) {
    showToast("Failed to save number: " + err.message, "error", 3000);
  }
}

// Close modal on overlay click
document.getElementById("addPhoneOverlay")?.addEventListener("click", e => {
  if (e.target === document.getElementById("addPhoneOverlay")) closeAddPhoneModal();
});

// ─── Distance Calculator (Haversine — straight-line fallback) ────────────────
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Format seconds to human-readable duration ───────────────
function formatDuration(secs) {
  if (secs < 60) return `${Math.round(secs)} sec`;
  if (secs < 3600) return `${Math.round(secs / 60)} min`;
  return `${Math.floor(secs / 3600)}h ${Math.round((secs % 3600) / 60)}m`;
}

// ─── Enrich facilities with real road distances via OSRM Route API ───────────
// Runs sequentially in the background — updates each card live as data arrives
async function enrichWithRoadDistances(facilities, originLat, originLng) {
  if (!facilities || facilities.length === 0) return;

  for (const f of facilities) {
    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${originLng},${originLat};${f.lng},${f.lat}` +
        `?overview=false`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.code === "Ok" && data.routes?.[0]) {
        const distM = data.routes[0].distance;
        const durS  = data.routes[0].duration;
        if (distM != null && distM > 10) {
          f.dist = distM / 1000; // metres → km
          // Live-update the card distance shown in the sidebar
          updateCardDistDOM(f);
        }
        if (durS != null && durS > 0) f.duration = durS;
      }
    } catch (err) {
      // silently keep Haversine fallback for this facility
    }
    // Small delay between requests to avoid rate-limiting
    await new Promise(r => setTimeout(r, 120));
  }
}

// Update just the distance text in an already-rendered facility card
function updateCardDistDOM(f) {
  const card = document.querySelector(`.facility-card[data-id="${f.id}"]`);
  if (!card) return;
  const distEl = card.querySelector(".dist-value");
  if (distEl) distEl.textContent = `${f.dist.toFixed(2)} km`;
  // Update duration tag if present
  if (f.duration) {
    const existing = card.querySelector(".dist-duration");
    if (existing) {
      existing.textContent = `\u00b7 ${formatDuration(f.duration)}`;
    } else {
      const span = document.createElement("span");
      span.className = "dist-duration";
      span.style.cssText = "color:var(--text-muted);font-size:0.68rem;";
      span.textContent = `\u00b7 ${formatDuration(f.duration)}`;
      distEl.insertAdjacentElement("afterend", span);
    }
  }
}

// ─── Render Facility Cards ────────────────────────────────────
function renderFacilityCards() {
  renderList(
    DOM.hospitalsList,
    state.hospitals,
    "hospital",
    "🏥",
    "var(--accent-orange)",
  );
  renderList(DOM.policeList, state.policeStations, "police", "🚔", "#0096ff");
}

function renderList(container, items, type, icon, color) {
  if (items.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:30px;color:var(--text-muted);
        font-family:var(--font-tech);font-size:0.65rem;letter-spacing:2px;">
        NO ${type.toUpperCase()}S FOUND NEARBY
      </div>`;
    return;
  }

  container.innerHTML = items
    .map(
      (f, idx) => {
        const isLight = document.body.classList.contains("light-mode");
        const nearBg  = isLight ? "rgba(5,150,105,0.1)"  : "rgba(0,255,136,0.15)";
        const nearBdr = isLight ? "rgba(5,150,105,0.3)"  : "rgba(0,255,136,0.4)";
        const nearClr = isLight ? "#059669" : "var(--success)";
        return `
    <div class="facility-card ${type}-card" data-id="${f.id}" data-lat="${f.lat}" data-lng="${f.lng}">
      <div class="facility-card-top">
        <div class="facility-type-icon">${icon}</div>
        <div class="facility-info">
          <div class="facility-name" title="${f.name}">${f.name}</div>
          <div class="facility-distance">
            <span>📍</span>
            <span class="dist-value">${f.dist.toFixed(2)} km</span>
            ${f.duration ? `<span style="color:var(--text-muted);font-size:0.68rem;">&nbsp;· ${formatDuration(f.duration)}</span>` : ""}
            away
            ${idx === 0 ? `<span style="margin-left:6px;padding:1px 8px;background:${nearBg};border:1px solid ${nearBdr};border-radius:10px;font-size:0.58rem;color:${nearClr};">NEAREST</span>` : ""}
          </div>
          ${f.address ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📌 ${f.address}</div>` : ""}
        </div>
      </div>
      <div class="facility-actions">
        <div class="facility-actions-row">
          <span data-phone-slot="${f.id}">${phoneButtonHTML(f)}</span>
          <button class="facility-action-btn navigate" onclick="navigateToFacility(${f.lat}, ${f.lng}, '${f.name.replace(/'/g, "\\'")}')">
            🗺 Navigate
          </button>
        </div>
        <button class="facility-action-btn edit-action-btn"
          onclick="openAddPhoneModal('${String(f.id)}','${f.name.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')" type="button">
          ✏️ Edit Number
        </button>
      </div>
    </div>
  `;
      },
    )
    .join("");

  container.querySelectorAll(".facility-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.closest(".facility-action-btn")) return;
      const lat = parseFloat(card.dataset.lat);
      const lng = parseFloat(card.dataset.lng);
      if (map) {
        map.panTo({ lat, lng });
        map.setZoom(17);
      }
    });
  });
}

// ─── Navigate to Facility (OSRM free routing + live HUD) ─────
let routePolyline = null;

window.navigateToFacility = async function (destLat, destLng, name) {
  infoWindow.close();

  // Set nav state
  navState.active = true;
  navState.destLat = destLat;
  navState.destLng = destLng;
  navState.destName = name;
  navState.lastUpdateLat = null;
  navState.lastUpdateLng = null;

  showNavHUD(name, "--", "--", "Calculating...");
  showToast(`🗺 Navigating to ${name}...`, "info", 2000);

  await updateLiveNavPanel();
};

// Called on every location update while navigating
async function updateLiveNavPanel() {
  if (!navState.active) return;
  const { destLat, destLng, destName } = navState;
  const oLat = state.lat;
  const oLng = state.lng;

  // Check if arrived (within 30m)
  const distNow = getDistanceKm(oLat, oLng, destLat, destLng);
  if (distNow < 0.03) {
    updateNavHUD(destName, "0 m", "0 min", "🎯 You have arrived!");
    clearRoutePolyline();
    showToast(`🎯 Arrived at ${destName}!`, "success", 6000);
    sendBrowserNotif("🎯 Arrived!", `You have arrived at ${destName}.`);
    navState.active = false;
    return;
  }

  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${oLng},${oLat};${destLng},${destLat}` +
      `?overview=full&geometries=geojson`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) throw new Error("No route");

    const route = data.routes[0];
    const coords = route.geometry.coordinates.map(([lng, lat]) => ({
      lat,
      lng,
    }));
    const distM = route.distance;
    const secs = route.duration;

    // Format distance
    const distStr =
      distM >= 1000
        ? `${(distM / 1000).toFixed(1)} km`
        : `${Math.round(distM)} m`;

    // Format time
    let timeStr;
    if (secs < 60) timeStr = `${Math.round(secs)} sec`;
    else if (secs < 3600) timeStr = `${Math.round(secs / 60)} min`;
    else
      timeStr = `${Math.floor(secs / 3600)}h ${Math.round((secs % 3600) / 60)}m`;

    // ETA
    const eta = new Date(Date.now() + secs * 1000);
    const etaStr = eta.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Redraw route polyline
    clearRoutePolyline();
    routePolyline = new google.maps.Polyline({
      path: coords,
      strokeColor: "#00ff88",
      strokeOpacity: 0.9,
      strokeWeight: 6,
      map,
      zIndex: 200,
    });

    // First call: fit bounds
    if (navState.lastUpdateLat === null || navState.firstFit !== false) {
      navState.firstFit = false;
      const bounds = new google.maps.LatLngBounds();
      coords.forEach(c => bounds.extend(c));
      map.fitBounds(bounds, { top: 80, right: 60, bottom: 160, left: 60 });
    }

    updateNavHUD(destName, distStr, timeStr, `ETA ${etaStr}`);
  } catch (err) {
    console.warn("Nav update error:", err.message);
    // Fallback: show straight-line distance
    const distStr =
      distNow >= 1
        ? `~${distNow.toFixed(1)} km`
        : `~${Math.round(distNow * 1000)} m`;
    updateNavHUD(destName, distStr, "--", "Recalculating...");
  }
}

// ─── Nav HUD Panel ────────────────────────────────────────────
function showNavHUD(name, dist, time, eta) {
  clearNavHUD();
  const isLight = document.body.classList.contains("light-mode");
  const mapEl = document.getElementById("map");
  mapEl.style.position = "relative";

  const hud = document.createElement("div");
  hud.id = "navHUD";
  hud.innerHTML = `
    <div id="navHUD-inner">
      <div id="navHUD-dest">🗺 <span id="navHUD-name">${name}</span></div>
      <div id="navHUD-stats">
        <div class="navHUD-stat">
          <div id="navHUD-dist">${dist}</div>
          <div class="navHUD-label">DISTANCE</div>
        </div>
        <div class="navHUD-divider"></div>
        <div class="navHUD-stat">
          <div id="navHUD-time">${time}</div>
          <div class="navHUD-label">TIME LEFT</div>
        </div>
        <div class="navHUD-divider"></div>
        <div class="navHUD-stat">
          <div id="navHUD-eta">${eta}</div>
          <div class="navHUD-label">ETA</div>
        </div>
      </div>
      <button id="navHUD-cancel">✖ END</button>
    </div>`;

  // ── theme tokens ──
  const hudBg      = isLight ? "rgba(255,255,255,0.97)" : "rgba(5,13,30,0.97)";
  const hudBdr     = isLight ? "rgba(37,99,235,0.3)"    : "rgba(0,255,136,0.4)";
  const hudShadow  = isLight
    ? "0 4px 24px rgba(37,99,235,0.15), 0 2px 8px rgba(15,23,42,0.1)"
    : "0 0 24px rgba(0,255,136,0.25), 0 4px 20px rgba(0,0,0,0.6)";
  const destClr    = isLight ? "#2563eb"  : "#00ff88";
  const nameClr    = isLight ? "#0f172a"  : "#e8f4ff";
  const distClr    = isLight ? "#059669"  : "#00ff88";
  const timeClr    = isLight ? "#2563eb"  : "#00cfff";
  const etaClr     = isLight ? "#d97706"  : "#ffaa00";
  const labelClr   = isLight ? "#94a3b8"  : "#556";
  const dividerClr = isLight ? "rgba(37,99,235,0.15)"  : "rgba(0,255,136,0.2)";
  const cancelBg   = isLight ? "rgba(220,38,38,0.07)"  : "rgba(255,68,102,0.12)";
  const cancelClr  = isLight ? "#dc2626"  : "#ff4466";
  const cancelBdr  = isLight ? "rgba(220,38,38,0.25)"  : "rgba(255,68,102,0.4)";
  const cancelHov  = isLight ? "rgba(220,38,38,0.14)"  : "rgba(255,68,102,0.25)";

  const style = document.createElement("style");
  style.id = "navHUD-style";
  style.textContent = `
    #navHUD {
      position: absolute;
      bottom: 18px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      pointer-events: auto;
      animation: navFadeIn 0.4s ease;
    }
    @keyframes navFadeIn { from{opacity:0;transform:translateX(-50%) translateY(20px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
    #navHUD-inner {
      display: flex;
      align-items: center;
      gap: 14px;
      background: ${hudBg};
      border: 1px solid ${hudBdr};
      border-radius: 16px;
      padding: 12px 18px;
      box-shadow: ${hudShadow};
      font-family: Rajdhani, sans-serif;
      min-width: 380px;
      max-width: 90vw;
    }
    #navHUD-dest {
      font-family: Orbitron, monospace;
      font-size: 0.6rem;
      color: ${destClr};
      letter-spacing: 1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 130px;
    }
    #navHUD-name { color: ${nameClr}; font-family: Rajdhani,sans-serif; font-size:0.85rem; font-weight:600; }
    #navHUD-stats { display:flex; align-items:center; gap:10px; flex:1; justify-content:center; }
    .navHUD-stat { text-align:center; min-width:64px; }
    #navHUD-dist { font-family:Orbitron,monospace; font-size:1.1rem; color:${distClr}; font-weight:700; line-height:1; }
    #navHUD-time { font-family:Orbitron,monospace; font-size:1.1rem; color:${timeClr}; font-weight:700; line-height:1; }
    #navHUD-eta  { font-family:Orbitron,monospace; font-size:0.85rem; color:${etaClr}; font-weight:700; line-height:1; }
    .navHUD-label { font-size:0.55rem; color:${labelClr}; letter-spacing:1.5px; margin-top:3px; font-family:Orbitron,monospace; }
    .navHUD-divider { width:1px; height:36px; background:${dividerClr}; }
    #navHUD-cancel {
      background: ${cancelBg};
      color: ${cancelClr};
      border: 1px solid ${cancelBdr};
      border-radius: 10px;
      padding: 6px 14px;
      font-family: Orbitron,monospace;
      font-size: 0.65rem;
      letter-spacing: 1px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.2s;
    }
    #navHUD-cancel:hover { background: ${cancelHov}; }
  `;
  document.head.appendChild(style);
  mapEl.appendChild(hud);
  document.getElementById("navHUD-cancel").addEventListener("click", () => {
    clearRoute();
    showToast("Navigation ended", "info", 2000);
  });
}

function updateNavHUD(name, dist, time, eta) {
  const d = document.getElementById("navHUD-dist");
  const t = document.getElementById("navHUD-time");
  const e = document.getElementById("navHUD-eta");
  const n = document.getElementById("navHUD-name");
  if (d) d.textContent = dist;
  if (t) t.textContent = time;
  if (e) e.textContent = eta;
  if (n) n.textContent = name;
}

function clearNavHUD() {
  const h = document.getElementById("navHUD");
  const s = document.getElementById("navHUD-style");
  if (h) h.remove();
  if (s) s.remove();
}

function clearRoutePolyline() {
  if (routePolyline) {
    routePolyline.setMap(null);
    routePolyline = null;
  }
}

function clearRoute() {
  navState.active = false;
  navState.firstFit = true;
  clearRoutePolyline();
  clearNavHUD();
}

// ─── Render Facility Markers on Map ──────────────────────────
function makeLabeledMarker(position, iconUrl, labelText, isNearest) {
  // Short label: first 14 chars to keep it readable on map
  const shortLabel = labelText.length > 14 ? labelText.slice(0, 13) + "…" : labelText;
  return new google.maps.Marker({
    position,
    map,
    icon: {
      url: iconUrl,
      scaledSize: new google.maps.Size(isNearest ? 44 : 36, isNearest ? 44 : 36),
      anchor: new google.maps.Point(isNearest ? 22 : 18, isNearest ? 22 : 18),
      labelOrigin: new google.maps.Point(isNearest ? 22 : 18, isNearest ? 56 : 48),
    },
    label: {
      text: shortLabel,
      color: isNearest ? "#00ff88" : "#e8f4ff",
      fontSize: isNearest ? "11px" : "10px",
      fontWeight: isNearest ? "700" : "500",
      fontFamily: "Rajdhani, sans-serif",
    },
    title: labelText,
    zIndex: isNearest ? 600 : 500,
  });
}

function renderFacilityMarkers() {
  facilityMarkers.hospitals.forEach(m => m.setMap(null));
  facilityMarkers.police.forEach(m => m.setMap(null));
  facilityMarkers.hospitals = [];
  facilityMarkers.police = [];

  if (!map) return;

  if (state.activeFilter === "all" || state.activeFilter === "hospital") {
    state.hospitals.forEach((h, i) => {
      const marker = makeLabeledMarker(
        { lat: h.lat, lng: h.lng },
        hospitalIconUrl(),
        h.name,
        i === 0,
      );
      marker.addListener("click", () => {
        infoWindow.setContent(buildPopup(h, "🏥", "#ff6b35", i === 0));
        infoWindow.open(map, marker);
      });
      facilityMarkers.hospitals.push(marker);
    });
  }

  if (state.activeFilter === "all" || state.activeFilter === "police") {
    state.policeStations.forEach((p, i) => {
      const marker = makeLabeledMarker(
        { lat: p.lat, lng: p.lng },
        policeIconUrl(),
        p.name,
        i === 0,
      );
      marker.addListener("click", () => {
        infoWindow.setContent(buildPopup(p, "🚔", "#0096ff", i === 0));
        infoWindow.open(map, marker);
      });
      facilityMarkers.police.push(marker);
    });
  }
}

function buildPopup(facility, icon, color, isNearest) {
  const isLight = document.body.classList.contains("light-mode");

  // theme tokens
  const bg        = isLight ? "#ffffff"  : "#050d1e";
  const txt       = isLight ? "#0f172a"  : "#e8f4ff";
  const subTxt    = isLight ? "#64748b"  : "#7090b0";
  const distTxt   = isLight ? "#334155"  : "#a0c0e0";
  const wrapBdr   = isLight ? `rgba(37,99,235,0.18)` : `${color}44`;
  const nearBg    = isLight ? "rgba(5,150,105,0.1)"   : "rgba(0,255,136,0.15)";
  const nearBdr   = isLight ? "rgba(5,150,105,0.3)"   : "rgba(0,255,136,0.4)";
  const nearClr   = isLight ? "#059669"  : "#00ff88";
  const callBg    = isLight ? "rgba(5,150,105,0.07)"  : "rgba(0,255,136,0.1)";
  const callBdr   = isLight ? "rgba(5,150,105,0.25)"  : "rgba(0,255,136,0.3)";
  const callClr   = isLight ? "#059669"  : "#00ff88";
  const findBg    = isLight ? "rgba(234,88,12,0.07)"  : "rgba(255,170,0,0.08)";
  const findBdr   = isLight ? "rgba(234,88,12,0.25)"  : "rgba(255,170,0,0.3)";
  const findClr   = isLight ? "#ea580c"  : "#ffaa00";
  const navBg     = isLight ? "rgba(37,99,235,0.07)"  : "rgba(0,150,255,0.1)";
  const navBdr    = isLight ? "rgba(37,99,235,0.25)"  : "rgba(0,150,255,0.3)";
  const navClr    = isLight ? "#2563eb"  : "#0096ff";
  const durClr    = isLight ? "#d97706"  : "#ffaa00";

  return `
    <div style="background:${bg};color:${txt};padding:14px;min-width:220px;font-family:Rajdhani,sans-serif;border-radius:8px;border:1px solid ${wrapBdr};">
      <div style="font-family:Orbitron,monospace;color:${color};font-size:0.62rem;letter-spacing:2px;margin-bottom:8px;">
        ${icon} ${(facility.type || "FACILITY").toUpperCase()}
        ${isNearest ? `<span style="margin-left:8px;padding:2px 8px;background:${nearBg};border:1px solid ${nearBdr};border-radius:10px;font-size:0.55rem;color:${nearClr};">NEAREST</span>` : ""}
      </div>
      <div style="font-weight:600;font-size:0.95rem;margin-bottom:6px;color:${txt};">${facility.name}</div>
      ${facility.address ? `<div style="font-size:0.78rem;color:${subTxt};margin-bottom:6px;">📌 ${facility.address}</div>` : ""}
      <div style="font-size:0.8rem;color:${distTxt};margin-bottom:8px;">📍 <b style="color:${color};">${facility.dist.toFixed(2)} km</b>${facility.duration ? ` &nbsp;·&nbsp; <span style="color:${durClr};">${formatDuration(facility.duration)}</span>` : ""} away</div>
      <div style="display:flex;gap:8px;">
        ${
          facility.phone
            ? `<a href="tel:${facility.phone}" style="flex:1;padding:7px;background:${callBg};border:1px solid ${callBdr};border-radius:6px;color:${callClr};text-decoration:none;text-align:center;font-size:0.75rem;font-family:Orbitron,monospace;letter-spacing:0.5px;">📞 CALL</a>`
            : `<a href="https://www.google.com/search?q=${encodeURIComponent(facility.name + ' phone number contact')}" target="_blank" rel="noopener" style="flex:1;padding:7px;background:${findBg};border:1px solid ${findBdr};border-radius:6px;color:${findClr};text-decoration:none;text-align:center;font-size:0.7rem;font-family:Orbitron,monospace;letter-spacing:0.5px;">🔍 FIND #</a>`
        }
        <button onclick="window.navigateToFacility(${facility.lat}, ${facility.lng}, '${facility.name.replace(/'/g, "\\'")}')" style="flex:1;padding:7px;background:${navBg};border:1px solid ${navBdr};border-radius:6px;color:${navClr};cursor:pointer;font-size:0.75rem;font-family:Orbitron,monospace;letter-spacing:0.5px;">🗺 NAV</button>
      </div>
    </div>`;
}

// ─── Map Filter Buttons ───────────────────────────────────────
document.querySelectorAll(".filter-btn[data-filter]").forEach(btn => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".filter-btn[data-filter]")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.activeFilter = btn.dataset.filter;
    renderFacilityCards();
    renderFacilityMarkers();
  });
});

// Tab switching
document.querySelectorAll(".sidebar-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".sidebar-tab")
      .forEach(t => t.classList.remove("active"));
    document
      .querySelectorAll(".tab-panel")
      .forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
  });
});

// Refresh button
document.getElementById("btnRefreshMap").addEventListener("click", () => {
  fetchNearbyServices(state.lat, state.lng);
});

// Center map
document.getElementById("btnCenterMap").addEventListener("click", () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      position => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        if (map) {
          map.panTo({ lat, lng });
          map.setZoom(15);
        }
      },
      error => {
        // fallback to state.lat/lng if geolocation fails
        if (map && state.lat && state.lng) {
          map.panTo({ lat: state.lat, lng: state.lng });
          map.setZoom(15);
        }
        alert("Unable to fetch your location. Using device location instead.");
      },
    );
  } else {
    // fallback if geolocation is not supported
    if (map && state.lat && state.lng) {
      map.panTo({ lat: state.lat, lng: state.lng });
      map.setZoom(15);
    }
    alert("Geolocation is not supported by your browser.");
  }
});

// Fullscreen
document.getElementById("btnFullscreen").addEventListener("click", () => {
  const el = document.getElementById("map");
  if (!document.fullscreenElement) {
    el.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

// ─── Send Telegram Alert to Emergency Contact ────────────────
async function sendEmergencyContactTelegram() {
  try {
    // Check Telegram toggle — if disabled, skip silently
    const tgToggleEl = document.getElementById("telegramAlertToggle");
    if (tgToggleEl && !tgToggleEl.checked) {
      console.log("[Telegram] Service disabled via Settings — skipping alert");
      return;
    }

    const res     = await fetch(`/api/profile/${CURRENT_USER?.id}`);
    const data    = await res.json();
    const profile = data?.profile || {};
    const ecTelegramChatId = profile.emergencyContactTelegramChatId || "";
    const ecName           = profile.emergencyContactName  || "Emergency Contact";

    if (!ecTelegramChatId) {
      showToast("⚠️ No Telegram Chat ID set. Add it in Profile → Emergency Contact.", "warning", 7000);
      return;
    }

    const tgRes  = await fetch("/api/telegram/send-sos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: CURRENT_USER?.id,
        lat: state.lat,
        lng: state.lng,
      }),
    });
    const tgData = await tgRes.json();

    if (tgData.success) {
      showToast(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="18" height="18" style="vertical-align:middle;margin-right:4px;border-radius:50%"><defs><linearGradient id="tg-t" x1="120" y1="0" x2="120" y2="240" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2AABEE"/><stop offset="1" stop-color="#229ED9"/></linearGradient></defs><circle cx="120" cy="120" r="120" fill="url(#tg-t)"/><path d="M176 68L152.6 172.4c-1.7 7.6-6.3 9.5-12.7 5.9l-35-25.8-16.9 16.3c-1.9 1.9-3.4 3.4-7 3.4l2.5-35.4 64.5-58.3c2.8-2.5-.6-3.9-4.3-1.4L77.4 128.6 43.8 118c-7.4-2.3-7.5-7.4 1.5-11l122.8-47.3c6.2-2.3 11.6 1.5 7.9 8.3z" fill="#fff"/></svg> Telegram SOS sent to ${ecName}! They will receive an AI-guided reply.`, "success", 7000);
    } else {
      showToast(`⚠️ Telegram alert failed: ${tgData.message}`, "warning", 8000);
    }
  } catch (err) {
    console.warn("sendEmergencyContactTelegram error:", err);
    showToast("⚠️ Could not send Telegram alert to emergency contact.", "warning", 5000);
  }
}

// Called by the dedicated TELEGRAM ALERT button on the dashboard
async function triggerTelegramSOS() {
  showToast(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="16" height="16" style="vertical-align:middle;margin-right:4px;border-radius:50%"><defs><linearGradient id="tg-s" x1="120" y1="0" x2="120" y2="240" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2AABEE"/><stop offset="1" stop-color="#229ED9"/></linearGradient></defs><circle cx="120" cy="120" r="120" fill="url(#tg-s)"/><path d="M176 68L152.6 172.4c-1.7 7.6-6.3 9.5-12.7 5.9l-35-25.8-16.9 16.3c-1.9 1.9-3.4 3.4-7 3.4l2.5-35.4 64.5-58.3c2.8-2.5-.6-3.9-4.3-1.4L77.4 128.6 43.8 118c-7.4-2.3-7.5-7.4 1.5-11l122.8-47.3c6.2-2.3 11.6 1.5 7.9 8.3z" fill="#fff"/></svg> Sending Telegram emergency alert...`, "info", 3000);
  await sendEmergencyContactTelegram();

  // Log to backend
  try {
    await fetch("/api/sos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: CURRENT_USER?.id,
        lat: state.lat,
        lng: state.lng,
        message: `[TELEGRAM BUTTON] Emergency triggered by ${CURRENT_USER?.name || "Unknown"}`,
      }),
    });
  } catch (e) { /* silent */ }
}
window.triggerTelegramSOS = triggerTelegramSOS;

// ─── Auto Call to Emergency Contact on SOS ────────────────────
async function sendEmergencyContactCall() {
  try {
    // Check Auto Call toggle — if disabled, skip silently
    const callToggleEl = document.getElementById("autoCallToggle");
    if (callToggleEl && !callToggleEl.checked) {
      console.log("[AutoCall] Disabled via Settings — skipping call");
      return;
    }

    const res  = await fetch("/api/call/sos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: CURRENT_USER?.id,
        lat: state.lat,
        lng: state.lng,
      }),
    });
    const data = await res.json();

    if (data.success) {
      showToast(`📞 Emergency contact is being called! AI will answer their questions.`, "success", 7000);
    } else {
      showToast(`⚠️ Auto-call failed: ${data.message}`, "warning", 6000);
    }
  } catch (err) {
    console.warn("sendEmergencyContactCall error:", err);
    showToast("⚠️ Could not place call to emergency contact.", "warning", 5000);
  }
}

// ─── Send SMS to Emergency Contact ───────────────────────────
async function sendEmergencyContactSMS() {
  try {
    // Fetch emergency contact from profile
    const res     = await fetch(`/api/profile/${CURRENT_USER?.id}`);
    const data    = await res.json();
    const profile = data?.profile || {};
    const ecPhone = profile.emergencyContactPhone || "";
    const ecName  = profile.emergencyContactName  || "Emergency Contact";

    if (!ecPhone) {
      showToast("⚠️ No emergency contact set. Add one in Profile → Emergency Contact.", "warning", 7000);
      return;
    }

    const userName     = CURRENT_USER?.name || "Someone";
    const locationUrl  = `https://maps.google.com/?q=${state.lat.toFixed(5)},${state.lng.toFixed(5)}`;
    const smsBody      = `🚨 EMERGENCY SOS ALERT 🚨\n\n${userName} has triggered an emergency SOS and may need immediate assistance.\n\n⏰ Time: ${new Date().toLocaleString("en-IN")}\n\n📍 Last Known Location:\n${locationUrl}\n\n⚠ Immediate Action Required:\nPlease contact ${userName} immediately or reach the location.\n\nIf the situation is critical, please contact emergency services (112).\n\nReply to this message — our AI assistant will guide you on the next steps.`;

    // Check Twilio SMS toggle — if disabled, skip SMS entirely
    const twilioToggleEl = document.getElementById("twilioSmsToggle");
    const twilioEnabled  = twilioToggleEl ? twilioToggleEl.checked : true;
    if (!twilioEnabled) {
      showToast("⚠️ Twilio SMS service is disabled. Enable it in Settings.", "warning", 6000);
      return;
    }

    // Ask server to send via Twilio (if configured)
    const smsRes  = await fetch("/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: ecPhone, message: smsBody }),
    });
    const smsData = await smsRes.json();

    if (smsData.success && smsData.provider === "twilio") {
      showToast(`📱 SMS alert sent to ${ecName} (${ecPhone})!`, "success", 6000);
    } else if (smsData.success && smsData.smsUri) {
      // No Twilio — open native SMS app on mobile as fallback
      showToast(`📱 Opening SMS to ${ecName} (${ecPhone})…`, "info", 5000);
      setTimeout(() => { window.open(smsData.smsUri, "_blank"); }, 600);
    } else {
      showToast(`⚠️ SMS to ${ecName} failed. Please call manually: ${ecPhone}`, "warning", 8000);
    }
  } catch (err) {
    console.warn("sendEmergencyContactSMS error:", err);
    showToast("⚠️ Could not send SMS alert to emergency contact.", "warning", 5000);
  }
}

// ─── SOS Alarm Audio ─────────────────────────────────────────
const sosAlarm = new Audio("/sos-alarm.mp3");
sosAlarm.loop = true;
let sosAlarmKeepAlive = null;

function playSosAlarm() {
  // Respect SOS Sound setting
  const sosSoundEl = document.getElementById("sosSoundToggle");
  if (sosSoundEl && !sosSoundEl.checked) return;

  sosAlarm.currentTime = 0;
  sosAlarm.play().catch(e => console.warn("Audio play blocked:", e));

  // Restart on end (loop fallback)
  sosAlarm.onended = () => {
    if (state.sosActive) {
      sosAlarm.currentTime = 0;
      sosAlarm.play().catch(() => {});
    }
  };

  // Keepalive: if audio paused unexpectedly, restart it
  if (sosAlarmKeepAlive) clearInterval(sosAlarmKeepAlive);
  sosAlarmKeepAlive = setInterval(() => {
    if (!state.sosActive) {
      clearInterval(sosAlarmKeepAlive);
      sosAlarmKeepAlive = null;
      return;
    }
    if (sosAlarm.paused) {
      sosAlarm.play().catch(() => {});
    }
  }, 500);
}

function stopSosAlarm() {
  if (sosAlarmKeepAlive) {
    clearInterval(sosAlarmKeepAlive);
    sosAlarmKeepAlive = null;
  }
  sosAlarm.onended = null;
  sosAlarm.pause();
  sosAlarm.currentTime = 0;

  // Reset SOS state so button is usable again
  state.sosActive = false;
  DOM.sosBtn.style.background = "";
  if (sosCircle) {
    sosCircle.setMap(null);
    sosCircle = null;
  }
}
window.stopSosAlarm = stopSosAlarm;

// ─── SOS Button ───────────────────────────────────────────────
DOM.sosBtn.addEventListener("click", () => {
  if (state.sosActive) return;
  triggerSOS();
});
DOM.sosBtn.addEventListener("touchend", (e) => {
  e.preventDefault();
  if (state.sosActive) return;
  triggerSOS();
}, { passive: false });

async function triggerSOS() {
  state.sosActive = true;
  DOM.sosBtn.style.background = "linear-gradient(135deg, #880022, #ff2244)";
  DOM.sosBtn.style.transform = "scale(1)";

  playSosAlarm();
  showToast("🚨 SOS ALERT SENT! Emergency services notified!", "error", 8000);
  sendBrowserNotif("🚨 SOS ALERT SENT", `Emergency triggered by ${CURRENT_USER?.name || "Unknown"} at ${state.lat.toFixed(5)}, ${state.lng.toFixed(5)}`);
  DOM.sosBanner.classList.add("danger");
  DOM.sosBanner.style.display = "flex";

  // ─── Log SOS to backend ────────────────────────────────────
  try {
    await fetch("/api/sos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: CURRENT_USER?.id,
        lat: state.lat,
        lng: state.lng,
        message: `EMERGENCY from ${CURRENT_USER?.name || "Unknown"} at ${state.lat.toFixed(6)}, ${state.lng.toFixed(6)}`,
      }),
    });
  } catch (err) {
    console.warn("SOS backend error:", err);
  }

  // ─── Send SMS to Emergency Contact ─────────────────────────
  sendEmergencyContactSMS();

  // ─── Send Telegram Alert to Emergency Contact ───────────────
  sendEmergencyContactTelegram();

  // ─── Auto Call Emergency Contact ────────────────────────────
  sendEmergencyContactCall();

  const logEntry = {
    id: Date.now(),
    time: new Date().toLocaleTimeString(),
    lat: state.lat.toFixed(5),
    lng: state.lng.toFixed(5),
    user: CURRENT_USER?.name || "Unknown",
  };
  state.sosLog.unshift(logEntry);
  renderSosLog();

  // SOS ring on map
  if (map && sosCircle) {
    sosCircle.setMap(null);
    sosCircle = null;
  }
  if (map) {
    sosCircle = new google.maps.Circle({
      map,
      center: { lat: state.lat, lng: state.lng },
      radius: 200,
      strokeColor: "#ff2244",
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: "#ff2244",
      fillOpacity: 0.1,
    });
  }

}

function renderSosLog() {
  if (state.sosLog.length === 0) return;
  DOM.sosLogList.innerHTML = state.sosLog
    .map(
      log => `
    <div style="background:rgba(255,34,68,0.08);border:1px solid rgba(255,34,68,0.3);border-radius:8px;padding:10px 12px;">
      <div style="font-family:var(--font-tech);font-size:0.62rem;color:var(--danger);letter-spacing:1.5px;margin-bottom:4px;">
        🚨 SOS TRANSMITTED — ${log.time}
      </div>
      <div style="font-size:0.75rem;color:var(--text-secondary);">📍 ${log.lat}, ${log.lng}</div>
    </div>
  `,
    )
    .join("");
}

// ─── Inject CSS (Google Maps InfoWindow theme – swappable) ────
const style = document.createElement("style");
style.id = "seap-iw-style";
style.textContent = `
  @keyframes sosRipple {
    0% { transform: scale(1); opacity: 1; }
    100% { transform: scale(2.5); opacity: 0; }
  }
  @keyframes sosPulse {
    0%, 100% { box-shadow: 0 0 15px rgba(255,107,53,0.7); }
    50% { box-shadow: 0 0 30px rgba(255,107,53,1), 0 0 60px rgba(255,107,53,0.3); }
  }
  .gm-style .gm-style-iw-c {
    background: #050d1e !important;
    border: 1px solid rgba(0,245,255,0.3) !important;
    border-radius: 10px !important;
    box-shadow: 0 0 30px rgba(0,245,255,0.15) !important;
    padding: 0 !important;
  }
  .gm-style .gm-style-iw-d { overflow: auto !important; }
  .gm-style .gm-style-iw-t::after {
    background: #050d1e !important;
    box-shadow: none !important;
  }
  .gm-style-iw-chr { display: none !important; }
  .gm-ui-hover-effect { display: none !important; }
`;
document.head.appendChild(style);

// ─── Update "time ago" every 5s ───────────────────────────────
setInterval(() => {
  if (!state.lastFetchTime) return;
  const diff = Math.round((Date.now() - state.lastFetchTime) / 1000);
  DOM.updateTimeAgo.textContent = diff < 10 ? "just now" : `${diff}s ago`;
}, 5000);

// ─── Browser Notification Helper ────────────────────────────
function sendBrowserNotif(title, body) {
  const notifToggle = document.getElementById("browserNotifToggle");
  if (!notifToggle || !notifToggle.checked) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🆘</text></svg>" });
  }
}
window.sendBrowserNotif = sendBrowserNotif;

// ─── Settings Modal + Theme Toggle ────────────────────────────
(function () {
  const overlay      = document.getElementById("settingsOverlay");
  const openBtn      = document.getElementById("openSettingsBtn");
  const closeBtn     = document.getElementById("closeSettingsBtn");
  const themeDarkBtn = document.getElementById("themeDarkBtn");
  const themeLightBtn= document.getElementById("themeLightBtn");

  // Apply stored theme on load
  const savedTheme = localStorage.getItem("seap_theme") || "dark";
  applyTheme(savedTheme);

  function applyTheme(theme) {
    if (theme === "light") {
      document.body.classList.add("light-mode");
      themeLightBtn.classList.add("active");
      themeDarkBtn.classList.remove("active");
    } else {
      document.body.classList.remove("light-mode");
      themeDarkBtn.classList.add("active");
      themeLightBtn.classList.remove("active");
    }
    localStorage.setItem("seap_theme", theme);
  }

  // Open modal
  openBtn.addEventListener("click", e => {
    e.stopPropagation();
    DOM.userMenuBtn.classList.remove("open");
    overlay.classList.add("open");
  });

  // Close modal
  closeBtn.addEventListener("click", () => overlay.classList.remove("open"));
  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.classList.remove("open");
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") overlay.classList.remove("open");
  });

  // Theme buttons
  themeDarkBtn.addEventListener("click",  () => applyTheme("dark"));
  themeLightBtn.addEventListener("click", () => applyTheme("light"));

  // Real-time cross-tab sync
  window.addEventListener("storage", e => {
    if (e.key === "seap_theme") applyTheme(e.newValue || "dark");
  });

  // ── SOS Sound Alert Toggle ────────────────────────────────────
  const sosSoundToggle = document.getElementById("sosSoundToggle");
  // Load saved preference from localStorage (persists across server restarts)
  const savedSosSound = localStorage.getItem("seap_sosSound");
  if (savedSosSound === "false") sosSoundToggle.checked = false;
  sosSoundToggle.addEventListener("change", () => {
    // Save to localStorage (permanent storage)
    localStorage.setItem("seap_sosSound", sosSoundToggle.checked);
    if (!sosSoundToggle.checked && state.sosActive) {
      stopSosAlarm();
    }
    showToast(
      sosSoundToggle.checked ? "🔔 SOS sound alert enabled" : "🔕 SOS sound alert disabled",
      sosSoundToggle.checked ? "success" : "info",
      2000
    );
  });

  // ── Twilio SMS Toggle ─────────────────────────────────────────
  const twilioSmsToggle = document.getElementById("twilioSmsToggle");
  // Fetch current server-side state on load
  fetch("/api/settings/twilio")
    .then(r => r.json())
    .then(d => {
      twilioSmsToggle.checked = d.enabled;
      sessionStorage.setItem("seap_twilioEnabled", d.enabled);
    })
    .catch(() => {});
  twilioSmsToggle.addEventListener("change", () => {
    const enabled = twilioSmsToggle.checked;
    sessionStorage.setItem("seap_twilioEnabled", enabled);
    // Sync to server — this disables/enables the webhook AI reply too
    fetch("/api/settings/twilio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }).catch(() => {});
    showToast(
      enabled ? "📱 Twilio SMS service enabled" : "📵 Twilio SMS service disabled — no charges will apply",
      enabled ? "success" : "info",
      3000
    );
  });

  // ── Telegram Alert Toggle ─────────────────────────────────────
  const telegramAlertToggle = document.getElementById("telegramAlertToggle");
  // Fetch current server-side state on load
  fetch("/api/settings/telegram")
    .then(r => r.json())
    .then(d => {
      telegramAlertToggle.checked = d.enabled;
    })
    .catch(() => {});
  telegramAlertToggle.addEventListener("change", () => {
    const enabled = telegramAlertToggle.checked;
    // Sync to server — persisted in MongoDB
    fetch("/api/settings/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }).catch(() => {});
    showToast(
      enabled ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="16" height="16" style="vertical-align:middle;margin-right:4px;border-radius:50%"><defs><linearGradient id="tg-tog" x1="120" y1="0" x2="120" y2="240" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2AABEE"/><stop offset="1" stop-color="#229ED9"/></linearGradient></defs><circle cx="120" cy="120" r="120" fill="url(#tg-tog)"/><path d="M176 68L152.6 172.4c-1.7 7.6-6.3 9.5-12.7 5.9l-35-25.8-16.9 16.3c-1.9 1.9-3.4 3.4-7 3.4l2.5-35.4 64.5-58.3c2.8-2.5-.6-3.9-4.3-1.4L77.4 128.6 43.8 118c-7.4-2.3-7.5-7.4 1.5-11l122.8-47.3c6.2-2.3 11.6 1.5 7.9 8.3z" fill="#fff"/></svg> Telegram alert service enabled` : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="16" height="16" style="vertical-align:middle;margin-right:4px;border-radius:50%;opacity:0.5"><defs><linearGradient id="tg-tog2" x1="120" y1="0" x2="120" y2="240" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2AABEE"/><stop offset="1" stop-color="#229ED9"/></linearGradient></defs><circle cx="120" cy="120" r="120" fill="url(#tg-tog2)"/><path d="M176 68L152.6 172.4c-1.7 7.6-6.3 9.5-12.7 5.9l-35-25.8-16.9 16.3c-1.9 1.9-3.4 3.4-7 3.4l2.5-35.4 64.5-58.3c2.8-2.5-.6-3.9-4.3-1.4L77.4 128.6 43.8 118c-7.4-2.3-7.5-7.4 1.5-11l122.8-47.3c6.2-2.3 11.6 1.5 7.9 8.3z" fill="#fff"/></svg> Telegram alert service disabled`,
      enabled ? "success" : "info",
      3000
    );
  });

  // ── Auto Call Toggle ──────────────────────────────────────────
  const autoCallToggle = document.getElementById("autoCallToggle");
  fetch("/api/settings/call")
    .then(r => r.json())
    .then(d => { autoCallToggle.checked = d.enabled; })
    .catch(() => {});
  autoCallToggle.addEventListener("change", () => {
    const enabled = autoCallToggle.checked;
    fetch("/api/settings/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }).catch(() => {});
    showToast(
      enabled ? "📞 Auto call on SOS enabled" : "📵 Auto call on SOS disabled",
      enabled ? "success" : "info",
      3000
    );
  });

  // ── Browser Notifications Toggle ─────────────────────────────
  const browserNotifToggle = document.getElementById("browserNotifToggle");
  const savedBrowserNotif = sessionStorage.getItem("seap_browserNotif");
  // Restore saved state
  if (savedBrowserNotif === "true" && Notification.permission === "granted") {
    browserNotifToggle.checked = true;
  } else {
    browserNotifToggle.checked = false;
  }
  browserNotifToggle.addEventListener("change", async () => {
    if (browserNotifToggle.checked) {
      if (!("Notification" in window)) {
        showToast("Browser notifications not supported", "warning", 3000);
        browserNotifToggle.checked = false;
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        browserNotifToggle.checked = false;
        sessionStorage.setItem("seap_browserNotif", "false");
        showToast("❌ Notification permission denied", "warning", 3000);
        return;
      }
      sessionStorage.setItem("seap_browserNotif", "true");
      showToast("📳 Browser notifications enabled", "success", 2000);
      new Notification("SEAP Alerts Active", {
        body: "You will now receive desktop alerts for SOS and key events.",
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🆘</text></svg>"
      });
    } else {
      sessionStorage.setItem("seap_browserNotif", "false");
      showToast("Browser notifications disabled", "info", 2000);
    }
  });

  // ── Auto Refresh Toggle ───────────────────────────────────────
  const autoRefreshToggle = document.getElementById("autoRefreshToggle");
  const savedAutoRefresh = sessionStorage.getItem("seap_autoRefresh");
  if (savedAutoRefresh === "false") {
    autoRefreshToggle.checked = false;
    // Stop the interval that was started in initMap
    if (iotFetchInterval) {
      clearInterval(iotFetchInterval);
      iotFetchInterval = null;
    }
  }
  autoRefreshToggle.addEventListener("change", () => {
    sessionStorage.setItem("seap_autoRefresh", autoRefreshToggle.checked);
    if (autoRefreshToggle.checked) {
      if (!iotFetchInterval) {
        fetchIoTLocation();
        iotFetchInterval = setInterval(fetchIoTLocation, 3000);
      }
      showToast("🔄 Auto refresh enabled", "success", 2000);
    } else {
      if (iotFetchInterval) {
        clearInterval(iotFetchInterval);
        iotFetchInterval = null;
      }
      showToast("⏸ Auto refresh paused", "info", 2000);
    }
  });

  // ── Map style switcher (called after map is ready) ────────────
  function updateMapTheme(theme) {
    if (!map) return;
    if (theme === "light") {
      map.setOptions({ styles: LIGHT_MAP_STYLE, backgroundColor: "#f8faff" });
      // Update InfoWindow popup style
      const iwStyle = document.getElementById("seap-iw-style");
      if (iwStyle) {
        iwStyle.textContent = `
          .gm-style .gm-style-iw-c {
            background: #ffffff !important;
            border: 1px solid rgba(37,99,235,0.2) !important;
            border-radius: 12px !important;
            box-shadow: 0 4px 20px rgba(15,23,42,0.12) !important;
            padding: 0 !important;
          }
          .gm-style .gm-style-iw-d { overflow: auto !important; }
          .gm-style .gm-style-iw-t::after {
            background: #ffffff !important;
            box-shadow: none !important;
          }
          .gm-style-iw-chr { display: none !important; }
          .gm-ui-hover-effect { display: none !important; }
        `;
      }
    } else {
      map.setOptions({ styles: DARK_MAP_STYLE, backgroundColor: "#020510" });
      const iwStyle = document.getElementById("seap-iw-style");
      if (iwStyle) {
        iwStyle.textContent = `
          .gm-style .gm-style-iw-c {
            background: #050d1e !important;
            border: 1px solid rgba(0,245,255,0.3) !important;
            border-radius: 10px !important;
            box-shadow: 0 0 30px rgba(0,245,255,0.15) !important;
            padding: 0 !important;
          }
          .gm-style .gm-style-iw-d { overflow: auto !important; }
          .gm-style .gm-style-iw-t::after {
            background: #050d1e !important;
            box-shadow: none !important;
          }
          .gm-style-iw-chr { display: none !important; }
          .gm-ui-hover-effect { display: none !important; }
        `;
      }
    }
  }

  // Patch applyTheme to also update the map
  const _origApply = applyTheme;
  applyTheme = function(theme) {
    _origApply(theme);
    updateMapTheme(theme);
  };

  // If map was already initialised when page loaded with saved theme, sync it now
  updateMapTheme(savedTheme);
})();

