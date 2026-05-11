// Sahayak — Field Node Firmware
// ESP32-WROOM-32 DevKit V1
// Sends ESP-NOW alert packets to base station
// Button GPIO32 = cycle hazard mode
// Button GPIO33 = send alert
// OLED = SSD1306 via I2C (SDA=21, SCL=22)

#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include <U8g2lib.h>
#include <Wire.h>
#include <ArduinoOTA.h>

// ─── OLED ───────────────────────────────────────────────
U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);

// ─── PINS ────────────────────────────────────────────────
#define BTN_MODE    32   // Cycle hazard
#define BTN_SEND    33   // Send alert
#define LED_BUILTIN 2    // Onboard LED (used only for blink — safe here)

// ─── ESP-NOW ─────────────────────────────────────────────
// REPLACE with your base station ESP32 MAC address
// Find it by flashing base_station and reading Serial output
uint8_t BASE_MAC[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// ─── HAZARD CONFIG ───────────────────────────────────────
const char* HAZARDS[]    = {"flood", "cyclone", "landslide", "heatwave"};
const char* HAZ_LABELS[] = {"FLOOD", "CYCLONE", "LANDSLIDE", "HEATWAVE"};
const char* HAZ_ICONS[]  = {"~~~~~", "@ @ @", "/////", "* * *"};
RTC_DATA_ATTR int hazardIndex = 0;
bool ackReceived = false;
bool sendResult  = false;

// ─── DEBOUNCE ────────────────────────────────────────────
unsigned long lastModePress = 0;
unsigned long lastSendPress = 0;
unsigned long lastActivity = 0;
#define DEBOUNCE_MS 300

// ─── CALLBACKS ───────────────────────────────────────────
void onDataSent(const uint8_t *mac, esp_now_send_status_t status) {
    sendResult = (status == ESP_NOW_SEND_SUCCESS);
    if (sendResult) {
        digitalWrite(LED_BUILTIN, HIGH);
        delay(100);
        digitalWrite(LED_BUILTIN, LOW);
    }
}

void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
    StaticJsonDocument<128> doc;
    if (deserializeJson(doc, data, len) == DeserializationError::Ok) {
        if (strcmp(doc["type"], "ack") == 0) {
            ackReceived = true;
        }
    }
}

// ─── DISPLAY ─────────────────────────────────────────────
void drawIdle() {
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(0, 10, "SAHAYAK NODE");
    u8g2.drawLine(0, 13, 128, 13);
    u8g2.setFont(u8g2_font_10x20_tf);
    u8g2.drawStr(10, 38, HAZ_LABELS[hazardIndex]);
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(0, 52, HAZ_ICONS[hazardIndex]);
    u8g2.drawStr(0, 63, "MODE  SEND");
    u8g2.sendBuffer();
}

void drawSending() {
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(30, 30, "SENDING...");
    u8g2.drawStr(20, 45, HAZ_LABELS[hazardIndex]);
    u8g2.sendBuffer();
}

void drawAck(bool success) {
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_10x20_tf);
    if (success) {
        u8g2.drawStr(20, 35, "SENT OK");
    } else {
        u8g2.drawStr(15, 35, "FAILED!");
    }
    u8g2.sendBuffer();
    delay(1000);
}

// ─── SEND ALERT ──────────────────────────────────────────
void sendAlert() {
    drawSending();
    ackReceived = false;

    char nodeId[16];
    uint8_t mac[6];
    WiFi.macAddress(mac);
    snprintf(nodeId, sizeof(nodeId), "field_%02X%02X", mac[4], mac[5]);

    int battery_pct = map(analogRead(35), 0, 4095, 0, 100);
    if(battery_pct < 0) battery_pct = 0;
    if(battery_pct > 100) battery_pct = 100;

    StaticJsonDocument<256> doc;
    doc["node_id"]   = nodeId;
    doc["hazard"]    = HAZARDS[hazardIndex];
    doc["severity"]  = "high";
    doc["timestamp"] = millis();
    doc["location"]  = "zone_A";
    doc["battery_pct"] = battery_pct;

    char payload[256];
    serializeJson(doc, payload);

    esp_err_t result = esp_now_send(BASE_MAC, (uint8_t*)payload, strlen(payload));

    // Wait up to 2s for ACK
    unsigned long start = millis();
    while (!ackReceived && millis() - start < 2000) {
        delay(10);
    }

    drawAck(result == ESP_OK && ackReceived);
    drawIdle();
}

