require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const https = require("https");

// ─── AI Agent (LongCat AI) ───────────────────────────────────────────────────
// Uses LongCat's OpenAI-compatible API — no extra npm package needed
// Endpoint: https://api.longcat.chat/openai/v1/chat/completions
const aiAgentKey = process.env.AI_AGENT_KEY;

if (aiAgentKey) {
  console.log("\x1b[32m%s\x1b[0m", "[AI Agent] LongCat AI agent initialized ✓");
} else {
  console.warn("[AI Agent] AI_AGENT_KEY not set — auto-reply disabled");
}

// ─── Telegram Bot ────────────────────────────────────────────────────────────
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

if (TELEGRAM_BOT_TOKEN) {
  console.log("\x1b[32m%s\x1b[0m", "[Telegram] Bot token loaded ✓");
} else {
  console.warn("[Telegram] TELEGRAM_BOT_TOKEN not set — Telegram alerts disabled");
}

/**
 * Send a text message via Telegram Bot API.
 * @param {string|number} chatId  — Telegram chat_id of recipient
 * @param {string}        text    — Message text (supports HTML parse_mode)
 * @returns {Promise<object>}
 */
function sendTelegramMessage(chatId, text) {
  return new Promise((resolve, reject) => {
    if (!TELEGRAM_BOT_TOKEN) return reject(new Error("TELEGRAM_BOT_TOKEN not set"));

    const body = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    });

    const options = {
      hostname: "api.telegram.org",
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Register the Telegram webhook so the bot receives messages.
 * Called once on server startup.
 */
function setupTelegramWebhook() {
  if (!TELEGRAM_BOT_TOKEN) return;

  // Use explicit TELEGRAM_WEBHOOK_URL or fall back to NGROK_DOMAIN
  const base = (process.env.TELEGRAM_WEBHOOK_URL || "").trim() ||
               (process.env.NGROK_DOMAIN || "").trim();

  if (!base) {
    console.warn("[Telegram] No webhook URL configured. Set TELEGRAM_WEBHOOK_URL or NGROK_DOMAIN in .env");
    return;
  }

  const webhookUrl = base.replace(/\/$/, "") + "/telegram/webhook";
  const body = JSON.stringify({ url: webhookUrl, allowed_updates: ["message"] });

  const options = {
    hostname: "api.telegram.org",
    path: `/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  const req = https.request(options, (res) => {
    let data = "";
    res.on("data", chunk => (data += chunk));
    res.on("end", () => {
      try {
        const json = JSON.parse(data);
        if (json.ok) {
          console.log("\x1b[32m%s\x1b[0m", `[Telegram] Webhook set → ${webhookUrl} ✓`);
        } else {
          console.warn("[Telegram] Webhook registration failed:", JSON.stringify(json));
        }
      } catch (e) {
        console.warn("[Telegram] Webhook response parse error:", e.message);
      }
    });
  });

  req.on("error", err => console.warn("[Telegram] Webhook setup error:", err.message));
  req.write(body);
  req.end();
}

/**
 * Send a prompt to LongCat AI and get a text reply.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
function longcatChat(prompt, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "LongCat-Flash-Chat",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 120,      // was 300 — shorter = faster, SMS needs <280 chars
      temperature: 0.3,     // was 0.7 — lower = faster & more deterministic
      stream: false,
    });

    const options = {
      hostname: "api.longcat.chat",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${aiAgentKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    // Hard timeout — if AI doesn't reply in time, fallback to default reply
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`AI timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        clearTimeout(timer);
        try {
          const json = JSON.parse(data);
          const text = json?.choices?.[0]?.message?.content || "";
          resolve(text.trim());
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", (err) => { clearTimeout(timer); reject(err); });
    req.write(body);
    req.end();
  });
}

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
  userId:                  { type: String, required: true, unique: true },
  address:                 { type: String, default: "" },
  phone:                   { type: String, default: "" },
  age:                     { type: String, default: "" },
  gender:                  { type: String, default: "" },
  bloodGroup:              { type: String, default: "" },
  emergencyContact:        { type: String, default: "" },  // legacy
  emergencyContactName:    { type: String, default: "" },
  emergencyContactPhone:   { type: String, default: "" },
  emergencyContactTelegramChatId: { type: String, default: "" }, // Telegram chat_id
  memberSince:             { type: Date,   default: Date.now },
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

const appSettingsSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed },
});

