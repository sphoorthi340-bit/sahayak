// Sahayak — Field Node Firmware (Phase 6 & 7)
// ⚠ VERIFY PIN ORDER MATCHES YOUR RIBBON WIRING
// GPIO Pins: 
// - Keypad: R1-R4(13,12,14,27), C1-C4(26,25,33,32)
// - OLED: SDA(21), SCL(22)
// - Crypto Switch: 4 (INPUT_PULLUP)
// - Tamper LED: 15
// - Onboard Status LED: 2
// - Battery ADC: 35
// 
// Bug Fixes: 
// - Removed WiFi.channel(0)
// - Fixed BASE_MAC to {0x1C, 0xC3, 0xAB, 0xB4, 0x45, 0xA8}
// - Removed Deep Sleep for continuous keypad scanning
// - Fixed LED_BUILTIN redefinition


#include <esp_now.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include <U8g2lib.h>
#include <Wire.h>
#include <Keypad.h>
#include <ArduinoOTA.h>

// ─── CONFIGURATION ───────────────────────────────────────
uint8_t BASE_MAC[] = {0x1C, 0xC3, 0xAB, 0xB4, 0x45, 0xA8};
const uint8_t XOR_KEY[] = "SAHAYAK2026";
const size_t XOR_KEY_LEN = 11;
const char* MASTER_PIN = "1234";

// ─── HARDWARE ───────────────────────────────────────────
#define PIN_CRYPTO_SW 4
#define PIN_TAMPER_LED 15
#define PIN_BATTERY_ADC 35
#define STATUS_LED 2

U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);

// ─── KEYPAD ─────────────────────────────────────────────
const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
byte rowPins[ROWS] = {13, 12, 14, 27}; 
byte colPins[COLS] = {26, 25, 33, 32}; 
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// ─── STATE ──────────────────────────────────────────────
enum NodeState { LOCKED, ADMIN_LOGIN, UNLOCKED };
NodeState nodeState = LOCKED;
String inputBuffer = "";
int hazardIndex = 0;
const char* HAZARDS[] = {"flood", "cyclone", "landslide", "heatwave"};
const char* HAZ_LABELS[] = {"FLOOD", "CYCLONE", "LANDSLIDE", "HEATWAVE"};
const char* HAZ_ICONS[] = {"~~~~~", "@ @ @", "/////", "* * *"};
bool ackReceived = false;
bool lastSwitchState = false;

// ─── CRYPTO ─────────────────────────────────────────────
void xorCrypt(uint8_t* buf, size_t len) {
    for (size_t i = 0; i < len; i++) {
        buf[i] ^= XOR_KEY[i % XOR_KEY_LEN];
    }
}

// ─── DISPLAY ─────────────────────────────────────────────
void drawLocked() {
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(25, 10, "SAHAYAK NODE");
    u8g2.drawLine(0, 13, 128, 13);
    
    u8g2.setFont(u8g2_font_5x7_tf);
    u8g2.drawStr(5, 25, "1. CONNECT TO NODE WIFI");
    u8g2.drawStr(5, 33, "2. OPEN SAHAYAK.LOCAL");
    
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(0, 46, "QUICK ALERT:");
    u8g2.setFont(u8g2_font_5x7_tf);
    u8g2.drawStr(0, 56, "1:FLOOD 2:CYC 3:LAND 4:HEAT");
    u8g2.drawStr(0, 64, "* FOR ADMIN LOGIN");
    
    u8g2.sendBuffer();
}

void drawAdminLogin() {
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(30, 10, "ADMIN LOGIN");
    u8g2.drawLine(0, 13, 128, 13);
    u8g2.drawStr(35, 30, "Enter PIN:");
    
    for(int i=0; i<4; i++) {
        if(i < inputBuffer.length()) {
            u8g2.drawBox(40 + (i*15), 40, 10, 10);
        } else {
            u8g2.drawFrame(40 + (i*15), 40, 10, 10);
        }
    }
    u8g2.drawStr(10, 60, "Press * to Cancel");
    u8g2.sendBuffer();
}

void drawIdle() {
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(0, 10, "SAHAYAK NODE");
    
    if(digitalRead(PIN_CRYPTO_SW) == HIGH) {
        u8g2.drawStr(80, 10, "[SECURE]");
    }
    
    u8g2.drawLine(0, 13, 128, 13);
    
    u8g2.setFont(u8g2_font_10x20_tf);
    u8g2.drawStr(10, 38, HAZ_LABELS[hazardIndex]);
    
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(0, 52, HAZ_ICONS[hazardIndex]);
    u8g2.drawStr(0, 63, "A=MODE  #=SEND  D=LOCK");
    u8g2.sendBuffer();
}

