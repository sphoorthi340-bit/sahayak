// Sahayak — Base Station Firmware
// ESP32-WROOM-32 DevKit V1
// Receives ESP-NOW from field node
// Forwards JSON to laptop via Serial
// Sends ACK back to field node
// OLED = SSD1306 via I2C (SDA=21, SCL=22)

#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include <U8g2lib.h>
#include <Wire.h>
#include <SPIFFS.h>
#include <ArduinoOTA.h>

unsigned long lastPingTime = 0;
bool isLaptopOnline() {
    return millis() - lastPingTime < 5000;
}

// ─── OLED ────────────────────────────────────────────────
U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);

// ─── STATE ───────────────────────────────────────────────
char lastHazard[32]   = "none";
char lastNodeId[32]   = "none";
char lastSeverity[16] = "none";
unsigned long lastAlertTime = 0;
// ─── AUTHORIZED NODES ────────────────────────────────────
// Empty = accept any (pairing mode). For production, hardcode MACs here.
uint8_t authorizedMACs[][6] = {
    // {0x24, 0x0A, 0xC4, 0x11, 0x22, 0x33}, // Example
};
const int numAuthorized = sizeof(authorizedMACs) / 6;

bool isAuthorized(const uint8_t* mac) {
    if (numAuthorized == 0) return true; // Open mode
    for (int i = 0; i < numAuthorized; i++) {
        if (memcmp(mac, authorizedMACs[i], 6) == 0) return true;
    }
    return false;
}

// ─── DISPLAY ─────────────────────────────────────────────
void drawIdle() {
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(0, 10, "SAHAYAK BASE");
    u8g2.drawLine(0, 13, 128, 13);
    u8g2.drawStr(0, 26, "Waiting for alert...");

    char macStr[18];
    uint8_t mac[6];
    WiFi.macAddress(mac);
    snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    u8g2.setFont(u8g2_font_5x7_tf);
    u8g2.drawStr(0, 56, "MAC:");
    u8g2.drawStr(24, 56, macStr);
    u8g2.sendBuffer();
}

void drawAlert(const char* nodeId, const char* hazard, const char* severity) {
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(0, 10, "ALERT RECEIVED");
    u8g2.drawLine(0, 13, 128, 13);

    char line1[32], line2[32], line3[32];
    snprintf(line1, sizeof(line1), "Node: %s", nodeId);
    snprintf(line2, sizeof(line2), "Hazard: %s", hazard);
    snprintf(line3, sizeof(line3), "Sev: %s", severity);

    u8g2.drawStr(0, 26, line1);
    u8g2.drawStr(0, 38, line2);
    u8g2.drawStr(0, 50, line3);
    u8g2.drawStr(0, 63, "Forwarded to laptop");
    u8g2.sendBuffer();
}

// ─── ESP-NOW RECEIVE CALLBACK ────────────────────────────
void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
    if (!isAuthorized(info->src_addr)) {
        Serial.println("Unauthorized MAC rejected");
        return;
    }

    // Register field node as peer for ACK if not already registered
    if (!esp_now_is_peer_exist(info->src_addr)) {
        esp_now_peer_info_t peer = {};
        memcpy(peer.peer_addr, info->src_addr, 6);
        peer.channel = 0;
        peer.encrypt = false;
        esp_now_add_peer(&peer);
        Serial.printf("Learned field node MAC: %02X:%02X:%02X:%02X:%02X:%02X\n",
            info->src_addr[0], info->src_addr[1], info->src_addr[2],
            info->src_addr[3], info->src_addr[4], info->src_addr[5]);
    }

    // Parse incoming JSON
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, data, len);
    if (err) {
        Serial.printf("JSON parse error: %s\n", err.c_str());
        return;
    }

    // Extract fields
    const char* nodeId   = doc["node_id"]   | "unknown";
    const char* hazard   = doc["hazard"]    | "unknown";
    const char* severity = doc["severity"]  | "unknown";
    long timestamp       = doc["timestamp"] | 0;
    const char* location = doc["location"]  | "unknown";

    strncpy(lastHazard,   hazard,   sizeof(lastHazard)-1);
    strncpy(lastNodeId,   nodeId,   sizeof(lastNodeId)-1);
    strncpy(lastSeverity, severity, sizeof(lastSeverity)-1);
    lastAlertTime = millis();

    // Forward to laptop via Serial
    char forward[512];
    StaticJsonDocument<512> fwd;
    fwd["node_id"]   = nodeId;
    fwd["hazard"]    = hazard;
    fwd["severity"]  = severity;
    fwd["timestamp"] = timestamp;
    fwd["location"]  = location;
    fwd["rssi"]      = info->rx_ctrl->rssi;
    serializeJson(fwd, forward);
    if (isLaptopOnline()) {
        Serial.println(forward); // laptop reads this
    } else {
        File f = SPIFFS.open("/queue.txt", FILE_APPEND);
        if (f) {
            f.println(forward);
            f.close();
        }
    }

    // Update display
    drawAlert(nodeId, hazard, severity);

    // Send ACK back to field node
    StaticJsonDocument<64> ack;
    ack["type"]    = "ack";
    ack["node_id"] = nodeId;
    char ackBuf[64];
    serializeJson(ack, ackBuf);
    esp_now_send(info->src_addr, (uint8_t*)ackBuf, strlen(ackBuf));
}

// ─── SETUP ───────────────────────────────────────────────
void setup() {
    Serial.begin(115200);

    Wire.begin(21, 22);
    u8g2.begin();

    WiFi.mode(WIFI_STA);
    WiFi.begin("Sahayak_Hotspot", "12345678");
    unsigned long startW = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startW < 2000) {
        delay(100);
    }
    ArduinoOTA.setHostname("sahayak-base");
    ArduinoOTA.begin();

    if (!SPIFFS.begin(true)) {
        Serial.println("SPIFFS Mount Failed");
    }

    Serial.print("Base Station MAC: ");
    Serial.println(WiFi.macAddress());

    if (esp_now_init() != ESP_OK) {
        Serial.println("ESP-NOW init failed");
        u8g2.clearBuffer();
        u8g2.setFont(u8g2_font_6x10_tf);
        u8g2.drawStr(0, 32, "ESP-NOW FAIL");
        u8g2.sendBuffer();
        return;
    }

    esp_now_register_recv_cb(onDataRecv);

    drawIdle();
    Serial.println("Base station ready");
}

// ─── LOOP ────────────────────────────────────────────────
void loop() {
    ArduinoOTA.handle();

    // Check for ping from laptop
    if (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        if (line.indexOf("ping") >= 0) {
            lastPingTime = millis();
        }
    }

    // If laptop is online, flush queue
    if (isLaptopOnline() && SPIFFS.exists("/queue.txt")) {
        File f = SPIFFS.open("/queue.txt", FILE_READ);
        if (f) {
            while (f.available()) {
                String queued = f.readStringUntil('\n');
                queued.trim();
                if (queued.length() > 0) {
                    Serial.println(queued);
                    delay(10);
                }
            }
            f.close();
            SPIFFS.remove("/queue.txt");
        }
    }

    // Return to idle display after 10 seconds
    if (lastAlertTime > 0 && millis() - lastAlertTime > 10000) {
        lastAlertTime = 0;
        drawIdle();
    }
    delay(100);
}
