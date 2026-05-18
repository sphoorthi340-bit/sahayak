// Sahayak — Field Node Firmware v2
// One-Press Disaster UX: press 1-9 → OLED preview → Hold A to send
//
// Key Map:
//   1=MEDICAL  2=MISSING  3=FLOOD  4=FIRE  5=FOOD/WATER
//   6=TRAPPED  7=SAFE HERE  8=NEED EVAC  9=SOS
//   * = Admin login  D (long) = OTA mode
//
// GPIO:
//   Keypad: R1-R4(13,12,14,27)  C1-C4(26,25,33,32)
//   OLED:   SDA(21) SCL(22)
//   Crypto: GPIO4 (INPUT_PULLUP)
//   LED:    GPIO2 (onboard, state machine)
//   Batt:   GPIO35 (ADC)

#include <esp_now.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <ArduinoJson.h>
#include <U8g2lib.h>
#include <Wire.h>
#include <Keypad.h>
#include <ArduinoOTA.h>

// ─── CONFIGURATION ──────────────────────────────────────
uint8_t BASE_MAC[]       = {0x28, 0x05, 0xA5, 0x35, 0x2E, 0xD4};
const uint8_t XOR_KEY[]  = "SAHAYAK2026";
const size_t  XOR_KEY_LEN = 11;
const char*   MASTER_PIN  = "1234";
const unsigned long HEARTBEAT_INTERVAL_MS = 30000; // 30s

// ─── HARDWARE ───────────────────────────────────────────
#define PIN_CRYPTO_SW  4
#define PIN_STATUS_LED 2
#define PIN_BATTERY_ADC 35

U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);

// ─── KEYPAD ─────────────────────────────────────────────
const byte ROWS = 4, COLS = 4;
char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
byte rowPins[ROWS] = {13, 12, 14, 27};
byte colPins[COLS] = {26, 25, 33, 32};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// ─── ALERT TYPE REGISTRY ────────────────────────────────
struct AlertType {
  const char* id;
  const char* label;
  const char* severity;
  const char* icon; // ASCII art for OLED
};
const AlertType ALERTS[] = {
  {"medical",    "MEDICAL",     "high",     "+++"},  // key 1
  {"missing",    "MISSING",     "high",     "???"},  // key 2
  {"flood",      "FLOOD",       "high",     "~~~"},  // key 3
  {"fire",       "FIRE",        "critical", "^^^"},  // key 4
  {"food_water", "FOOD/WATER",  "medium",   "ooo"},  // key 5
  {"trapped",    "TRAPPED",     "critical", "!!!"},  // key 6
  {"safe",       "SAFE HERE",   "low",      ":::"},  // key 7
  {"evac",       "NEED EVAC",   "high",     ">>>"},  // key 8
  {"sos",        "SOS",         "critical", "***"},  // key 9
};
const int NUM_ALERTS = 9;

// ─── LED STATE MACHINE ──────────────────────────────────
enum LedState { LED_OFF, LED_PREVIEW, LED_SENDING, LED_SUCCESS, LED_FAIL };
LedState ledState = LED_OFF;
unsigned long ledTimer = 0;
int ledBlinks = 0;
bool ledOn = false;

void setLedState(LedState s) {
  ledState = s;
  ledTimer = millis();
  ledBlinks = 0;
  ledOn = false;
  if (s == LED_OFF) digitalWrite(PIN_STATUS_LED, LOW);
}

void updateLed() {
  unsigned long now = millis();
  switch (ledState) {
    case LED_OFF: break;
    case LED_PREVIEW: // 1Hz slow blink while waiting for confirm
      if (now - ledTimer > 500) { ledOn = !ledOn; digitalWrite(PIN_STATUS_LED, ledOn); ledTimer = now; }
      break;
    case LED_SENDING: // 10Hz fast blink
      if (now - ledTimer > 100) { ledOn = !ledOn; digitalWrite(PIN_STATUS_LED, ledOn); ledTimer = now; }
      break;
    case LED_SUCCESS: // 3 slow blinks then off
      if (now - ledTimer > 400) {
        ledOn = !ledOn; digitalWrite(PIN_STATUS_LED, ledOn); ledTimer = now;
        if (!ledOn) ledBlinks++;
        if (ledBlinks >= 3) setLedState(LED_OFF);
      }
      break;
    case LED_FAIL: // 5 rapid blinks then off
      if (now - ledTimer > 80) {
        ledOn = !ledOn; digitalWrite(PIN_STATUS_LED, ledOn); ledTimer = now;
        if (!ledOn) ledBlinks++;
        if (ledBlinks >= 5) setLedState(LED_OFF);
      }
      break;
  }
}

// ─── STATE ──────────────────────────────────────────────
enum NodeState { LOCKED, ADMIN_LOGIN, PREVIEW, UNLOCKED };
NodeState nodeState = LOCKED;
String    inputBuffer = "";
int       pendingAlertIdx = -1; // which alert is being confirmed
bool      ackReceived = false;
unsigned long lastHeartbeat = 0;

