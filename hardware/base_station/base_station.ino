// Sahayak — Base Station Firmware (Phase 7)
// Receives ESP-NOW, decrypts XOR if needed, forwards to Serial.
// 
// Bug Fixes: 
// - Open mode for authorizedMACs
// - Fixed sizeof(authorizedMACs) bug
// - Fixed laptopConnected cold-start bug
// - Decryption logic for encrypted packets


#include <esp_now.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include <U8g2lib.h>
#include <Wire.h>
#include <SPIFFS.h>
#include <ArduinoOTA.h>

// ─── CONFIGURATION ───────────────────────────────────────
const uint8_t XOR_KEY[] = "SAHAYAK2026";
const size_t XOR_KEY_LEN = 11;

// ─── STATE ───────────────────────────────────────────────
unsigned long lastPingTime = 0;
bool laptopConnected = false; 
unsigned long lastAlertTime = 0;

U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, u8x8_pin_none);

// Authorized Nodes - OPEN MODE
uint8_t authorizedMACs[][6] = {}; 
const int numAuthorized = 0; // Set to 0 for open mode

bool isAuthorized(const uint8_t* mac) {
    if (numAuthorized == 0) return true;
    for (int i = 0; i < numAuthorized; i++) {
        if (memcmp(mac, authorizedMACs[i], 6) == 0) return true;
    }
    return false;
}

bool isLaptopOnline() {
    return laptopConnected && (millis() - lastPingTime < 5000);
}

void xorCrypt(uint8_t* buf, size_t len) {
    for (size_t i = 0; i < len; i++) {
        buf[i] ^= XOR_KEY[i % XOR_KEY_LEN];
    }
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

void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
    if (!isAuthorized(info->src_addr)) return;

    // Decryption logic
    uint8_t buffer[320];
    memcpy(buffer, data, len);
    bool encrypted = (buffer[0] != '{'); // XORed '{' is not '{'
    
    if (encrypted) {
        xorCrypt(buffer, len);
    }

    StaticJsonDocument<320> doc;
    DeserializationError err = deserializeJson(doc, buffer, len);
    if (err) return;

    // Register peer for ACK
    if (!esp_now_is_peer_exist(info->src_addr)) {
        esp_now_peer_info_t peer = {};
        memcpy(peer.peer_addr, info->src_addr, 6);
        peer.channel = 0;
        peer.encrypt = false;
        esp_now_add_peer(&peer);
    }

    // Tamper Check
    if (doc.containsKey("type") && strcmp(doc["type"], "tamper") == 0) {
        u8g2.clearBuffer();
        u8g2.setFont(u8g2_font_10x20_tf);
        u8g2.drawStr(10, 35, "!! TAMPER !!");
        u8g2.sendBuffer();
        
        // Forward tamper to laptop
        serializeJson(doc, Serial);
        Serial.println();
        
        delay(3000);
        drawIdle();
        return; // No ACK for tamper
    }

    // Forward to laptop
    StaticJsonDocument<512> fwd;
    fwd["node_id"]   = doc["node_id"];
    fwd["hazard"]    = doc["hazard"];
    fwd["severity"]  = doc["severity"];
    fwd["timestamp"] = doc["timestamp"];
    fwd["location"]  = doc["location"];
    fwd["secure"]    = encrypted;
    fwd["battery_pct"] = doc["battery_pct"] | -1;
    fwd["rssi"]      = info->rx_ctrl->rssi;

    char forward[512];
    serializeJson(fwd, forward);
    
    if (isLaptopOnline()) {
        Serial.println(forward);
    } else {
        File f = SPIFFS.open("/queue.txt", FILE_APPEND);
        if (f) {
            f.println(forward);
            f.close();
        }
    }

    // Update Display
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(0, 10, encrypted ? "SECURE ALERT" : "PLAIN ALERT");
    u8g2.drawStr(0, 30, (const char*)doc["hazard"]);
    u8g2.drawStr(0, 50, (const char*)doc["node_id"]);
    u8g2.sendBuffer();
    
    lastAlertTime = millis();

    // Send ACK
    StaticJsonDocument<64> ack;
    ack["type"] = "ack";
    char ackBuf[64];
    serializeJson(ack, ackBuf);
    esp_now_send(info->src_addr, (uint8_t*)ackBuf, strlen(ackBuf));
}

void setup() {
    Serial.begin(115200);
    Wire.begin(21, 22);
    u8g2.begin();

    WiFi.mode(WIFI_STA);
    WiFi.begin("Sahayak_Hotspot", "12345678");
    
    if (!SPIFFS.begin(true)) {
        Serial.println("SPIFFS Mount Failed");
    }

    if (esp_now_init() != ESP_OK) {
        Serial.println("ESP-NOW init failed");
        return;
    }

    esp_now_register_recv_cb(onDataRecv);
    
    drawIdle();
    Serial.println("Base station ready");
}

void loop() {
    ArduinoOTA.handle();

    if (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        if (line.indexOf("ping") >= 0) {
            lastPingTime = millis();
            laptopConnected = true;
        }
    }

    // Return to idle
    if (lastAlertTime > 0 && millis() - lastAlertTime > 10000) {
        lastAlertTime = 0;
        drawIdle();
    }
}