// ─── COMMS ──────────────────────────────────────────────
void sendAlert(bool isTamper = false, const char* msg = "") {
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_6x10_tf);
    bool secureMode = (digitalRead(PIN_CRYPTO_SW) == HIGH);
    
    if (isTamper) {
        u8g2.drawStr(20, 35, "SENDING TAMPER!!");
    } else {
        u8g2.drawStr(30, 35, secureMode ? "SECURE SEND..." : "SENDING...");
    }
    u8g2.sendBuffer();

    ackReceived = false;
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char nodeId[16];
    snprintf(nodeId, sizeof(nodeId), "field_%02X%02X", mac[4], mac[5]);

    StaticJsonDocument<320> doc;
    if(isTamper) {
        doc["type"] = "tamper";
        doc["node_id"] = nodeId;
        doc["msg"] = msg;
    } else {
        doc["node_id"] = nodeId;
        doc["hazard"] = HAZARDS[hazardIndex];
        doc["severity"] = "high";
        doc["location"] = "zone_A";
        int batVal = analogRead(PIN_BATTERY_ADC);
        int batPct = map(batVal, 0, 4095, 0, 100);
        doc["battery_pct"] = constrain(batPct, 0, 100);
        doc["secure"] = secureMode;
        doc["timestamp"] = millis();
    }

    char payload[320];
    serializeJson(doc, payload);
    size_t len = strlen(payload);

    if(secureMode && !isTamper) {
        xorCrypt((uint8_t*)payload, len);
    }

    esp_now_send(BASE_MAC, (uint8_t*)payload, len);

    if(!isTamper) {
        unsigned long start = millis();
        while (!ackReceived && millis() - start < 2000) {
            delay(10);
        }
        
        u8g2.clearBuffer();
        u8g2.setFont(u8g2_font_10x20_tf);
        if (ackReceived) {
            u8g2.drawStr(20, 35, "SENT OK");
        } else {
            u8g2.drawStr(15, 35, "FAILED!");
        }
        u8g2.sendBuffer();
        delay(1500);
        drawIdle();
    }
}

void onDataSent(const uint8_t *mac, esp_now_send_status_t status) {
    if (status == ESP_NOW_SEND_SUCCESS) {
        digitalWrite(STATUS_LED, HIGH);
        delay(50);
        digitalWrite(STATUS_LED, LOW);
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

// ─── SETUP ───────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    pinMode(PIN_CRYPTO_SW, INPUT_PULLUP);
    pinMode(PIN_TAMPER_LED, OUTPUT);
    pinMode(STATUS_LED, OUTPUT);
    digitalWrite(PIN_TAMPER_LED, LOW);
    digitalWrite(STATUS_LED, LOW);
    
    lastSwitchState = digitalRead(PIN_CRYPTO_SW);

    Wire.begin(21, 22);
    u8g2.begin();
    
    WiFi.mode(WIFI_STA);
    
    Serial.print("Field Node MAC: ");
    Serial.println(WiFi.macAddress());

    if (esp_now_init() != ESP_OK) {
        Serial.println("ESP-NOW init failed");
        return;
    }

    esp_now_register_send_cb(onDataSent);
    esp_now_register_recv_cb(onDataRecv);

    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, BASE_MAC, 6);
    peerInfo.channel = 0;
    peerInfo.encrypt = false;
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        Serial.println("Failed to add peer");
    }

    drawLocked();
    Serial.println("Field node ready in LOCKED state");
}

// ─── LOOP ────────────────────────────────────────────────
void loop() {
    char key = keypad.getKey();
    bool currentSwitch = digitalRead(PIN_CRYPTO_SW);

    // Tamper Detection logic
    if(currentSwitch != lastSwitchState) {
        lastSwitchState = currentSwitch;
        if(nodeState == LOCKED) {
            digitalWrite(PIN_TAMPER_LED, HIGH);
            u8g2.clearBuffer();
            u8g2.setFont(u8g2_font_10x20_tf);
            u8g2.drawStr(10, 35, "!! TAMPER !!");
            u8g2.sendBuffer();
            
            sendAlert(true, "Switch toggled while locked");
            
            delay(2000);
            digitalWrite(PIN_TAMPER_LED, LOW);
            drawLocked();
        }
    }

    if (!key) return;

    if (nodeState == LOCKED) {
        if (key >= '1' && key <= '4') {
            // Quick Emergency Alert
            hazardIndex = key - '1';
            sendAlert();
        } else if (key == '*') {
            nodeState = ADMIN_LOGIN;
            inputBuffer = "";
            drawAdminLogin();
        }
    } else if (nodeState == ADMIN_LOGIN) {
        if (key >= '0' && key <= '9') {
            inputBuffer += key;
            drawAdminLogin();
            if (inputBuffer.length() == 4) {
                if (inputBuffer == MASTER_PIN) {
                    nodeState = UNLOCKED;
                    inputBuffer = "";
                    drawIdle();
                } else {
                    u8g2.clearBuffer();
                    u8g2.setFont(u8g2_font_10x20_tf);
                    u8g2.drawStr(30, 35, "WRONG PIN");
                    u8g2.sendBuffer();
                    delay(1500);
                    inputBuffer = "";
                    drawAdminLogin();
                }
            }
        } else if (key == '*') {
            nodeState = LOCKED;
            inputBuffer = "";
            drawLocked();
        }
    } else { // UNLOCKED
        if (key == 'A') {
            hazardIndex = (hazardIndex + 1) % 4;
            drawIdle();
        } else if (key == '#') {
            sendAlert();
        } else if (key == 'D') {
            // Check for long press for OTA
            unsigned long startPress = millis();
            bool held = true;
            while(keypad.getState() == PRESSED) {
                if (millis() - startPress > 3000) {
                    held = true;
                    break;
                }
                delay(10);
                held = false;
            }
            
            if (millis() - startPress > 3000) {
                u8g2.clearBuffer();
                u8g2.drawStr(0, 32, "OTA MODE ACTIVE");
                u8g2.sendBuffer();
                WiFi.begin("Sahayak_Hotspot", "12345678");
                while (WiFi.status() != WL_CONNECTED) delay(100);
                ArduinoOTA.begin();
                while(true) ArduinoOTA.handle();
            } else {
                nodeState = LOCKED;
                inputBuffer = "";
                drawLocked();
            }
        }
    }
}