// ─── CRYPTO ─────────────────────────────────────────────
void xorCrypt(uint8_t* buf, size_t len) {
  for (size_t i = 0; i < len; i++) buf[i] ^= XOR_KEY[i % XOR_KEY_LEN];
}

// ─── BATTERY ────────────────────────────────────────────
int readBatteryPct() {
  // Voltage divider assumed: ADC reads 0-3.3V mapped from 0-9V battery
  // Calibrated: 0V=0, 9V=4095 raw → but battery cutoff ~6V (min) ~9V (max)
  int raw = analogRead(PIN_BATTERY_ADC);
  // Map raw 1820 (≈6V) to 4095 (≈9V) → 0% to 100%
  int pct = map(raw, 1820, 4095, 0, 100);
  return constrain(pct, 0, 100);
}

// ─── DISPLAY ────────────────────────────────────────────
void drawLocked() {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr(20, 10, "SAHAYAK NODE");
  u8g2.drawLine(0, 13, 128, 13);
  u8g2.setFont(u8g2_font_5x7_tf);
  u8g2.drawStr(0, 26, "PRESS KEY FOR ALERT:");
  u8g2.drawStr(0, 35, "1:MED 2:MISS 3:FLOOD");
  u8g2.drawStr(0, 44, "4:FIRE 5:FOOD 6:TRAP");
  u8g2.drawStr(0, 53, "7:SAFE 8:EVAC 9:SOS");
  u8g2.drawStr(0, 63, "* = ADMIN LOGIN");
  u8g2.sendBuffer();
}

void drawPreview(int idx) {
  const AlertType& a = ALERTS[idx];
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_10x20_tf);
  u8g2.drawStr(0, 22, a.label);
  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr(0, 38, a.icon);
  u8g2.drawStr(0, 52, "HOLD [A] TO SEND");
  u8g2.drawStr(0, 63, "ANY OTHER = CANCEL");
  u8g2.sendBuffer();
}

void drawSending(bool secure) {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_10x20_tf);
  u8g2.drawStr(10, 30, "SENDING...");
  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr(0, 50, secure ? "[ENCRYPTED]" : "[PLAIN]");
  u8g2.sendBuffer();
}

void drawResult(bool ok) {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_10x20_tf);
  u8g2.drawStr(ok ? 15 : 20, 30, ok ? "SENT OK " : "FAILED!");
  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr(0, 50, ok ? "MESH FOUND  " : "NO BASE FOUND");
  u8g2.sendBuffer();
}

void drawAdminLogin() {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr(25, 10, "ADMIN LOGIN");
  u8g2.drawLine(0, 13, 128, 13);
  u8g2.drawStr(30, 30, "Enter PIN:");
  for (int i = 0; i < 4; i++) {
    if (i < (int)inputBuffer.length()) u8g2.drawBox(40 + (i*15), 40, 10, 10);
    else u8g2.drawFrame(40 + (i*15), 40, 10, 10);
  }
  u8g2.drawStr(10, 62, "* = Cancel");
  u8g2.sendBuffer();
}

void drawHeartbeat() {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_5x7_tf);
  u8g2.drawStr(0, 7, "HEARTBEAT");
  u8g2.drawStr(0, 16, "ALIVE");
  u8g2.sendBuffer();
  delay(500);
  drawLocked();
}

// ─── COMMS ──────────────────────────────────────────────
void sendHeartbeat() {
  uint8_t mac[6]; WiFi.macAddress(mac);
  char nodeId[18]; snprintf(nodeId, sizeof(nodeId), "field_%02X%02X", mac[4], mac[5]);
  StaticJsonDocument<256> doc;
  doc["type"]        = "heartbeat";
  doc["node_id"]     = nodeId;
  doc["battery_pct"] = readBatteryPct();
  doc["rssi"]        = WiFi.RSSI();
  char buf[256]; serializeJson(doc, buf);
  Serial.println(buf); // also log to serial for debugging
  esp_now_send(BASE_MAC, (uint8_t*)buf, strlen(buf));
}

