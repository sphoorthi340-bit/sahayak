# Sahayak (सहायक) — Offline Disaster Resilience System

![Sahayak Logo/Banner](https://github.com/user-attachments/assets/sahayak-banner.png)

> **"When the towers fall, Sahayak keeps you connected."**

**Sahayak** is a completely offline, mesh-networked disaster response system built for the **Gemma 4 Good Hackathon**. It is designed specifically for complex topographies like Wayanad (India) where severe natural disasters instantly destroy centralized cellular infrastructure.

## 🏆 The Problem
During the **2024 Wayanad Landslides** and **2023 Cyclone Michaung**, cellular towers failed within minutes. Millions were plunged into an information blackout. Emergency responders could not broadcast evacuation routes, and citizens had no way of knowing what to do.

## 💡 Our Solution
Sahayak solves this by entirely removing the reliance on the internet or centralized cellular towers.
1. **ESP-NOW Mesh Network:** Cheap ($5) ESP32 microcontrollers form an ad-hoc, self-healing mesh network over Wi-Fi frequencies (no router needed).
2. **Local AI (Gemma 3):** A central command node runs Google's Gemma 3 (1B/4B) model completely locally.
3. **PWA Dashboard:** A Progressive Web App provides real-time telemetry, triage protocols, and NDMA-compliant safety instructions in English, Hindi, and Telugu.

---

## 🛠️ Tech Stack
- **AI Engine:** Google Gemma 3 4B/1B (via Ollama)
- **Backend:** FastAPI (Python), SQLite
- **Frontend:** React, Vite, TailwindCSS (PWA Ready)
- **Hardware:** ESP32 (C++) utilizing ESP-NOW Protocol

---

## 🚀 How to Run Locally

### 1. Prerequisites
- Python 3.10+
- Node.js 18+
- [Ollama](https://ollama.com/) installed with Gemma 3: `ollama pull gemma3:4b`

### 2. Start the Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Start the server (runs on port 8000)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Start the Frontend
```bash
cd frontend
npm install
npm run dev
```
Navigate to `http://localhost:5173`. 

### 4. Trigger the Demo Mode
Since you may not have the ESP32 hardware on hand, we built a software simulation!
1. Open the Sahayak web app.
2. Go to the **Info** tab.
3. Double-click the text **"Sahayak v1.0.0 (Phase 3)"** at the bottom of the screen.
4. Watch the simulated mesh network light up with incoming alerts!

---

## 📡 Hardware Deployment (For Real-World Use)
To flash the physical ESP32 nodes:
1. Install [PlatformIO](https://platformio.org/).
2. Open the `hardware/` directory.
3. Flash the base station: `pio run -e base_station -t upload`
4. Flash the field nodes: `pio run -e field_node -t upload`

---

## 🌟 Hackathon Highlights
- **Sub-5 Second Local Inference:** Highly optimized Ollama parameters (`num_predict: 100`, `temperature: 0.1`) ensure rapid emergency response on consumer hardware.
- **Graceful Degradation:** If the AI is busy or fully offline, the system falls back to cached, NDMA-verified instructions.
- **Multilingual Support:** First-class support for English, Hindi, and Telugu to serve rural Indian demographics.

*Built with ❤️ for the Kaggle x Google DeepMind Gemma 4 Good Hackathon (2026).*
