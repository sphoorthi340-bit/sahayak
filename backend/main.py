# Sahayak — FastAPI Backend
# Runs in WSL2 Ubuntu
# Reads ESP32 serial → calls Ollama → stores in SQLite → serves React frontend
#
# Start: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# Ollama runs on Windows host — accessed via WSL2 host IP

import asyncio
import json
import os
import sqlite3
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

import httpx
import serial
import serial.tools.list_ports
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ─── CONFIG ──────────────────────────────────────────────────────────────────

# WSL2: get Windows host IP from /etc/resolv.conf
def get_windows_host_ip() -> str:
    try:
        with open("/etc/resolv.conf") as f:
            for line in f:
                if line.startswith("nameserver"):
                    return line.split()[1].strip()
    except Exception:
        pass
    return "127.0.0.1"

WINDOWS_HOST_IP = get_windows_host_ip()
OLLAMA_BASE_URL  = "http://127.0.0.1:11434"
OLLAMA_MODEL     = "gemma3:4b"
SERIAL_PORT      = os.getenv("SERIAL_PORT", "COM6")
SERIAL_BAUD      = 115200
DB_PATH          = "sahayak.db"

print(f"Ollama URL: {OLLAMA_BASE_URL}")
print(f"Serial port: {SERIAL_PORT}")

# ─── DATABASE ─────────────────────────────────────────────────────────────────

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            node_id     TEXT,
            hazard      TEXT,
            severity    TEXT,
            location    TEXT,
            timestamp   INTEGER,
            rssi        INTEGER,
            received_at TEXT,
            source      TEXT DEFAULT 'esp32',
            battery_pct INTEGER DEFAULT 100
        )
    """)
    # Add column if it doesn't exist (dirty but works for sqlite)
    try:
        c.execute("ALTER TABLE alerts ADD COLUMN battery_pct INTEGER DEFAULT 100")
    except sqlite3.OperationalError:
        pass
    # Ensure instruction_cache exists with region
    c.execute("""
        CREATE TABLE IF NOT EXISTS instruction_cache (
            hazard      TEXT,
            user_type   TEXT,
            language    TEXT,
            severity    TEXT,
            region      TEXT,
            response    TEXT,
            created_at  TEXT,
            PRIMARY KEY (hazard, user_type, language, severity, region)
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS responses (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            alert_id    INTEGER,
            user_type   TEXT,
            language    TEXT,
            response    TEXT,
            created_at  TEXT,
            FOREIGN KEY (alert_id) REFERENCES alerts(id)
        )
    """)
    conn.commit()
    conn.close()

def save_alert(node_id, hazard, severity, location, timestamp, rssi, source="esp32", battery_pct=100) -> int:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO alerts (node_id, hazard, severity, location, timestamp, rssi, received_at, source, battery_pct)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (node_id, hazard, severity, location, timestamp, rssi,
          datetime.utcnow().isoformat(), source, battery_pct))
    alert_id = c.lastrowid
    conn.commit()
    conn.close()
    return alert_id

def save_response(alert_id, user_type, language, response):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO responses (alert_id, user_type, language, response, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (alert_id, user_type, language, response, datetime.utcnow().isoformat()))
    conn.commit()
    conn.close()

def get_recent_alerts(limit=20):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT a.*, r.response, r.user_type, r.language
        FROM alerts a
        LEFT JOIN responses r ON r.alert_id = a.id AND r.user_type = 'citizen' AND r.language = 'en'
        ORDER BY a.id DESC LIMIT ?
    """, (limit,))
    rows = [dict(row) for row in c.fetchall()]
    conn.close()
    return rows

# ─── PROMPTS ──────────────────────────────────────────────────────────────────

HAZARD_CONTEXT = {
    "flood":     "A flash flood warning has been issued. Water levels are rising rapidly.",
    "cyclone":   "A severe cyclone warning has been issued. High winds and heavy rain expected.",
    "landslide": "A landslide warning has been issued. Unstable hillside soil detected.",
    "heatwave":  "An extreme heatwave warning. Temperatures dangerously high.",
}

