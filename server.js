require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MongoDB Connection ───────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/emergency_platform")
  .then(() => console.log("\x1b[32m%s\x1b[0m", "[MongoDB] Connected successfully ✓"))
  .catch(err => console.error("\x1b[31m%s\x1b[0m", "[MongoDB] Connection error:", err.message));

// ─── Mongoose Schemas ─────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true, lowercase: true },
  phone:     { type: String, required: true },
  password:  { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const sosSchema = new mongoose.Schema({
  userId:    { type: String },
  lat:       { type: Number },
  lng:       { type: Number },
  message:   { type: String, default: "SOS EMERGENCY ALERT" },
  status:    { type: String, default: "sent" },
  timestamp: { type: Date, default: Date.now },
});

const userProfileSchema = new mongoose.Schema({
  userId:           { type: String, required: true, unique: true },
  address:          { type: String, default: "" },
  phone:            { type: String, default: "" },
  emergencyContact: { type: String, default: "" },
  memberSince:      { type: Date,   default: Date.now },
  photo:            { type: String, default: null },   // base64 data URL
  documents:        [{
    id:         { type: String },
    label:      { type: String },
    filename:   { type: String },
    mimeType:   { type: String },
    size:       { type: Number },
    data:       { type: String }, // base64 data URL
    uploadedAt: { type: Date, default: Date.now },
  }],
});

const User        = mongoose.model("User",        userSchema);
const SOS         = mongoose.model("SOS",         sosSchema);
const UserProfile = mongoose.model("UserProfile", userProfileSchema);

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

// ─── Auth Routes (MongoDB) ────────────────────────────────────────────────────
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: "Email already registered" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, phone, password: hashedPassword });
    res.status(201).json({
      success: true,
      message: "Account created successfully",
      user: { id: user._id, name: user.name, email: user.email, phone: user.phone, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error("[Signup Error]", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }
    res.json({
      success: true,
      message: "Login successful",
      user: { id: user._id, name: user.name, email: user.email, phone: user.phone, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error("[Login Error]", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── Emergency SOS Log (MongoDB) ─────────────────────────────────────────────
app.post("/api/sos", async (req, res) => {
  try {
    const { userId, lat, lng, message } = req.body;
    const log = await SOS.create({
      userId,
      lat,
      lng,
      message: message || "SOS EMERGENCY ALERT",
    });
    console.log(
      "\x1b[31m%s\x1b[0m",
      `[SOS ALERT] User: ${userId} | Location: ${lat}, ${lng} | ${log.message}`,
    );
    res.json({ success: true, message: "SOS alert sent to emergency services", log });
  } catch (err) {
    console.error("[SOS Error]", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/sos/logs", async (req, res) => {
  try {
    const logs = await SOS.find().sort({ timestamp: -1 }).limit(20);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── User Profile Routes (MongoDB) ───────────────────────────────────────────

// GET profile
app.get("/api/profile/:userId", async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.params.userId });
    if (!profile) return res.json({ success: true, profile: null });
    const { photo, documents, ...rest } = profile.toObject();
    res.json({ success: true, profile: { ...rest, hasPhoto: !!photo, photo, documents } });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST save/update profile info
app.post("/api/profile/:userId", async (req, res) => {
  try {
    const { address, phone, emergencyContact, name } = req.body;
    const update = { address, phone, emergencyContact };
    const profile = await UserProfile.findOneAndUpdate(
      { userId: req.params.userId },
      { $set: update, $setOnInsert: { memberSince: new Date() } },
      { upsert: true, new: true }
    );
    // If name change requested, update User collection too
    if (name) {
      await User.findByIdAndUpdate(req.params.userId, { name });
    }
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST save profile photo
app.post("/api/profile/:userId/photo", async (req, res) => {
  try {
    const { photo } = req.body;
    if (!photo) return res.status(400).json({ success: false, message: "photo required" });
    await UserProfile.findOneAndUpdate(
      { userId: req.params.userId },
      { $set: { photo } },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE remove profile photo
app.delete("/api/profile/:userId/photo", async (req, res) => {
  try {
    await UserProfile.findOneAndUpdate(
      { userId: req.params.userId },
      { $set: { photo: null } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST add document
app.post("/api/profile/:userId/document", async (req, res) => {
  try {
    const { id, label, filename, mimeType, size, data } = req.body;
    const doc = { id, label, filename, mimeType, size, data, uploadedAt: new Date() };
    await UserProfile.findOneAndUpdate(
      { userId: req.params.userId },
      { $push: { documents: doc }, $setOnInsert: { memberSince: new Date() } },
      { upsert: true, new: true }
    );
    res.json({ success: true, doc });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE remove document
app.delete("/api/profile/:userId/document/:docId", async (req, res) => {
  try {
    await UserProfile.findOneAndUpdate(
      { userId: req.params.userId },
      { $pull: { documents: { id: req.params.docId } } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE all documents
app.delete("/api/profile/:userId/documents", async (req, res) => {
  try {
    await UserProfile.findOneAndUpdate(
      { userId: req.params.userId },
      { $set: { documents: [] } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
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
