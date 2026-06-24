#include <TinyGPS++.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ─── WiFi Configuration ──────────────────────────────────────
// ⚠️ Apna WiFi SSID aur Password yahan dalo
const char* WIFI_SSID     = "12345678";
const char* WIFI_PASSWORD = "55555555";

// ─── Server URL ──────────────────────────────────────────────
// LOCAL TESTING via Ngrok (ngrok http 3000)
// Render pe deploy karne ke baad yahan Render URL dalo
const char* SERVER_URL = "https://yetta-presubsistent-penny.ngrok-free.dev";

const String PHONE_NUMBER = "+919028804769"; 

#define SMS_BUTTON_PIN 14   
#define CALL_BUTTON_PIN 27  

#define GSM_RX 16
#define GSM_TX 17
HardwareSerial sim800(2); 

#define GPS_RX 4
#define GPS_TX 5
HardwareSerial neogps(1);

TinyGPSPlus gps;

// ─── Button State & Lockout ──────────────────────────────────
unsigned long lastSmsTriggerTime = 0;
unsigned long lastCallTriggerTime = 0;
const unsigned long DEBOUNCE_DELAY = 30000; // 30 seconds lockout to prevent double-triggers (e.g. from SIM800 power sags)

// ─── WiFi Connect ────────────────────────────────────────────
void connectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("✓ WiFi Connected! IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("✗ WiFi Connection Failed! SOS will work via SMS/Call only.");
  }
}

// ─── Notify Server (HTTP POST) ───────────────────────────────
// Sends SOS trigger to website so SOS button auto-triggers
void notifyServer(String buttonType, String gpsLink) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Server] WiFi not connected — skipping server notification");
    // Try to reconnect in background
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    return;
  }

  HTTPClient http;
  WiFiClientSecure client;
  client.setInsecure(); // Skip SSL certificate validation
  String url = String(SERVER_URL) + "/api/iot/sos-trigger";
  
  Serial.print("[Server] Sending SOS trigger to: ");
  Serial.println(url);

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  // Ngrok bypass header (if using ngrok)
  http.addHeader("ngrok-skip-browser-warning", "1");
  http.setTimeout(10000); // 10 second timeout

  // Build JSON payload
  String payload = "{";
  payload += "\"buttonType\":\"" + buttonType + "\"";
  payload += ",\"deviceId\":\"IOT-EMERGENCY-001\"";
  
  if (gps.location.isValid()) {
    payload += ",\"lat\":" + String(gps.location.lat(), 6);
    payload += ",\"lng\":" + String(gps.location.lng(), 6);
  }
  
  payload += "}";

  int httpCode = http.POST(payload);
  
  if (httpCode > 0) {
    Serial.print("[Server] Response code: ");
    Serial.println(httpCode);
    String response = http.getString();
    Serial.print("[Server] Response: ");
    Serial.println(response);
    
    if (httpCode == 200) {
      Serial.println("✓ Server notified — Website SOS will auto-trigger!");
    }
  } else {
    Serial.print("[Server] HTTP Error: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
}

void setup() {
  Serial.begin(115200);
  
  pinMode(SMS_BUTTON_PIN, INPUT_PULLUP);
  pinMode(CALL_BUTTON_PIN, INPUT_PULLUP);
  
  sim800.begin(9600, SERIAL_8N1, GSM_RX, GSM_TX);
  neogps.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);

  Serial.println("System Initializing...");
  
  // Connect to WiFi
  connectWiFi();
  
  delay(5000); 

  // SMS Configuration
  sim800.println("AT+CMGF=1"); 
  delay(500);
  sim800.println("AT+CSMP=17,167,0,0"); 
  delay(500);
  sim800.println("AT+CMGD=1,4"); 
  delay(500);
  
  Serial.println("System Ready.");
  Serial.println("─── IoT Device Active ───");
  Serial.println("SMS Button: GPIO 14");
  Serial.println("Call Button: GPIO 27");
  Serial.println("WiFi Status: " + String(WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected"));
  Serial.println("Server: " + String(SERVER_URL));
  Serial.println("──────────────────────────");
}

void loop() {
  while (neogps.available()) {
    gps.encode(neogps.read());
  }

  // Grace period: Ignore button presses during the first 15 seconds of startup to avoid transients
  if (millis() < 15000) {
    return;
  }

  // ─── SMS Button Pressed ───────────────────────────────
  if (digitalRead(SMS_BUTTON_PIN) == LOW && (lastSmsTriggerTime == 0 || millis() - lastSmsTriggerTime > DEBOUNCE_DELAY)) {
    lastSmsTriggerTime = millis();
    Serial.println("═══ SMS Button Pressed! ═══");
    String loc = getGPSLink();
    
    // 1. Notify server → Website SOS auto-trigger
    notifyServer("sms", loc);
    
    // 2. Send SMS via GSM (existing functionality)
    sendSMS(loc);
    
    delay(3000); 
  }

  // ─── Call Button Pressed ──────────────────────────────
  if (digitalRead(CALL_BUTTON_PIN) == LOW && (lastCallTriggerTime == 0 || millis() - lastCallTriggerTime > DEBOUNCE_DELAY)) {
    lastCallTriggerTime = millis();
    Serial.println("═══ Call Button Pressed! ═══");
    
    // 1. Notify server → Website SOS auto-trigger
    notifyServer("call", getGPSLink());
    
    // 2. Make call via GSM (existing functionality)
    makeCall();
    
    delay(3000); 
  }

  // ─── Auto-reconnect WiFi if disconnected ──────────────
  static unsigned long lastWiFiCheck = 0;
  if (millis() - lastWiFiCheck > 30000) { // Check every 30 seconds
    lastWiFiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[WiFi] Reconnecting...");
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
  }
}

String getGPSLink() {
  if (gps.location.isValid()) {
    return "https://www.google.com/maps?q=" + String(gps.location.lat(), 6) + "," + String(gps.location.lng(), 6);
  } else {
    return "Location not fixed yet.";
  }
}

void sendSMS(String message) {
  Serial.println("Starting SMS Routine...");
  
  sim800.print("AT+CMGS=\"" + PHONE_NUMBER + "\"\r");
  delay(1500); 
  
  sim800.print("Emergency Alert! " + message);
  delay(500);
  
  sim800.write(0x1A); 
  

  unsigned long startTime = millis();
  while (millis() - startTime < 10000) { 
    if (sim800.available()) {
      String response = sim800.readString();
      Serial.println("GSM Response: " + response);
      if (response.indexOf("+CMGS:") != -1) {
        Serial.println("SMS SENT SUCCESSFULLY!");
        break;
      }
    }
  }
}

void makeCall() {
  Serial.println("Calling...");
  sim800.println("ATD" + PHONE_NUMBER + ";"); 
  delay(20000); 
  sim800.println("ATH"); 
  Serial.println("Call Ended.");
}