// ─── Place Phone Numbers (user-added) ────────────────────────────────────────
const placePhoneSchema = new mongoose.Schema({
  placeId:   { type: String, required: true, unique: true }, // OSM node/way/relation id
  placeName: { type: String, default: "" },
  phone:     { type: String, required: true },
  addedBy:   { type: String, default: "" },        // userId
  updatedAt: { type: Date,   default: Date.now },
});

const User        = mongoose.model("User",        userSchema);
const SOS         = mongoose.model("SOS",         sosSchema);
const UserProfile = mongoose.model("UserProfile", userProfileSchema);
const AppSettings = mongoose.model("AppSettings", appSettingsSchema);
const PlacePhone  = mongoose.model("PlacePhone",  placePhoneSchema);

app.use(cors());
app.use(bodyParser.json({ limit: '25mb' }));
app.use(bodyParser.urlencoded({ limit: '25mb', extended: true }));
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

// ─── Telegram Emergency Alert ─────────────────────────────────────────────────

// ─── Place Phone Numbers API ──────────────────────────────────────────────────
// GET all saved phone numbers (batch fetch by placeIds)
app.post("/api/place-phones/batch", async (req, res) => {
  try {
    const { placeIds } = req.body;  // array of OSM ids
    if (!Array.isArray(placeIds) || placeIds.length === 0) {
      return res.json({ success: true, phones: {} });
    }
    const docs = await PlacePhone.find({ placeId: { $in: placeIds } }).lean();
    const phones = {};
    docs.forEach(d => { phones[d.placeId] = d.phone; });
    res.json({ success: true, phones });
  } catch (err) {
    console.error("[PlacePhone batch error]", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST add / update a phone number for a place
app.post("/api/place-phones/save", async (req, res) => {
  try {
    const { placeId, placeName, phone, userId } = req.body;
    if (!placeId || !phone) {
      return res.status(400).json({ success: false, message: "placeId and phone are required" });
    }
    const doc = await PlacePhone.findOneAndUpdate(
      { placeId },
      { phone, placeName: placeName || "", addedBy: userId || "", updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, phone: doc.phone });
  } catch (err) {
    console.error("[PlacePhone save error]", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST — send Telegram SOS message to emergency contact
app.post("/api/telegram/send-sos", async (req, res) => {
  // ── Server-side guard ──
  if (!telegramServiceEnabled) {
    console.log("\x1b[33m%s\x1b[0m", "[Telegram SOS] Service disabled — alert not sent");
    return res.json({ success: false, message: "Telegram service is disabled" });
  }
  try {
    const { userId, lat, lng } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: "userId required" });

    // Fetch profile to get Telegram chat ID
    const profile = await UserProfile.findOne({ userId }).lean();
    if (!profile || !profile.emergencyContactTelegramChatId) {
      return res.status(404).json({
        success: false,
        message: "No Telegram chat ID configured for emergency contact. Please add it in Profile.",
      });
    }

    // Fetch user name
    const user = await User.findById(userId).lean().catch(() => null);
    const userName = user?.name || "Someone";
    const ecName   = profile.emergencyContactName || "Emergency Contact";
    const chatId   = profile.emergencyContactTelegramChatId.trim();

    // Build location info
    const latVal  = lat  || profile.lat  || null;
    const lngVal  = lng  || profile.lng  || null;
    let locationLine = "";
    if (latVal && lngVal) {
      const mapsUrl  = `https://maps.google.com/?q=${parseFloat(latVal).toFixed(6)},${parseFloat(lngVal).toFixed(6)}`;
      locationLine = `\n📍 <b>Location:</b> <a href="${mapsUrl}">View on Google Maps</a>\n<code>${parseFloat(latVal).toFixed(5)}, ${parseFloat(lngVal).toFixed(5)}</code>`;
    }

    const message =
      `🚨 <b>EMERGENCY SOS ALERT!</b>\n\n` +
      `👤 <b>${userName}</b> needs <b>IMMEDIATE HELP</b>!\n` +
      `⏰ <b>Time:</b> ${new Date().toLocaleString("en-IN")}` +
      locationLine +
      `\n\n💬 <i>Reply to this message — our AI assistant will guide you on what to do next.</i>`;

    const tgResult = await sendTelegramMessage(chatId, message);

    if (!tgResult.ok) {
      console.error("[Telegram SOS] API error:", JSON.stringify(tgResult));
      return res.status(502).json({ success: false, message: "Telegram API error: " + (tgResult.description || "unknown") });
    }

    // Log to SOS collection
    await SOS.create({
      userId,
      lat: latVal ? parseFloat(latVal) : undefined,
      lng: lngVal ? parseFloat(lngVal) : undefined,
      message: `[TELEGRAM SOS] Alert sent to ${ecName} (chat_id: ${chatId})`,
      status: "telegram_sent",
    });

    console.log("\x1b[32m%s\x1b[0m", `[Telegram SOS] Alert sent to ${ecName} | chat_id: ${chatId} | User: ${userName}`);
    res.json({ success: true, message: `Telegram SOS sent to ${ecName}!` });
  } catch (err) {
    console.error("[Telegram SOS Error]", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST — Telegram webhook (bot receives replies from emergency contacts)
app.post("/telegram/webhook", express.json(), async (req, res) => {
  // Always respond 200 immediately to Telegram
  res.sendStatus(200);

  try {
    const update = req.body;
    const msg    = update?.message;
    if (!msg) return; // ignore non-message updates (edited_message, etc.)

    const chatId   = msg.chat?.id;
    const fromName = msg.from?.first_name || msg.from?.username || "Contact";
    const text     = (msg.text || "").trim();

    if (!chatId || !text) return;

    console.log("\x1b[35m%s\x1b[0m", `[Telegram Webhook] From: ${fromName} (chat_id: ${chatId}) | Message: ${text}`);

    // ── /start or /id command — reply with chat_id so user can save it ────
    if (text === "/start" || text === "/id" || text.startsWith("/start") || text.startsWith("/id")) {
      const welcomeMsg =
        `👋 <b>Namaste ${fromName}!</b>\n\n` +
        `Yeh <b>SEAP Emergency Alert Bot</b> hai.\n\n` +
        `🆔 <b>Aapka Telegram Chat ID:</b>\n` +
        `<code>${chatId}</code>\n\n` +
        `📋 <b>Yeh ID kaise use karein:</b>\n` +
        `1. SEAP Dashboard → Profile page kholein\n` +
        `2. <b>Emergency Contact</b> section mein jaayein\n` +
        `3. <b>Edit</b> button dabayein\n` +
        `4. <b>Telegram Chat ID</b> field mein upar wala number paste karein\n` +
        `5. <b>Save Contact</b> dabayein ✅\n\n` +
        `Ab jab bhi SOS alert aayega, aapko seedha yahan message milega! 🚨`;

      await sendTelegramMessage(chatId, welcomeMsg);
      console.log("\x1b[32m%s\x1b[0m", `[Telegram] Sent chat_id (${chatId}) to ${fromName} via /start`);
      return; // Don't process as SOS reply
    }

    // ── Find matching user profile by Telegram chat_id ────────────────────
    const allProfiles = await UserProfile.find({
      emergencyContactTelegramChatId: { $exists: true, $ne: "" },
    }).lean();

    const matchedProfile = allProfiles.find(p =>
      String(p.emergencyContactTelegramChatId).trim() === String(chatId)
    );

    let userName    = "the person who triggered the SOS";
    let locationStr = "unknown location";
    let locationUrl = "";
    let matchedUserId = null;

    if (matchedProfile) {
      matchedUserId = matchedProfile.userId;
      const user = await User.findById(matchedUserId).lean().catch(() => null);
      if (user) userName = user.name;

      // Get latest SOS record that actually has GPS coordinates
      const latestSOS = await SOS.findOne({ userId: matchedUserId, lat: { $exists: true }, lng: { $exists: true } })
        .sort({ timestamp: -1 })
        .lean()
        .catch(() => null);

      if (latestSOS?.lat && latestSOS?.lng) {
        locationStr = `${latestSOS.lat.toFixed(5)}, ${latestSOS.lng.toFixed(5)}`;
        locationUrl = `https://maps.google.com/?q=${latestSOS.lat.toFixed(6)},${latestSOS.lng.toFixed(6)}`;
      }
    }

    // Log the reply
    await SOS.create({
      userId: matchedUserId || `telegram:${chatId}`,
      message: `[TELEGRAM REPLY from ${fromName} (chat_id:${chatId})]: ${text}`,
      status: "telegram_reply",
    }).catch(() => {});

    // ── Generate AI reply ─────────────────────────────────────────────────
    let aiReply =
      `Thank you ${fromName}! 🙏\n\n` +
      `${userName} sent an emergency SOS.\n` +
      (locationUrl
        ? `📍 Their last known location: ${locationUrl}`
        : `📍 Location: ${locationStr}`) +
      `\n\nPlease reach them immediately or call emergency services (112).`;

    if (aiAgentKey) {
      try {
        const phone = matchedProfile?.phone || "";
        const bg    = matchedProfile?.bloodGroup || "";
        const age   = matchedProfile?.age || "";
        const gender = matchedProfile?.gender || "";
        const address = matchedProfile?.address || "";

        // Server-side direct answers — no AI needed for simple factual questions
        const q = text.toLowerCase();
        let directReply = "";

        const ecName  = matchedProfile?.emergencyContactName  || "";
        const ecPhone = matchedProfile?.emergencyContactPhone || "";

        if (/emergency.?contact|ec.?number|ec.?phone|contact.?number|contact.?name/.test(q)) {
          // Emergency contact details
          if (ecName || ecPhone) {
            directReply = `${userName}'s emergency contact: ${ecName || "N/A"}, Phone: ${ecPhone || "N/A"}.`;
          } else {
            directReply = `${userName}'s emergency contact details are not set in their profile.`;
          }
        } else if (/live.?loc|current.?loc|real.?time|gps|abhi.?kaha|\blocation\b|\bloc\b|where/.test(q) && !/address/.test(q)) {
          // GPS / map location
          directReply = locationUrl
            ? `${userName}'s location: ${locationUrl}`
            : `${userName}'s live GPS location is not being shared right now. Ask them to open the tracking app.`;
        } else if (/phone|number|mobile/.test(q)) {
          directReply = phone
            ? `${userName}'s phone number is ${phone}.`
            : `${userName}'s phone number is not set in their profile.`;
        } else if (/address|ghar|rahta|rehta|kaha.?rehta/.test(q)) {
          // Profile saved address
          directReply = address
            ? `${userName}'s address: ${address}.`
            : `${userName}'s address is not set in their profile.`;
        } else if (/blood|group|bloodgroup/.test(q)) {
          directReply = bg
            ? `${userName}'s blood group is ${bg}.`
            : `${userName}'s blood group is not set in their profile.`;
        } else if (/age|umar|kitne saal|how old/.test(q)) {
          directReply = age
            ? `${userName} is ${age} years old.`
            : `${userName}'s age is not set in their profile.`;
        } else if (/gender|male|female|kaun/.test(q)) {
          directReply = gender
            ? `${userName}'s gender is ${gender}.`
            : `${userName}'s gender is not set in their profile.`;
        }

        if (directReply) {
          aiReply = directReply;
          console.log("\x1b[32m%s\x1b[0m", `[AI Agent] Direct answer: ${aiReply}`);
        } else {
          // AI for complex/unclear questions — answer only what was asked
          const profileSummary =
            `Name: ${userName} | Age: ${age || "?"} | Gender: ${gender || "?"} | Blood: ${bg || "?"} | Phone: ${phone || "not set"} | Address: ${address || "?"} | Location: ${locationStr}${locationUrl ? " (" + locationUrl + ")" : ""}`;

          const prompt =
            `You are an emergency info assistant. Answer ONLY what the emergency contact asked. Be direct and concise (≤250 chars). No greetings, no templates.\n` +
            `Victim info: ${profileSummary}\n` +
            `${fromName} asked: "${text}"\n` +
            `Answer only the question asked. If you don't know, say so.`;

          const aiText = await longcatChat(prompt);
          if (aiText) aiReply = aiText.substring(0, 400);
          console.log("\x1b[32m%s\x1b[0m", `[AI Agent] Telegram reply: ${aiReply}`);
        }
      } catch (err) {
        console.error("[AI Agent] Error generating Telegram reply:", err.message);
      }
    }

    // ── Send AI reply back to the emergency contact via Telegram ──────────
    await sendTelegramMessage(chatId, aiReply);
    console.log("\x1b[32m%s\x1b[0m", `[Telegram] Auto-reply sent to ${fromName} (chat_id: ${chatId})`);
  } catch (err) {
    console.error("[Telegram Webhook Error]", err.message);
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
    const { address, phone, emergencyContact, emergencyContactName, emergencyContactPhone, emergencyContactTelegramChatId, name, age, gender, bloodGroup } = req.body;
    const update = { address, phone, emergencyContact, emergencyContactName, emergencyContactPhone, emergencyContactTelegramChatId, age, gender, bloodGroup };
    // Remove undefined fields to avoid overwriting with null
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);
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

// ─── Twilio Service Toggle (MongoDB-persisted) ────────────────────────────
// Persists across server restarts via MongoDB AppSettings collection.
let twilioServiceEnabled = true; // in-memory cache

// Load saved state from MongoDB on startup
mongoose.connection.once("open", async () => {
  try {
    const doc = await AppSettings.findOne({ key: "twilioEnabled" });
    if (doc !== null) {
      twilioServiceEnabled = doc.value;
      console.log(`\x1b[33m%s\x1b[0m`, `[Twilio] Loaded saved state from DB: ${twilioServiceEnabled ? "ENABLED" : "DISABLED"}`);
    }
  } catch (e) {
    console.warn("[Twilio] Could not load saved state:", e.message);
  }
});

app.get("/api/settings/twilio", (req, res) => {
  res.json({ enabled: twilioServiceEnabled });
});

app.post("/api/settings/twilio", async (req, res) => {
  try {
    const { enabled } = req.body;
    twilioServiceEnabled = enabled !== false && enabled !== "false";
    // Persist to MongoDB
    await AppSettings.findOneAndUpdate(
      { key: "twilioEnabled" },
      { value: twilioServiceEnabled },
      { upsert: true, new: true }
    );
    const state = twilioServiceEnabled ? "ENABLED" : "DISABLED";
    console.log(`\x1b[33m%s\x1b[0m`, `[Twilio] Service ${state} — saved to DB`);
    res.json({ success: true, enabled: twilioServiceEnabled });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not save setting" });
  }
});

// ─── Telegram Service Toggle (MongoDB-persisted) ─────────────────────────────
let telegramServiceEnabled = true; // in-memory cache

// Load saved Telegram state from MongoDB on startup
mongoose.connection.once("open", async () => {
  try {
    const tgDoc = await AppSettings.findOne({ key: "telegramEnabled" });
    if (tgDoc !== null) {
      telegramServiceEnabled = tgDoc.value;
      console.log(`\x1b[33m%s\x1b[0m`, `[Telegram] Loaded saved state from DB: ${telegramServiceEnabled ? "ENABLED" : "DISABLED"}`);
    }
  } catch (e) {
    console.warn("[Telegram] Could not load saved state:", e.message);
  }
});

app.get("/api/settings/telegram", (req, res) => {
  res.json({ enabled: telegramServiceEnabled });
});

app.post("/api/settings/telegram", async (req, res) => {
  try {
    const { enabled } = req.body;
    telegramServiceEnabled = enabled !== false && enabled !== "false";
    await AppSettings.findOneAndUpdate(
      { key: "telegramEnabled" },
      { value: telegramServiceEnabled },
      { upsert: true, new: true }
    );
    const st = telegramServiceEnabled ? "ENABLED" : "DISABLED";
    console.log(`\x1b[33m%s\x1b[0m`, `[Telegram] Service ${st} — saved to DB`);
    res.json({ success: true, enabled: telegramServiceEnabled });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not save setting" });
  }
});

// ─── Twilio Incoming SMS Webhook ────────────────────────────────────────────
// Configure this URL in your Twilio phone number settings:
//   When a Message Comes In → POST → https://<your-domain>/sms/incoming
//
// Twilio sends form-encoded body with fields: From, To, Body, etc.
app.post("/sms/incoming", express.urlencoded({ extended: false }), async (req, res) => {
  // ── Service disabled — return empty TwiML, no AI reply, no outgoing SMS ──
  if (!twilioServiceEnabled) {
    console.log("\x1b[33m%s\x1b[0m", "[SMS Incoming] Twilio service disabled — ignoring incoming SMS");
    res.set("Content-Type", "text/xml");
    return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  }
  const from    = req.body.From    || "Unknown";
  const to      = req.body.To      || "";
  const msgBody = req.body.Body    || "";

  console.log("\x1b[35m%s\x1b[0m", `[SMS Incoming] From: ${from} | Message: ${msgBody}`);

  // ── Look up who this emergency contact belongs to ─────────────────────────
  let userName        = "the person in distress";
  let ecName          = "Emergency Contact";
  let locationStr     = "unknown location";
  let locationUrl     = "";
  let matchedUserId   = null;

  try {
    // Normalise phone: strip spaces/dashes for comparison
    const normalise = p => (p || "").replace(/[\s\-().]/g, "");
    const fromNorm  = normalise(from);

    // Find the UserProfile whose emergencyContactPhone matches the sender
    const allProfiles = await UserProfile.find({
      emergencyContactPhone: { $exists: true, $ne: "" },
    }).lean();

    const matchedProfile = allProfiles.find(p => {
      return normalise(p.emergencyContactPhone) === fromNorm;
    });

    if (matchedProfile) {
      matchedUserId = matchedProfile.userId;
      ecName        = matchedProfile.emergencyContactName || ecName;

      // Get the user's name from User collection
      const user = await User.findById(matchedUserId).lean().catch(() => null);
      if (user) userName = user.name;

      // Get latest SOS record for this user to retrieve location
      const latestSOS = await SOS.findOne({ userId: matchedUserId })
        .sort({ timestamp: -1 })
        .lean()
        .catch(() => null);

      if (latestSOS && latestSOS.lat && latestSOS.lng) {
        locationStr = `${latestSOS.lat.toFixed(5)}, ${latestSOS.lng.toFixed(5)}`;
        locationUrl = `https://maps.google.com/?q=${latestSOS.lat.toFixed(6)},${latestSOS.lng.toFixed(6)}`;
      }

      console.log("\x1b[35m%s\x1b[0m",
        `[SMS Incoming] Matched user: ${userName} | EC: ${ecName} | Location: ${locationStr}`);
    } else {
      console.log("\x1b[33m%s\x1b[0m", `[SMS Incoming] No matching profile found for sender ${from}`);
    }
  } catch (e) {
    console.error("[SMS Incoming] Profile lookup error:", e.message);
  }

  // ── Save incoming SMS to SOS log so it appears in the dashboard ──────────
  try {
    await SOS.create({
      userId: matchedUserId || `sms:${from}`,
      message: `[REPLY from ${ecName} (${from})]: ${msgBody}`,
      status: "reply_received",
    });
  } catch (e) {
    console.error("[SMS Incoming] DB log error:", e.message);
  }

  // ── Generate AI reply via LongCat AI ──────────────────────────────────────
  let aiReply = `Thank you ${ecName}. ${userName}'s location: ${locationUrl || locationStr}. Emergency services notified. Please stay calm and await further updates.`;

  if (aiAgentKey) {
    try {
      const phone  = matchedProfile?.phone || "";
      const bg     = matchedProfile?.bloodGroup || "";
      const age    = matchedProfile?.age || "";
      const gender = matchedProfile?.gender || "";
      const address = matchedProfile?.address || "";

      // Server-side direct answers — no AI needed for simple factual questions
      const q = msgBody.toLowerCase();
      let directReply = "";

      if (/phone|number|mobile|contact/.test(q)) {
        directReply = phone
          ? `${userName}'s phone number is ${phone}.`
          : `${userName}'s phone number is not set in their profile.`;
      } else if (/kaha|kha|where|location|loc|address/.test(q)) {
        directReply = locationUrl
          ? `${userName}'s last known location: ${locationUrl}`
          : address
            ? `${userName}'s address: ${address}. Live location not available.`
            : `${userName}'s live location is not available right now.`;
      } else if (/blood|group|bloodgroup/.test(q)) {
        directReply = bg
          ? `${userName}'s blood group is ${bg}.`
          : `${userName}'s blood group is not set in their profile.`;
      } else if (/age|umar|kitne saal|how old/.test(q)) {
        directReply = age
          ? `${userName} is ${age} years old.`
          : `${userName}'s age is not set in their profile.`;
      } else if (/gender|male|female/.test(q)) {
        directReply = gender
          ? `${userName}'s gender is ${gender}.`
          : `${userName}'s gender is not set in their profile.`;
      }

      if (directReply) {
        aiReply = directReply;
        console.log("\x1b[32m%s\x1b[0m", `[AI Agent] Direct answer: ${aiReply}`);
      } else {
        // AI for complex/unclear questions — answer only what was asked
        const profileSummary =
          `Name: ${userName} | Age: ${age || "?"} | Gender: ${gender || "?"} | Blood: ${bg || "?"} | Phone: ${phone || "not set"} | Address: ${address || "?"} | Location: ${locationStr}${locationUrl ? " (" + locationUrl + ")" : ""}`;

        const prompt =
          `You are an emergency info assistant. Answer ONLY what the emergency contact asked. Be direct and concise (≤220 chars). No greetings, no templates.\n` +
          `Victim info: ${profileSummary}\n` +
          `${ecName} asked: "${msgBody}"\n` +
          `Answer only the question asked. If you don't know, say so.`;

        const text = await longcatChat(prompt);
        if (text) aiReply = text.substring(0, 320);
        console.log("\x1b[32m%s\x1b[0m", `[AI Agent] LongCat reply: ${aiReply}`);
      }
    } catch (err) {
      console.error("[AI Agent] LongCat error:", err.message);
    }
  }

  // ── Respond with TwiML so Twilio sends the AI reply back as an SMS ────────
  res.set("Content-Type", "text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${aiReply.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Message>
</Response>`);
});

// POST send SMS alert to emergency contact
// Uses Twilio if credentials are in .env, otherwise logs to console
app.post("/api/send-sms", async (req, res) => {
  // ── Server-side guard — respect Twilio toggle setting ──
  if (!twilioServiceEnabled) {
    console.log("\x1b[33m%s\x1b[0m", "[SMS] Twilio service is DISABLED — SMS not sent");
    return res.json({ success: false, message: "Twilio service is disabled" });
  }

  try {
    let { to, message } = req.body;
    if (!to || !message) {
      return res.status(400).json({ success: false, message: "'to' and 'message' are required" });
    }

    // Normalise phone number to E.164 format (+91XXXXXXXXXX)
    to = to.replace(/[\s\-().]/g, "");          // remove spaces, dashes, brackets
    if (!to.startsWith("+")) to = "+91" + to;   // add +91 if missing

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    if (accountSid && authToken && fromNumber) {
      // Twilio integration (install with: npm install twilio)
      let twilioClient;
      try { twilioClient = require("twilio")(accountSid, authToken); }
      catch(e) {
        console.error("[SMS] Twilio creds found but package not installed. Run: npm install twilio");
        const smsUri = `sms:${to}?body=${encodeURIComponent(message)}`;
        return res.json({ success: true, provider: "none", smsUri });
      }
      const msg = await twilioClient.messages.create({ body: message, from: fromNumber, to });
      console.log("\x1b[32m%s\x1b[0m", `[SMS] Sent via Twilio → SID: ${msg.sid} | To: ${to}`);
      return res.json({ success: true, provider: "twilio", sid: msg.sid });
    } else {
      // No Twilio credentials — log and return sms-uri for client fallback
      console.log("\x1b[33m%s\x1b[0m", `[SMS] (No Twilio creds) Would send to ${to}: ${message}`);
      const smsUri = `sms:${to}?body=${encodeURIComponent(message)}`;
      return res.json({ success: true, provider: "none", smsUri });
    }
  } catch (err) {
    console.error("[SMS Error]", err.message);
    res.status(500).json({ success: false, message: err.message });
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

  // Register Telegram webhook after server starts
  setupTelegramWebhook();
});
