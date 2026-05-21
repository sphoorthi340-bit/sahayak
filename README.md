# Sahayak (सहायक) — Resilience in Silence
### Offline-First AI Disaster Response System

[![Gemma 4 Good](https://img.shields.io/badge/Hackathon-Gemma%204%20Good-blue)](https://www.kaggle.com/c/gemma-4-good)
[![Demo Video](https://img.shields.io/badge/Demo%20Video-YouTube-red)](https://youtu.be/fTYM_cO4mZo?si=PV0i1dq9V3y_T1RN)
[![Backend](https://img.shields.io/badge/Backend-FastAPI-green)](https://fastapi.tiangolo.com/)
[![Frontend](https://img.shields.io/badge/Frontend-React%20PWA-orange)](https://react.dev/)
[![Hardware](https://img.shields.io/badge/Hardware-ESP32%20Mesh-red)](https://www.espressif.com/en/products/socs/esp32)
[![License](https://img.shields.io/badge/License-MIT-purple)](LICENSE)

> **"When the towers fall, Sahayak keeps you connected."**
> 
> Sahayak is a localized, AI-powered communication ecosystem designed to keep communities connected when cellular infrastructure is destroyed by natural disasters.
> 
> 📺 **Watch the Demo Video:** [YouTube Video Link](https://youtu.be/fTYM_cO4mZo?si=PV0i1dq9V3y_T1RN)

---

## 📖 Table of Contents
- [Project Overview](docs/PROJECT_OVERVIEW.md)
- [System Architecture](docs/ARCHITECTURE.md)
- [Demo Setup Guide](docs/DEMO_SETUP.md)
- [Problem & Impact](#-the-problem--impact)
- [The Sahayak Solution](#-the-sahayak-solution)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [Hardware Setup](#-hardware-setup)
- [Social Impact](#-social-impact)

---

## 🏆 The Problem & Impact
During disasters like the **2024 Wayanad Landslides**, cellular towers failed within minutes, leaving millions in a total information blackout. Emergency responders couldn't broadcast evacuation routes, and citizens were left without safety protocols. 

Sahayak addresses the **640,000+ villages in India** that lack redundant cellular infrastructure, providing a lifeline when every second counts.

## 💡 The Sahayak Solution
Sahayak removes reliance on the internet through a multi-layered approach:

1.  **ESP-NOW Mesh Network**: Self-healing grid of ESP32 nodes ($7/node) that broadcast alerts across Wi-Fi frequencies without routers.
2.  **Edge Intelligence (Gemma 4 E4B)**: A central command station runs Google's Gemma 4 E4B model locally via Ollama, providing protocol-grounded emergency advice in regional languages.
3.  **Multilingual PWA**: A Progressive Web App dashboard offering telemetry and safety guides in English, Hindi, and Telugu.
4.  **Hardware Fallback**: Physical nodes feature OLEDs and Matrix Keypads for direct user interaction if smartphones are lost.

---

## 🛠️ Tech Stack
| Component | Technology |
|---|---|
| **AI Engine** | Google Gemma 4 E4B via Ollama (local, offline) |
| **Backend** | FastAPI (Python), SQLite |
| **Frontend** | React, Vite, TailwindCSS |
| **Hardware** | ESP32-WROOM-32, ESP-NOW, C++ |
| **CI/CD** | GitHub Actions |

---

## 🚀 Quick Start (Demo Mode)

### 1. Prerequisites
- Python 3.10+ & Node.js 18+
- [Ollama](https://ollama.com/) with Gemma 4 E4B: `ollama pull gemma4:e4b`

### 2. Run Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### 3. Run Frontend
```bash
cd frontend
npm install
npm run dev
```
Navigate to `http://localhost:5173`. 

> **Pro Tip:** Don't have hardware? Go to the **Info** tab and double-click **"Sahayak v1.0.0"** to trigger the **Software Simulation Mode**.

---

## 📡 Hardware Setup
Flash the physical ESP32 nodes using **Arduino IDE** (recommended) or **PlatformIO**:

### Option A: Arduino IDE (Recommended)
1. Open the Arduino IDE.
2. Install the **ESP32** board package (`esp32` by Espressif) via the Boards Manager.
3. Install required libraries via Library Manager: **ArduinoJson**, **U8g2**, and **Keypad**.
4. Open the firmware sketch files:
   - **Base Station**: `hardware/base_station/base_station.ino`
   - **Field Node**: `hardware/field_node.ino`
5. Select **ESP32 Dev Module** as the board and the correct COM port.
6. Click **Upload** to compile and flash.

### Option B: PlatformIO CLI
1.  **Base Station**: `pio run -e base_station -t upload`
2.  **Field Node**: `pio run -e field_node -t upload`

Refer to [Demo Setup Guide](docs/DEMO_SETUP.md) for full wiring diagrams.

---

## 🌍 Social Impact
- **Cost Effective**: 15x cheaper than traditional emergency broadcast systems.
- **Localized**: Respects regional governance (NDMA protocols) and languages.
- **Resilient**: Works in total isolation from the global web.

*Built with ❤️ for the Kaggle x Google DeepMind Gemma 4 Good Hackathon (2026).*