def build_prompt(hazard: str, user_type: str, language: str, severity: str, region: str = "India") -> dict:
    context = HAZARD_CONTEXT.get(hazard, f"A {hazard} disaster warning has been issued.")
    lang_instruction = {
        "hi": "Respond ONLY in Hindi (Devanagari script).",
        "te": "Respond ONLY in Telugu script.",
        "en": "Respond in clear simple English.",
    }.get(language, "Respond in clear simple English.")

    ndma_guideline = f"Following NDMA (National Disaster Management Authority) India official guidelines and NDRF protocols for region: {region}."

    if user_type == "citizen":
        system = f"""You are an emergency assistant helping ordinary village citizens during a disaster.
{ndma_guideline}
{lang_instruction}
Keep instructions extremely simple. Use numbered steps. Maximum 6 steps.
No technical jargon. Assume the person has no training. Focus on immediate survival actions."""
        user_msg = f"{context} Severity: {severity}. Give 5 simple survival steps a village citizen must do RIGHT NOW."

    elif user_type == "panchayat":
        system = f"""You are an emergency coordinator assistant for a Panchayat leader (local government official).
{ndma_guideline}
{lang_instruction}
Give a structured action checklist. Use numbered items. Be direct and authoritative.
Focus on coordinating community response, not personal survival."""
        user_msg = f"{context} Severity: {severity}. Give a 7-point coordination checklist for the Panchayat leader to manage community response RIGHT NOW."

    elif user_type == "responder":
        system = f"""You are a disaster response assistant for a trained first responder or NDRF volunteer.
{ndma_guideline}
{lang_instruction}
Use triage terminology. Be precise and technical. Prioritize life safety.
Include resource requirements and priority order."""
        user_msg = f"{context} Severity: {severity}. Give a triage protocol with priority actions, required resources, and danger zones to avoid."

    else:
        system = f"You are an emergency assistant. {ndma_guideline} {lang_instruction}"
        user_msg = f"{context} Give immediate safety instructions."

    return {"system": system, "user": user_msg}

# ─── OLLAMA CLIENT ────────────────────────────────────────────────────────────

async def call_ollama(hazard: str, user_type: str, language: str, severity: str, region: str = "India"):
    prompt_dict = build_prompt(hazard, user_type, language, severity, region)
    # Combine system and user prompts into a single string for /api/generate
    combined_prompt = f"{prompt_dict['system']}\n\n{prompt_dict['user']}"
    
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": combined_prompt,
        "stream": False,
        "options": {
            "num_predict": 100,
            "temperature": 0.1,
            "num_thread": 4
        }
    }
    
    try:
        start_time = time.perf_counter()
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(f"{OLLAMA_BASE_URL}/api/generate", json=payload)
            duration_ms = (time.perf_counter() - start_time) * 1000
            
            if resp.status_code != 200:
                print(f"Ollama Error [{resp.status_code}]: {resp.text}")
                return f"[Error] Ollama returned {resp.status_code}", 0.0
                
            data = resp.json()
            return data.get("response", "").strip(), duration_ms
    except httpx.ConnectError:
        return f"[Offline] {HAZARD_CONTEXT.get(hazard, 'Emergency alert.')} Stay safe. Follow local authority instructions.", 0.0
    except Exception as e:
        return f"[Error] Could not generate instructions: {str(e)}", 0.0

# ─── SERIAL READER THREAD ─────────────────────────────────────────────────────

serial_connected = False
last_serial_error = ""

def serial_reader(loop):
    global serial_connected, last_serial_error
    while True:
        try:
            with serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=2) as ser:
                serial_connected = True
                last_serial_error = ""
                print(f"Serial connected on {SERIAL_PORT}")
                last_ping = 0
                while True:
                    now = time.time()
                    if now - last_ping > 2.0:
                        ser.write(b'{"type":"ping"}\n')
                        last_ping = now
                        
                    line = ser.readline().decode("utf-8", errors="ignore").strip()
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        # Must have hazard field to be a valid alert
                        if "hazard" not in data:
                            continue
                        print(f"ESP32 alert received: {data}")
                        node_id  = data.get("node_id", "unknown")
                        hazard   = data.get("hazard", "flood")
                        severity = data.get("severity", "high")
                        location = data.get("location", "unknown")
                        timestamp = data.get("timestamp", 0)
                        rssi     = data.get("rssi", 0)
                        battery  = data.get("battery_pct", 100)
                        alert_id = save_alert(node_id, hazard, severity, location,
                                              timestamp, rssi, "esp32", battery)
                        
                        # Notify SSE clients
                        loop.call_soon_threadsafe(notify_sse, alert_id)
                    except json.JSONDecodeError:
                        pass  # Non-JSON serial output (debug prints etc)
        except serial.SerialException as e:
            serial_connected = False
            last_serial_error = str(e)
            time.sleep(5)  # Retry after 5s
        except Exception as e:
            serial_connected = False
            last_serial_error = str(e)
            time.sleep(5)



class ManualAlert(BaseModel):
    hazard: str     # flood | cyclone | landslide | heatwave
    severity: str   # low | medium | high | critical
    location: Optional[str] = "manual"
    node_id: Optional[str] = "manual"
    battery_pct: int = 100

class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = "General"

# ─── APP STARTUP ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # Start serial reader in background thread
    loop = asyncio.get_running_loop()
    t = threading.Thread(target=serial_reader, args=(loop,), daemon=True)
    t.start()
    print("Sahayak backend started")
    yield

app = FastAPI(title="Sahayak API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://192.168.137.1:5173",
        "http://192.168.1.5:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://192.168.137.1:5174"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── ROUTES ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "serial_connected": serial_connected,
        "serial_port": SERIAL_PORT,
        "serial_error": last_serial_error,
        "ollama_url": OLLAMA_BASE_URL,
        "model": OLLAMA_MODEL,
    }

@app.get("/alerts")
def get_alerts(limit: int = 20):
    return {"alerts": get_recent_alerts(limit)}

