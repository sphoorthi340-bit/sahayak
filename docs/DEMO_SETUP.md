# Sahayak Live Demo Setup Guide

This guide explains how to spin up the Sahayak system for a live demonstration, including setting up `ngrok` tunnels to allow judges to access your locally-hosted application over the internet.

## 1. Start the Gemma 4 E4B Model
Ensure Ollama is running and the Gemma 4 E4B model is available.
```powershell
ollama run gemma4:e4b
```
*(You can exit the prompt once it loads, Ollama runs as a background service).*

## 2. Start the FastAPI Backend
The backend serves the API, handles SQLite caching, and communicates with Ollama.
```powershell
cd backend
# Activate virtual environment if not already active
.venv\Scripts\activate
# Start the server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## 3. Tunnel the Backend with Ngrok
To allow the frontend (running on a different device or over the internet) to talk to your backend, tunnel port 8000. Open a new terminal:
```powershell
ngrok http 8000
```
**Important:** Copy the generated Forwarding URL (e.g., `https://1234-abcd.ngrok-free.app`).

## 4. Configure the Frontend
Before starting the frontend, update the API base URL to point to your ngrok tunnel so the PWA can fetch instructions.
1. Go to `frontend/App.jsx`.
2. Locate the `API_BASE` constant at the top of the file.
3. Change it to your new ngrok URL:
   ```javascript
   const API_BASE = "https://1234-abcd.ngrok-free.app";
   ```

## 5. Start the React Frontend
Open a new terminal:
```powershell
cd frontend
npm run dev
```

## 6. Tunnel the Frontend for Judges
If you need to share a live link with the judges or access the PWA on a mobile device (like the Samsung A26) over cellular networks:
```powershell
ngrok http 5173
```
Share **this** new ngrok URL with the judges or open it on your phone.

## 7. Trigger the Demo Sequence
If you do not have the physical ESP32 nodes connected via USB serial:
1. Open the Frontend URL in a browser.
2. Navigate to the **Info** tab.
3. Double-click the text **"Sahayak v1.0.0 (Phase 3)"** at the bottom.
4. The system will simulate incoming disaster alerts (Flood → Cyclone → Landslide → Heatwave) separated by 8 seconds. Watch the dashboard light up!
