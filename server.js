require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── IoT Device Simulation ────────────────────────────────────────────────────
// Simulates a GPS IoT device sending real-time coordinates
// Starting point: New Delhi, India (can be changed to any starting lat/lng)
let iotDevice = {
  deviceId: "IOT-EMERGENCY-001",
  lat: 28.6139,
  lng: 77.209,
  speed: 0,
  battery: 87,
  signal: "Strong",
  lastUpdate: new Date().toISOString(),
  status: "active",
};

// Flag: true once a real GPS push is received from browser
let realGPSReceived = false;

// Simulate IoT device movement ONLY when no real GPS is available
setInterval(() => {
  if (realGPSReceived) {
    // Real GPS is being used — only update battery/signal, NO position drift
    iotDevice.battery = Math.max(10, iotDevice.battery - 0.01);
    iotDevice.lastUpdate = new Date().toISOString();
    iotDevice.signal = Math.random() > 0.1 ? "Strong" : "Weak";
    iotDevice.speed = 0;
    return;
  }
  // Simulation mode — drift position
  iotDevice.lat += (Math.random() - 0.5) * 0.001;
  iotDevice.lng += (Math.random() - 0.5) * 0.001;
  iotDevice.speed = Math.floor(Math.random() * 30);
  iotDevice.battery = Math.max(10, iotDevice.battery - 0.01);
  iotDevice.lastUpdate = new Date().toISOString();
  iotDevice.signal = Math.random() > 0.1 ? "Strong" : "Weak";
}, 3000);

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET current IoT device location (called by frontend every few seconds)
app.get("/api/iot/location", (req, res) => {
  res.json({
    success: true,
    data: iotDevice,
  });
});

// POST simulate IoT device sending a new location (external IoT device sends data here)
app.post("/api/iot/update", (req, res) => {
  const { lat, lng, deviceId, battery, speed } = req.body;
  if (lat && lng) {
    iotDevice.lat = parseFloat(lat);
    iotDevice.lng = parseFloat(lng);
    if (deviceId) iotDevice.deviceId = deviceId;
    if (battery !== undefined && battery !== null) iotDevice.battery = battery;
    if (speed !== undefined) iotDevice.speed = speed;
    iotDevice.lastUpdate = new Date().toISOString();
    realGPSReceived = true; // Stop simulation drift
    res.json({ success: true, message: "Location updated", data: iotDevice });
  } else {
    res
      .status(400)
      .json({ success: false, message: "lat and lng are required" });
  }
});

// ─── Auth Routes (in-memory user store for demo) ─────────────────────────────
const users = [];

app.post("/api/auth/signup", (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required" });
  }
  const existing = users.find(u => u.email === email);
  if (existing) {
    return res
      .status(409)
      .json({ success: false, message: "Email already registered" });
  }
  const user = {
    id: Date.now(),
    name,
    email,
    phone,
    password,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  const { password: _, ...safeUser } = user;
  res.status(201).json({
    success: true,
    message: "Account created successfully",
    user: safeUser,
  });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid email or password" });
  }
  const { password: _, ...safeUser } = user;
  res.json({ success: true, message: "Login successful", user: safeUser });
});

// ─── Emergency SOS Log ────────────────────────────────────────────────────────
const sosLogs = [];

app.post("/api/sos", (req, res) => {
  const { userId, lat, lng, message } = req.body;
  const log = {
    id: Date.now(),
    userId,
    lat,
    lng,
    message: message || "SOS EMERGENCY ALERT",
    timestamp: new Date().toISOString(),
    status: "sent",
  };
  sosLogs.push(log);
  console.log(
    "\x1b[31m%s\x1b[0m",
    `[SOS ALERT] User: ${userId} | Location: ${lat}, ${lng} | ${log.message}`,
  );
  res.json({
    success: true,
    message: "SOS alert sent to emergency services",
    log,
  });
});

app.get("/api/sos/logs", (req, res) => {
  res.json({ success: true, logs: sosLogs.slice(-20) });
});

// ─── Public Config (safe to expose to frontend) ─────────────────────────────
app.get("/api/config", (req, res) => {
  res.json({
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
  });
});

// ─── Server Health ─────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    iotDevice: { id: iotDevice.deviceId, status: iotDevice.status },
  });
});

// Serve SPA pages
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(
    "\x1b[36m%s\x1b[0m",
    `
╔══════════════════════════════════════════════════════╗
║   🚨 SMART EMERGENCY ASSISTANCE PLATFORM             ║
║   Server running on http://localhost:${PORT}           ║
║   IoT Device simulation active                       ║
╚══════════════════════════════════════════════════════╝
  `,
  );
});
