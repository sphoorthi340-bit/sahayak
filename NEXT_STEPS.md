# Sahayak — Final Sprint & Demo Prep
> Status: Build complete. Tonight: flash hardware + test. Tomorrow: record demo video + submit.

---

## ✅ What Was Built Tonight

### Backend (main.py v2)
- 9 alert types: medical, missing, flood, fire, food_water, trapped, safe, evac, sos
- `/situation` — Gemma reads all mesh alerts → village situational awareness
- `/nodes/status` + `/nodes/heartbeat` — active/lost node health tracking
- `/ask` — role-aware AI chat (citizen / panchayat / responder + language)
- Confidence scoring on every alert (RSSI + repeat count → high/medium/low)
- CORS from `CORS_ORIGINS` env var; `OLLAMA_MODEL` env var (default: `gemma4:4b`)
- Thread-safe SSE client set (bug fix from audit)

### Frontend (App.jsx v2)
- 9 alert type icons + gradients
- `SituationPanel` — AI village voice in Panchayat view
- `NodeHealthBar` — active/lost node counts with battery + RSSI
- Chat (Ask Gemma) in ALL 3 views — citizen, panchayat, responder
- Confidence badge (🟢/🟡/🔴) on every alert card
- Dev proxy fixed — `npm run dev` now correctly proxies to `:8000`
- `API_BASE` uses `VITE_API_URL` env var

### Hardware Firmware v2
- **One-Press UX** — keys 1-9 → OLED preview → Hold A to confirm → send
- **LED state machine** — slow blink (preview) / fast blink (sending) / 3 blinks (success) / 5 blinks (fail)
- **Heartbeat** — every 30s sends alive ping with battery + RSSI
- **Calibrated battery ADC** — maps 6V–9V range correctly
- Base station: SPIFFS queue drains when laptop reconnects
- Base station: `ArduinoOTA.begin()` added (was missing)

### Project Files
- CI fixed — test failures now actually fail the build
- LICENSE (MIT) created
- vite.config.js — dev proxy + proper PWA manifest
- .env.example updated with all new env vars

---

## 🔧 Hardware Steps Tonight

### Flash Field Node
```bash
cd hardware
pio run -e field_node -t upload
```
**Verify OLED shows:**
```
SAHAYAK NODE
PRESS KEY FOR ALERT:
1:MED 2:MISS 3:FLOOD
4:FIRE 5:FOOD 6:TRAP
7:SAFE 8:EVAC 9:SOS
```

### Flash Base Station
```bash
pio run -e base_station -t upload
```

### Test One-Press Flow
1. Press `6` → OLED: `TRAPPED` / `HOLD [A] TO SEND` → LED slow-blinks
2. Hold `A` → fast LED blink → `SENT OK` / `MESH FOUND ✓`
3. App shows alert card in <2s via SSE

---

## 💻 Software Steps Tonight

### 1. Update `.env`
```
SERIAL_PORT=COM6
OLLAMA_MODEL=gemma4:4b
CORS_ORIGINS=http://localhost:5173,http://192.168.137.1:5173
```

### 2. Pull Gemma model (if needed)
```bash
ollama pull gemma4:4b
```

### 3. Start backend
```bash
cd backend && .venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Build frontend (production, served by FastAPI)
```bash
cd frontend && npm run build
```
Then just open `http://localhost:8000` — FastAPI serves everything.

### 5. Verify `/situation` works
```bash
curl -X POST http://localhost:8000/demo   # fire demo alerts
curl http://localhost:8000/situation       # check AI analysis
```

---

## 🎬 Demo Video Script (5 min)

| Time | Scene |
|------|-------|
| 0:00 | Wayanad 2024 — 100% tower failure, zero warnings |
| 0:30 | Show app going offline → offline fallback protocols work |
| 1:00 | Press 6 (TRAPPED) → OLED preview → Hold A → SENT ✓ → alert in app |
| 2:00 | Panchayat tab → SituationPanel shows Gemma analysis → type chat question |
| 3:00 | NodeHealthBar — "1 node active, 87% battery, RSSI -62" |
| 3:30 | Citizen tab → Hindi instructions → WhatsApp share |
| 4:00 | Architecture diagram (tap nodes for tooltips) |
| 4:30 | "₹600/node. Zero internet. Three languages. One button." |

---

## 📦 Submission Checklist

- [ ] Flash both ESP32 boards and test full flow
- [ ] Run backend + build frontend + verify app
- [ ] Record demo video
- [ ] Start ngrok: `ngrok http 8000`
- [ ] Update ngrok URL in `SUBMISSION_WRITEUP.md`
- [ ] `git add -A && git commit -m "v2: 9-type UX + AI village voice + node heartbeat" && git push`
- [ ] Submit on Kaggle with GitHub + demo links