sse_clients = set()

def notify_sse(alert_id):
    alerts = get_recent_alerts(1)
    if alerts:
        data = alerts[0]
        for q in sse_clients:
            q.put_nowait(data)

@app.get("/stream/alerts")
async def stream_alerts():
    async def event_generator():
        q = asyncio.Queue()
        sse_clients.add(q)
        try:
            while True:
                data = await q.get()
                yield f"data: {json.dumps(data)}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            sse_clients.remove(q)
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/instructions/{hazard}/{user_type}/{lang}")
async def get_instructions(hazard: str, user_type: str, lang: str, severity: str = "high", region: str = "India"):
    valid_hazards    = ["flood", "cyclone", "landslide", "heatwave"]
    valid_user_types = ["citizen", "panchayat", "responder"]
    valid_langs      = ["en", "hi", "te"]

    if hazard not in valid_hazards:
        raise HTTPException(400, f"Invalid hazard. Choose from {valid_hazards}")
    if user_type not in valid_user_types:
        raise HTTPException(400, f"Invalid user_type. Choose from {valid_user_types}")
    if lang not in valid_langs:
        raise HTTPException(400, f"Invalid lang. Choose from {valid_langs}")

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        SELECT response FROM instruction_cache 
        WHERE hazard=? AND user_type=? AND language=? AND severity=? AND region=?
    """, (hazard, user_type, lang, severity, region))
    row = c.fetchone()
    
    if row:
        response = row[0]
        gen_ms = 0.0
    else:
        response, gen_ms = await call_ollama(hazard, user_type, lang, severity, region)
        if not response.startswith("[Error]") and not response.startswith("[Offline]"):
            c.execute("""
                INSERT INTO instruction_cache (hazard, user_type, language, severity, region, response, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (hazard, user_type, lang, severity, region, response, datetime.utcnow().isoformat()))
            conn.commit()
    conn.close()

    return {
        "hazard":    hazard,
        "user_type": user_type,
        "language":  lang,
        "severity":  severity,
        "response":  response,
        "generation_ms": gen_ms,
    }

@app.post("/manual-alert")
async def manual_alert(alert: ManualAlert):
    """Test endpoint — simulate ESP32 alert without hardware"""
    alert_id = save_alert(
        alert.node_id, alert.hazard, alert.severity,
        alert.location, int(time.time()), 0, "manual", alert.battery_pct
    )
    
    # Notify SSE clients about the new manual alert
    loop = asyncio.get_running_loop()
    loop.call_soon_threadsafe(notify_sse, alert_id)
    
    return {
        "alert_id": alert_id,
        "hazard":   alert.hazard,
        "message":  "Alert processed successfully",
    }

@app.post("/ask")
async def ask_gemma(request: ChatRequest):
    """Direct chat/search endpoint for user queries"""
    system = "You are Sahayak AI, a disaster response assistant. Provide concise, lifesaving advice based on NDMA India protocols. If the query is unrelated to disasters, politely refocus on safety."
    combined_prompt = f"{system}\n\nUser: {request.message}"
    
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": combined_prompt,
        "stream": False,
        "options": {
            "num_predict": 150,
            "temperature": 0.2,
        }
    }
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(f"{OLLAMA_BASE_URL}/api/generate", json=payload)
            if resp.status_code != 200:
                return {"response": "I'm sorry, I'm currently unable to process that. Please follow local emergency broadcasts."}
            data = resp.json()
            return {"response": data.get("response", "").strip()}
    except Exception:
        return {"response": "Connection to AI engine failed. Please stay safe and follow evacuation routes if visible."}

_demo_task = None

async def run_demo_sequence():
    hazards = ["flood", "cyclone", "landslide", "heatwave"]
    locations = ["Mundakkai", "Chooralmala", "Attamala", "Noolpuzha"]
    for index, hazard in enumerate(hazards):
        # Pick corresponding location or fallback
        loc = locations[index % len(locations)]
        alert_id = save_alert(f"node_{index+1}", hazard, "high", loc, int(time.time()), -60, "demo", 95)
        loop = asyncio.get_running_loop()
        loop.call_soon_threadsafe(notify_sse, alert_id)
        if index < len(hazards) - 1:
            await asyncio.sleep(8)

@app.post("/demo")
async def trigger_demo():
    global _demo_task
    if _demo_task and not _demo_task.done():
        return {"status": "already running"}
    _demo_task = asyncio.create_task(run_demo_sequence())
    return {"status": "started"}

@app.get("/serial/ports")
def list_ports():
    """Helper to find correct serial port"""
    ports = [{"port": p.device, "desc": p.description}
             for p in serial.tools.list_ports.comports()]
    return {"ports": ports}

@app.get("/ollama/status")
async def ollama_status():
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            models = [m["name"] for m in r.json().get("models", [])]
            return {"connected": True, "models": models}
    except Exception as e:
        return {"connected": False, "error": str(e)}
from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory="../frontend/dist", html=True), name="static")