void sendAlert(int idx) {
  bool secureMode = (digitalRead(PIN_CRYPTO_SW) == HIGH);
  drawSending(secureMode);
  setLedState(LED_SENDING);

  uint8_t mac[6]; WiFi.macAddress(mac);
  char nodeId[18]; snprintf(nodeId, sizeof(nodeId), "field_%02X%02X", mac[4], mac[5]);

  StaticJsonDocument<320> doc;
  doc["node_id"]     = nodeId;
  doc["alert_type"]  = ALERTS[idx].id;
  doc["hazard"]      = ALERTS[idx].id; // legacy compat
  doc["severity"]    = ALERTS[idx].severity;
  doc["location"]    = "zone_A";
  doc["battery_pct"] = readBatteryPct();
  doc["secure"]      = secureMode;
  doc["timestamp"]   = millis();

  char payload[320]; serializeJson(doc, payload);
  size_t len = strlen(payload);
  if (secureMode) xorCrypt((uint8_t*)payload, len);

  ackReceived = false;
  esp_now_send(BASE_MAC, (uint8_t*)payload, len);

  unsigned long start = millis();
  while (!ackReceived && millis() - start < 2000) delay(10);

  bool ok = ackReceived;
  drawResult(ok);
  setLedState(ok ? LED_SUCCESS : LED_FAIL);
  delay(1500);
  drawLocked();
  nodeState = LOCKED;
  pendingAlertIdx = -1;
}

void onDataSent(const wifi_tx_info_t *info, esp_now_send_status_t status) {
  if (status == ESP_NOW_SEND_SUCCESS) {
    digitalWrite(PIN_STATUS_LED, HIGH); delay(30); digitalWrite(PIN_STATUS_LED, LOW);
  }
}

void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  StaticJsonDocument<128> doc;
  if (deserializeJson(doc, data, len) == DeserializationError::Ok) {
    if (strcmp(doc["type"] | "", "ack") == 0) ackReceived = true;
  }
}

// ─── SETUP ──────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(PIN_CRYPTO_SW, INPUT_PULLUP);
  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_STATUS_LED, LOW);

  Wire.begin(21, 22);
  u8g2.begin();
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
  Serial.print("Field Node MAC: "); Serial.println(WiFi.macAddress());

  if (esp_now_init() != ESP_OK) { Serial.println("ESP-NOW init failed"); return; }
  esp_now_register_send_cb(onDataSent);
  esp_now_register_recv_cb(onDataRecv);

  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, BASE_MAC, 6);
  peer.channel = 0; peer.encrypt = false;
  esp_now_add_peer(&peer);

  drawLocked();
  Serial.println("Field node ready — 9-type one-press UX");
  lastHeartbeat = millis();
}

// ─── LOOP ───────────────────────────────────────────────
void loop() {
  updateLed();

  // Periodic heartbeat
  if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }

  char key = keypad.getKey();
  if (!key) return;

  if (nodeState == LOCKED) {
    if (key >= '1' && key <= '9') {
      // Show preview, wait for A
      pendingAlertIdx = key - '1';
      drawPreview(pendingAlertIdx);
      nodeState = PREVIEW;
      setLedState(LED_PREVIEW);
    } else if (key == '*') {
      nodeState = ADMIN_LOGIN; inputBuffer = ""; drawAdminLogin();
    }

  } else if (nodeState == PREVIEW) {
    if (key == 'A') {
      // Confirm send
      sendAlert(pendingAlertIdx);
    } else {
      // Cancel — any other key goes back
      setLedState(LED_OFF);
      nodeState = LOCKED; pendingAlertIdx = -1; drawLocked();
    }

  } else if (nodeState == ADMIN_LOGIN) {
    if (key >= '0' && key <= '9') {
      inputBuffer += key; drawAdminLogin();
      if (inputBuffer.length() == 4) {
        if (inputBuffer == MASTER_PIN) {
          nodeState = UNLOCKED; inputBuffer = ""; drawLocked();
        } else {
          u8g2.clearBuffer(); u8g2.setFont(u8g2_font_10x20_tf);
          u8g2.drawStr(20, 35, "WRONG PIN"); u8g2.sendBuffer();
          delay(1200); inputBuffer = ""; drawAdminLogin();
        }
      }
    } else if (key == '*') {
      nodeState = LOCKED; inputBuffer = ""; drawLocked();
    }

  } else { // UNLOCKED — admin mode
    if (key >= '1' && key <= '9') {
      pendingAlertIdx = key - '1'; drawPreview(pendingAlertIdx); nodeState = PREVIEW; setLedState(LED_PREVIEW);
    } else if (key == 'D') {
      // Long-press D = OTA mode
      unsigned long start = millis();
      while (keypad.getState() == PRESSED && millis() - start < 3000) delay(10);
      if (millis() - start >= 3000) {
        u8g2.clearBuffer(); u8g2.setFont(u8g2_font_6x10_tf);
        u8g2.drawStr(0, 32, "OTA MODE ACTIVE"); u8g2.sendBuffer();
        WiFi.begin("Sahayak_Hotspot", "12345678");
        unsigned long wStart = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - wStart < 15000) delay(100);
        if (WiFi.status() == WL_CONNECTED) { ArduinoOTA.begin(); while(true) ArduinoOTA.handle(); }
        else { drawLocked(); nodeState = LOCKED; }
      } else {
        nodeState = LOCKED; drawLocked();
      }
    } else if (key == '*') {
      nodeState = LOCKED; drawLocked();
    }
  }
}
