// Sahayak — Base Station Firmware v2
// Fixes: ArduinoOTA.begin() added, SPIFFS queue drains on reconnect,
//        non-blocking WiFi startup, open-mode MAC whitelist.

#include <esp_now.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <ArduinoJson.h>
#include <U8g2lib.h>
#include <Wire.h>
#include <SPIFFS.h>
#include <ArduinoOTA.h>

// ─── CONFIG ─────────────────────────────────────────────
const uint8_t XOR_KEY[]  = "SAHAYAK2026";
const size_t  XOR_KEY_LEN = 11;

// ─── STATE ──────────────────────────────────────────────
unsigned long lastPingTime  = 0;
bool          laptopConnected = false;
unsigned long lastAlertTime = 0;
bool          spiffsQueueFlushed = false;

U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);

// Open mode — accept all nodes
const int numAuthorized = 0;
bool isAuthorized(const uint8_t*) { return true; }

bool isLaptopOnline() {
  return laptopConnected && (millis() - lastPingTime < 5000);
}

void xorCrypt(uint8_t* buf, size_t len) {
  for (size_t i = 0; i < len; i++) buf[i] ^= XOR_KEY[i % XOR_KEY_LEN];
}

// ─── SPIFFS QUEUE ────────────────────────────────────────
void flushSpiffsQueue() {
  if (!SPIFFS.exists("/queue.txt")) return;
  File f = SPIFFS.open("/queue.txt", FILE_READ);
  if (!f) return;
  int flushed = 0;
  while (f.available()) {
    String line = f.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) {
      Serial.println(line);
      flushed++;
    }
  }
  f.close();
  if (flushed > 0) {
    SPIFFS.remove("/queue.txt");
    Serial.print("{\"type\":\"info\",\"msg\":\"Flushed ");
    Serial.print(flushed);
    Serial.println(" queued alerts\"}");
  }
}

// ─── DISPLAY ────────────────────────────────────────────
void drawIdle() {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr(0, 10, "SAHAYAK BASE");
  u8g2.drawLine(0, 13, 128, 13);
  u8g2.drawStr(0, 26, isLaptopOnline() ? "PC: CONNECTED" : "PC: WAITING...");
  u8g2.drawStr(0, 38, "Awaiting alerts...");
  uint8_t mac[6]; WiFi.macAddress(mac);
  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  u8g2.setFont(u8g2_font_5x7_tf);
  u8g2.drawStr(0, 56, macStr);
  u8g2.sendBuffer();
}

// ─── ESP-NOW RECEIVE ────────────────────────────────────
void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (!isAuthorized(info->src_addr)) return;

  uint8_t buffer[512];
  int safeLen = min(len, 511);
  memcpy(buffer, data, safeLen);
  buffer[safeLen] = 0;

  bool encrypted = (buffer[0] != '{');
  if (encrypted) xorCrypt(buffer, safeLen);

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, buffer, safeLen) != DeserializationError::Ok) return;

  // Auto-register sender for ACK
  if (!esp_now_is_peer_exist(info->src_addr)) {
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, info->src_addr, 6);
    peer.channel = 0; peer.encrypt = false;
    esp_now_add_peer(&peer);
  }

  // Handle heartbeat packets
  const char* pktType = doc["type"] | "";
  if (strcmp(pktType, "heartbeat") == 0) {
    // Forward heartbeat to laptop for node tracking
    char fwd[256]; serializeJson(doc, fwd);
    if (isLaptopOnline()) Serial.println(fwd);
    return;
  }

  // Tamper
  if (strcmp(pktType, "tamper") == 0) {
    u8g2.clearBuffer(); u8g2.setFont(u8g2_font_10x20_tf);
    u8g2.drawStr(10, 35, "!! TAMPER !!"); u8g2.sendBuffer();
    char fwd[256]; serializeJson(doc, fwd);
    if (isLaptopOnline()) { Serial.println(fwd); }
    delay(3000); drawIdle(); return;
  }

  // Normal alert — forward JSON
  StaticJsonDocument<512> fwd;
  fwd["node_id"]     = doc["node_id"];
  fwd["hazard"]      = doc["hazard"] | doc["alert_type"];
  fwd["alert_type"]  = doc["alert_type"] | doc["hazard"];
  fwd["severity"]    = doc["severity"];
  fwd["timestamp"]   = doc["timestamp"];
  fwd["location"]    = doc["location"] | "unknown";
  fwd["secure"]      = encrypted;
  fwd["battery_pct"] = doc["battery_pct"] | 100;
  fwd["rssi"]        = info->rx_ctrl->rssi;

  char forwardStr[512]; serializeJson(fwd, forwardStr);

  if (isLaptopOnline()) {
    Serial.println(forwardStr);
  } else {
    File f = SPIFFS.open("/queue.txt", FILE_APPEND);
    if (f) { f.println(forwardStr); f.close(); }
  }

  // Update OLED
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr(0, 10, encrypted ? "SECURE ALERT" : "ALERT RECEIVED");
  const char* hazard = doc["hazard"] | doc["alert_type"] | "?";
  u8g2.drawStr(0, 28, hazard);
  u8g2.drawStr(0, 42, doc["node_id"] | "unknown");
  char rssiStr[16]; snprintf(rssiStr, sizeof(rssiStr), "RSSI: %d", info->rx_ctrl->rssi);
  u8g2.setFont(u8g2_font_5x7_tf);
  u8g2.drawStr(0, 56, rssiStr);
  u8g2.sendBuffer();
  lastAlertTime = millis();

  // ACK
  StaticJsonDocument<64> ack; ack["type"] = "ack";
  char ackBuf[64]; serializeJson(ack, ackBuf);
  esp_now_send(info->src_addr, (uint8_t*)ackBuf, strlen(ackBuf));
}

// ─── SETUP ──────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  u8g2.begin();
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
  // Note: WiFi.begin() only called when OTA is needed, not at boot.

  if (!SPIFFS.begin(true)) Serial.println("SPIFFS mount failed");

  if (esp_now_init() != ESP_OK) { Serial.println("ESP-NOW init failed"); return; }
  esp_now_register_recv_cb(onDataRecv);

  // OTA setup (begins listening even without connecting to WiFi hotspot)
  ArduinoOTA.setHostname("sahayak-base");
  ArduinoOTA.begin();

  drawIdle();
  Serial.println("{\"type\":\"info\",\"msg\":\"Base station ready v2\"}");
}

// ─── LOOP ───────────────────────────────────────────────
void loop() {
  ArduinoOTA.handle();

  // Handle incoming serial (ping from laptop)
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    if (line.indexOf("ping") >= 0) {
      bool wasOffline = !laptopConnected;
      lastPingTime = millis();
      laptopConnected = true;
      // If laptop just came online, flush queued alerts
      if (wasOffline && !spiffsQueueFlushed) {
        delay(200); // small settle
        flushSpiffsQueue();
        spiffsQueueFlushed = true;
      }
      drawIdle(); // refresh PC status
    }
  }

  // Reset queue flush flag if laptop goes offline
  if (!isLaptopOnline() && spiffsQueueFlushed) {
    spiffsQueueFlushed = false;
    laptopConnected = false;
  }

  // Return OLED to idle after 10s
  if (lastAlertTime > 0 && millis() - lastAlertTime > 10000) {
    lastAlertTime = 0;
    drawIdle();
  }
}