// ─── SETUP ───────────────────────────────────────────────
void setup() {
    Serial.begin(115200);

    pinMode(BTN_MODE, INPUT_PULLUP);
    pinMode(BTN_SEND, INPUT_PULLUP);
    pinMode(LED_BUILTIN, OUTPUT);
    digitalWrite(LED_BUILTIN, LOW);

    // OLED init
    Wire.begin(21, 22);
    u8g2.begin();

    // WiFi in STA mode required for ESP-NOW
    WiFi.mode(WIFI_STA);
    WiFi.channel(0); // Channel 0

    Serial.print("Field Node MAC: ");
    Serial.println(WiFi.macAddress());

    // ESP-NOW init
    if (esp_now_init() != ESP_OK) {
        Serial.println("ESP-NOW init failed");
        u8g2.clearBuffer();
        u8g2.setFont(u8g2_font_6x10_tf);
        u8g2.drawStr(0, 32, "ESP-NOW FAIL");
        u8g2.sendBuffer();
        return;
    }

    esp_now_register_send_cb(onDataSent);
    esp_now_register_recv_cb(onDataRecv);

    // Register base station peer
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, BASE_MAC, 6);
    peerInfo.channel = 0;
    peerInfo.encrypt = false;

    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        Serial.println("Failed to add peer");
    }

    // Deep Sleep Wakeup logic
    esp_sleep_wakeup_cause_t wakeup_reason = esp_sleep_get_wakeup_cause();
    uint64_t wakeup_pin_mask = esp_sleep_get_ext1_wakeup_status();

    if (wakeup_reason == ESP_SLEEP_WAKEUP_EXT0) {
        // Woke up from BTN_SEND (ext0)
        Serial.println("Wake from BTN_SEND");
        sendAlert();
    } else if (wakeup_reason == ESP_SLEEP_WAKEUP_EXT1) {
        // Check for 3-second hold to enter OTA mode
        unsigned long startHold = millis();
        bool otaMode = false;
        while (digitalRead(BTN_MODE) == LOW) {
            if (millis() - startHold > 3000) {
                otaMode = true;
                break;
            }
            delay(10);
        }
        
        if (otaMode) {
            Serial.println("Entering OTA Mode");
            u8g2.clearBuffer();
            u8g2.setFont(u8g2_font_6x10_tf);
            u8g2.drawStr(0, 32, "OTA MODE ACTIVE");
            u8g2.sendBuffer();
            
            WiFi.begin("Sahayak_Hotspot", "12345678");
            while (WiFi.status() != WL_CONNECTED) delay(100);
            ArduinoOTA.setHostname("sahayak-node");
            ArduinoOTA.begin();
            
            while (true) {
                ArduinoOTA.handle();
                delay(10);
            }
        } else {
            // Woke up from BTN_MODE (ext1) normal press
            Serial.println("Wake from BTN_MODE");
            hazardIndex = (hazardIndex + 1) % 4;
            Serial.printf("Hazard mode: %s\n", HAZARDS[hazardIndex]);
            drawIdle();
        }
    } else {
        // Normal boot
        drawIdle();
    }

    esp_sleep_enable_ext0_wakeup((gpio_num_t)BTN_SEND, 0);
    esp_sleep_enable_ext1_wakeup(1ULL << BTN_MODE, ESP_EXT1_WAKEUP_ALL_LOW);
    
    lastActivity = millis();
    Serial.println("Field node ready");
}

// ─── LOOP ────────────────────────────────────────────────
void loop() {
    unsigned long now = millis();

    // Mode button — cycle hazard
    if (digitalRead(BTN_MODE) == LOW && now - lastModePress > DEBOUNCE_MS) {
        lastModePress = now;
        lastActivity = now;
        hazardIndex = (hazardIndex + 1) % 4;
        Serial.printf("Hazard mode: %s\n", HAZARDS[hazardIndex]);
        drawIdle();
    }

    // Send button — fire alert
    if (digitalRead(BTN_SEND) == LOW && now - lastSendPress > DEBOUNCE_MS) {
        lastSendPress = now;
        lastActivity = now;
        sendAlert();
    }
    
    // Go to deep sleep after 10 seconds of inactivity
    if (now - lastActivity > 10000) {
        Serial.println("Going to sleep...");
        u8g2.clearBuffer();
        u8g2.sendBuffer(); // Turn off OLED
        esp_deep_sleep_start();
    }
}
