# 🚨 Smart Emergency Assistance Platform

A real-time emergency assistance platform with IoT GPS tracking, interactive maps, SOS alerts, and AI-powered features.

## Features

- **Live IoT GPS Tracking** — Real-time location updates from IoT device (with simulation fallback)
- **Interactive Google Maps** — Live map with nearby hospitals and police stations
- **SOS Emergency Alerts** — One-click SOS with location broadcast
- **User Authentication** — Signup/Login system
- **AI Assistant** — Powered by Google Gemini AI
- **Responsive Dashboard** — Battery, signal, speed monitoring

## Tech Stack

- **Backend**: Node.js, Express.js
- **Frontend**: HTML5, CSS3, Vanilla JS
- **Maps**: Google Maps JavaScript API
- **AI**: Google Gemini AI (`@google/generative-ai`)

## Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/princethakur931/SMART-EMERGENCY-ASSISTANCE-PLATFORM.git
cd SMART-EMERGENCY-ASSISTANCE-PLATFORM
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```env
PORT=3000
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

> **Get API Keys:**
> - Google Maps: [console.cloud.google.com](https://console.cloud.google.com/)
> - Gemini AI: [aistudio.google.com](https://aistudio.google.com/)

### 4. Start the server

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
├── server.js           # Express server, API routes
├── package.json
├── .env                # Environment variables (NOT committed)
├── .env.example        # Environment variable template
├── .gitignore
└── public/
    ├── index.html      # Login page
    ├── signup.html     # Signup page
    ├── dashboard.html  # Main dashboard
    ├── css/
    │   ├── auth.css
    │   ├── dashboard.css
    │   └── global.css
    └── js/
        ├── auth.js
        ├── dashboard.js
        └── particles.js
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Public config (Google Maps key) |
| GET | `/api/health` | Server health check |
| GET | `/api/iot/location` | Current IoT device location |
| POST | `/api/iot/update` | Update IoT device location |
| POST | `/api/auth/signup` | Register new user |
| POST | `/api/auth/login` | Login user |
| POST | `/api/sos` | Send SOS alert |
| GET | `/api/sos/logs` | Get recent SOS logs |

## Security

- API keys are stored in `.env` (excluded from git via `.gitignore`)
- Google Maps API key is served to the frontend via a secure `/api/config` endpoint — never hardcoded in HTML
- Copy `.env.example` to `.env` and fill in your own keys before running

## License

MIT
