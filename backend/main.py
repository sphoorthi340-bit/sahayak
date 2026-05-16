# Sahayak — FastAPI Backend v2
# Start: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

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
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ─── CONFIG ──────────────────────────────────────────────────────────────────

OLLAMA_BASE_URL = "http://127.0.0.1:11434"
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL", "gemma4:4b")
SERIAL_PORT     = os.getenv("SERIAL_PORT", "COM6")
SERIAL_BAUD     = 115200
DB_PATH         = "sahayak.db"

_cors_env = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://192.168.137.1:5173,http://192.168.1.5:5173,http://localhost:5174"
)
CORS_ORIGINS = [o.strip() for o in _cors_env.split(",") if o.strip()]

print(f"Ollama: {OLLAMA_BASE_URL}  Model: {OLLAMA_MODEL}")
print(f"Serial: {SERIAL_PORT}")

# ─── ALERT TYPE REGISTRY ─────────────────────────────────────────────────────

ALERT_TYPES = {
    # New 9-key types
    "medical":    {"label": "Medical Emergency",  "severity": "high",     "icon": "🚑"},
    "missing":    {"label": "Missing Person",      "severity": "high",     "icon": "🔍"},
    "flood":      {"label": "Flash Flood",         "severity": "high",     "icon": "🌊"},
    "fire":       {"label": "Fire",                "severity": "critical", "icon": "🔥"},
    "food_water": {"label": "Food/Water Needed",   "severity": "medium",   "icon": "🥤"},
    "trapped":    {"label": "Person Trapped",      "severity": "critical", "icon": "🆘"},
    "safe":       {"label": "Safe Here",           "severity": "low",      "icon": "✅"},
    "evac":       {"label": "Need Evacuation",     "severity": "high",     "icon": "🚶"},
    "sos":        {"label": "SOS — All Help",      "severity": "critical", "icon": "🔴"},
    # Legacy hazard types
    "cyclone":    {"label": "Cyclone",             "severity": "high",     "icon": "🌀"},
    "landslide":  {"label": "Landslide",           "severity": "high",     "icon": "⛰️"},
    "heatwave":   {"label": "Heatwave",            "severity": "medium",   "icon": "🌡️"},
}

HAZARD_CONTEXT = {
    "flood":      "A flash flood warning has been issued. Water levels are rising rapidly.",
    "cyclone":    "A severe cyclone warning has been issued. High winds and heavy rain expected.",
    "landslide":  "A landslide warning has been issued. Unstable hillside soil detected.",
    "heatwave":   "An extreme heatwave warning. Temperatures dangerously high.",
    "medical":    "A medical emergency has been reported from the field.",
    "missing":    "A missing person report has been filed from the field.",
    "fire":       "A fire has been reported. Rapid spread risk is high.",
    "food_water": "Critical food and water shortage reported in this area.",
    "trapped":    "A person is reported trapped and requires immediate rescue.",
    "safe":       "This node reports that the local population is safe.",
    "evac":       "Evacuation assistance is urgently needed at this location.",
    "sos":        "An SOS distress signal has been received. All responders should mobilize.",
}

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
            battery_pct INTEGER DEFAULT 100,
            confidence  TEXT DEFAULT 'medium'
        )
    """)
    for col, default in [("battery_pct", "100"), ("confidence", "'medium'")]:
        try:
            c.execute(f"ALTER TABLE alerts ADD COLUMN {col} TEXT DEFAULT {default}")
        except sqlite3.OperationalError:
            pass

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
    c.execute("""
        CREATE TABLE IF NOT EXISTS nodes (
            node_id     TEXT PRIMARY KEY,
            last_seen   TEXT,
            battery_pct INTEGER DEFAULT 100,
            rssi        INTEGER DEFAULT 0,
            alert_count INTEGER DEFAULT 0,
            status      TEXT DEFAULT 'active'
        )
    """)
    conn.commit()
    conn.close()

def compute_confidence(rssi: int, node_id: str, hazard: str) -> str:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    cutoff = int(time.time()) - 300  # last 5 minutes
    c.execute(
        "SELECT COUNT(*) FROM alerts WHERE node_id=? AND hazard=? AND timestamp>?",
        (node_id, hazard, cutoff)
    )
    count = c.fetchone()[0]
    conn.close()
    if rssi > -60 and count >= 2:
        return "high"
    if rssi > -80 or count >= 1:
        return "medium"
    return "low"

def save_alert(node_id, hazard, severity, location, timestamp, rssi, source="esp32", battery_pct=100) -> int:
    confidence = compute_confidence(rssi, node_id, hazard)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO alerts (node_id, hazard, severity, location, timestamp, rssi, received_at, source, battery_pct, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (node_id, hazard, severity, location, timestamp, rssi,
          datetime.utcnow().isoformat(), source, battery_pct, confidence))
    alert_id = c.lastrowid
    # Update node tracking
    c.execute("""
        INSERT INTO nodes (node_id, last_seen, battery_pct, rssi, alert_count, status)
        VALUES (?, ?, ?, ?, 1, 'active')
        ON CONFLICT(node_id) DO UPDATE SET
            last_seen=excluded.last_seen,
            battery_pct=excluded.battery_pct,
            rssi=excluded.rssi,
            alert_count=alert_count+1,
            status='active'
    """, (node_id, datetime.utcnow().isoformat(), battery_pct, rssi))
    conn.commit()
    conn.close()
    return alert_id

def update_node_heartbeat(node_id, battery_pct, rssi):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO nodes (node_id, last_seen, battery_pct, rssi, alert_count, status)
        VALUES (?, ?, ?, ?, 0, 'active')
        ON CONFLICT(node_id) DO UPDATE SET
            last_seen=excluded.last_seen,
            battery_pct=excluded.battery_pct,
            rssi=excluded.rssi,
            status='active'
    """, (node_id, datetime.utcnow().isoformat(), battery_pct, rssi))
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

def get_node_statuses():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    cutoff = datetime.utcnow().replace(microsecond=0).isoformat()
    c.execute("SELECT * FROM nodes ORDER BY last_seen DESC")
    nodes = [dict(r) for r in c.fetchall()]
    conn.close()
    # Mark lost nodes (no heartbeat for >5 min)
    now = time.time()
    for n in nodes:
        try:
            last = datetime.fromisoformat(n["last_seen"]).timestamp()
            n["status"] = "active" if (now - last) < 300 else "lost"
        except Exception:
            n["status"] = "unknown"
    return nodes

# ─── PROMPTS ──────────────────────────────────────────────────────────────────

def build_prompt(hazard: str, user_type: str, language: str, severity: str, region: str = "India") -> dict:
    context = HAZARD_CONTEXT.get(hazard, f"A {hazard} emergency has been reported.")
    lang_instruction = {
        "hi": "Respond ONLY in Hindi (Devanagari script).",
        "te": "Respond ONLY in Telugu script.",
        "en": "Respond in clear simple English.",
    }.get(language, "Respond in clear simple English.")
    ndma = f"Following NDMA India official guidelines for region: {region}."

    if user_type == "citizen":
        system = f"""You are an emergency assistant for ordinary village citizens during a disaster.
{ndma} {lang_instruction}
Keep instructions extremely simple. Use numbered steps. Maximum 6 steps. No jargon."""
        user_msg = f"{context} Severity: {severity}. Give 5 simple survival steps RIGHT NOW."
    elif user_type == "panchayat":
        system = f"""You are an emergency coordinator for a Panchayat leader.
{ndma} {lang_instruction}
Give a structured action checklist. Be direct and authoritative. Focus on community coordination."""
        user_msg = f"{context} Severity: {severity}. Give a 7-point coordination checklist RIGHT NOW."
    elif user_type == "responder":
        system = f"""You are a disaster response assistant for a trained NDRF first responder.
{ndma} {lang_instruction}
Use triage terminology. Be precise. Prioritize life safety. Include resources needed."""
        user_msg = f"{context} Severity: {severity}. Give triage protocol with priority actions and danger zones."
    else:
        system = f"You are an emergency assistant. {ndma} {lang_instruction}"
        user_msg = f"{context} Give immediate safety instructions."

    return {"system": system, "user": user_msg}

# ─── OLLAMA CLIENT ────────────────────────────────────────────────────────────

async def call_ollama(hazard: str, user_type: str, language: str, severity: str, region: str = "India"):
    prompt_dict = build_prompt(hazard, user_type, language, severity, region)
    combined = f"{prompt_dict['system']}\n\n{prompt_dict['user']}"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": combined,
        "stream": False,
        "options": {"num_predict": 150, "temperature": 0.1, "num_thread": 4}
    }
    try:
        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(f"{OLLAMA_BASE_URL}/api/generate", json=payload)
            ms = (time.perf_counter() - start) * 1000
            if resp.status_code != 200:
                return f"[Error] Ollama returned {resp.status_code}", 0.0
            return resp.json().get("response", "").strip(), ms
    except httpx.ConnectError:
        fallback = HAZARD_CONTEXT.get(hazard, "Emergency alert.")
        return f"[Offline] {fallback} Stay safe. Follow local authority instructions.", 0.0
    except Exception as e:
        return f"[Error] {str(e)}", 0.0

# ─── SSE CLIENTS (thread-safe) ────────────────────────────────────────────────

sse_clients: set = set()
sse_lock = threading.Lock()

def notify_sse(alert_id):
    alerts = get_recent_alerts(1)
    if not alerts:
        return
    data = alerts[0]
    with sse_lock:
        clients = list(sse_clients)
    for q in clients:
        try:
            q.put_nowait(data)
        except Exception:
            pass

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
                        pkt_type = data.get("type", "")
                        if pkt_type == "heartbeat":
                            update_node_heartbeat(
                                data.get("node_id", "unknown"),
                                data.get("battery_pct", 100),
                                data.get("rssi", 0)
                            )
                            continue
                        if "hazard" not in data and "alert_type" not in data:
                            continue
                        hazard = data.get("hazard") or data.get("alert_type", "medical")
                        node_id  = data.get("node_id", "unknown")
                        severity = data.get("severity") or ALERT_TYPES.get(hazard, {}).get("severity", "high")
                        location = data.get("location", "unknown")
                        timestamp = data.get("timestamp", int(time.time()))
                        rssi     = data.get("rssi", 0)
                        battery  = data.get("battery_pct", 100)
                        print(f"Alert: {hazard} from {node_id} sev={severity}")
                        alert_id = save_alert(node_id, hazard, severity, location,
                                              timestamp, rssi, "esp32", battery)
                        loop.call_soon_threadsafe(notify_sse, alert_id)
                    except json.JSONDecodeError:
                        pass
        except serial.SerialException as e:
            serial_connected = False
            last_serial_error = str(e)
            time.sleep(5)
        except Exception as e:
            serial_connected = False
            last_serial_error = str(e)
            print(f"Serial error: {e}")
            time.sleep(5)

# ─── MODELS ───────────────────────────────────────────────────────────────────

class ManualAlert(BaseModel):
    hazard: str
    severity: str
    location: Optional[str] = "manual"
    node_id: Optional[str] = "manual"
    battery_pct: int = 100

class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = "General"
    user_type: Optional[str] = "citizen"
    language: Optional[str] = "en"

class HeartbeatRequest(BaseModel):
    node_id: str
    battery_pct: int = 100
    rssi: int = 0

# ─── APP STARTUP ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    loop = asyncio.get_running_loop()
    t = threading.Thread(target=serial_reader, args=(loop,), daemon=True)
    t.start()
    print("Sahayak backend started")
    yield

app = FastAPI(title="Sahayak API", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
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

@app.get("/stream/alerts")
async def stream_alerts():
    async def event_generator():
        q = asyncio.Queue()
        with sse_lock:
            sse_clients.add(q)
        try:
            while True:
                data = await q.get()
                yield f"data: {json.dumps(data)}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            with sse_lock:
                sse_clients.discard(q)
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/instructions/{hazard}/{user_type}/{lang}")
async def get_instructions(hazard: str, user_type: str, lang: str,
                           severity: str = "high", region: str = "India"):
    valid_hazards    = list(ALERT_TYPES.keys())
    valid_user_types = ["citizen", "panchayat", "responder"]
    valid_langs      = ["en", "hi", "te"]
    if hazard not in valid_hazards:
        raise HTTPException(400, f"Invalid hazard. Choose from {valid_hazards}")
    if user_type not in valid_user_types:
        raise HTTPException(400, f"Invalid user_type.")
    if lang not in valid_langs:
        raise HTTPException(400, f"Invalid lang.")

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        SELECT response FROM instruction_cache
        WHERE hazard=? AND user_type=? AND language=? AND severity=? AND region=?
    """, (hazard, user_type, lang, severity, region))
    row = c.fetchone()
    if row:
        response, gen_ms = row[0], 0.0
    else:
        response, gen_ms = await call_ollama(hazard, user_type, lang, severity, region)
        if not response.startswith("[Error]") and not response.startswith("[Offline]"):
            c.execute("""
                INSERT INTO instruction_cache (hazard, user_type, language, severity, region, response, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (hazard, user_type, lang, severity, region, response, datetime.utcnow().isoformat()))
            conn.commit()
    conn.close()
    return {"hazard": hazard, "user_type": user_type, "language": lang,
            "severity": severity, "response": response, "generation_ms": gen_ms}

@app.post("/manual-alert")
async def manual_alert(alert: ManualAlert):
    hazard = alert.hazard
    severity = alert.severity or ALERT_TYPES.get(hazard, {}).get("severity", "high")
    alert_id = save_alert(alert.node_id, hazard, severity,
                          alert.location, int(time.time()), 0, "manual", alert.battery_pct)
    loop = asyncio.get_running_loop()
    loop.call_soon_threadsafe(notify_sse, alert_id)
    return {"alert_id": alert_id, "hazard": hazard, "message": "Alert processed"}

@app.post("/ask")
async def ask_gemma(request: ChatRequest):
    """Role-aware AI chat for citizen, panchayat, and responder views."""
    role_context = {
        "citizen": "You are Sahayak AI helping a village citizen stay safe during a disaster. Give simple, numbered survival steps. Maximum 5 steps. No jargon.",
        "panchayat": "You are Sahayak AI assisting a Panchayat leader coordinate disaster response. Give direct coordination instructions. Focus on community actions, resource mobilization, and headcounts.",
        "responder": "You are Sahayak AI assisting a trained NDRF first responder. Use triage terminology. Be precise and technical. Prioritize life safety.",
    }.get(request.user_type or "citizen", "You are Sahayak AI, a disaster response assistant.")

    lang_instruction = {
        "hi": "Respond ONLY in Hindi (Devanagari script).",
        "te": "Respond ONLY in Telugu script.",
        "en": "Respond in clear simple English.",
    }.get(request.language or "en", "Respond in clear simple English.")

    system = f"{role_context} {lang_instruction} Ground all advice in NDMA India protocols. If unrelated to disasters, politely refocus on safety."
    combined = f"{system}\n\nUser: {request.message}\nAssistant:"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": combined,
        "stream": False,
        "options": {"num_predict": 200, "temperature": 0.2}
    }
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(f"{OLLAMA_BASE_URL}/api/generate", json=payload)
            if resp.status_code == 200:
                return {"response": resp.json().get("response", "").strip()}
            return {"response": "I'm unable to process that right now. Follow local emergency broadcasts."}
    except Exception:
        return {"response": "Connection to AI engine failed. Stay safe and follow evacuation routes."}

@app.get("/situation")
async def get_situation(limit: int = 50):
    """Gemma analyses all recent alerts → village-wide situational awareness."""
    alerts = get_recent_alerts(limit)
    if not alerts:
        return {"analysis": "No alerts received yet. System monitoring active.", "alert_count": 0,
                "type_breakdown": {}, "active_nodes": [], "max_severity": "none"}

    type_counts: dict = {}
    node_activity: dict = {}
    sev_rank = {"critical": 3, "high": 2, "medium": 1, "low": 0}
    max_sev = "low"
    for a in alerts:
        h = a.get("hazard", "unknown")
        type_counts[h] = type_counts.get(h, 0) + 1
        nid = a.get("node_id", "unknown")
        node_activity[nid] = node_activity.get(nid, 0) + 1
        s = a.get("severity", "low")
        if sev_rank.get(s, 0) > sev_rank.get(max_sev, 0):
            max_sev = s

    lines = [f"MESH ALERT SUMMARY ({len(alerts)} events):"]
    for t, cnt in sorted(type_counts.items(), key=lambda x: -x[1]):
        meta = ALERT_TYPES.get(t, {})
        lines.append(f"- {meta.get('icon','?')} {t}: {cnt} report(s)")
    lines.append(f"ACTIVE NODES: {list(node_activity.keys())}")
    lines.append(f"HIGHEST SEVERITY: {max_sev.upper()}")
    if alerts:
        lines.append(f"MOST RECENT: {alerts[0].get('hazard','?')} from {alerts[0].get('node_id','?')}")

    system = """You are Sahayak AI, analyzing emergency alert data from an offline ESP32 mesh network in a disaster zone.
You have NO internet. You run on local hardware.
Provide:
1. Overall situation (2 sentences)
2. Most critical needs RIGHT NOW (bullet points)
3. Recommended responder actions
4. What will likely escalate in next 30 minutes
Be concise. Plain English. This is life-safety."""

    combined = f"{system}\n\nALERT DATA:\n{chr(10).join(lines)}\n\nSituational analysis:"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": combined,
        "stream": False,
        "options": {"num_predict": 250, "temperature": 0.15, "num_thread": 4}
    }
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(f"{OLLAMA_BASE_URL}/api/generate", json=payload)
            if resp.status_code == 200:
                analysis = resp.json().get("response", "").strip()
            else:
                analysis = f"[Model unavailable] {', '.join(f'{k}:{v}' for k,v in type_counts.items())}"
    except Exception:
        analysis = f"[Offline] Alerts: {', '.join(f'{k}:{v}' for k,v in type_counts.items())}. Max severity: {max_sev}."

    return {
        "analysis": analysis,
        "alert_count": len(alerts),
        "type_breakdown": type_counts,
        "active_nodes": list(node_activity.keys()),
        "max_severity": max_sev,
    }

@app.get("/nodes/status")
def nodes_status():
    return {"nodes": get_node_statuses()}

@app.post("/nodes/heartbeat")
def node_heartbeat(req: HeartbeatRequest):
    update_node_heartbeat(req.node_id, req.battery_pct, req.rssi)
    return {"status": "ok"}

_demo_task = None

async def run_demo_sequence():
    demos = [
        ("trapped",  "critical", "Mundakkai",   "node_01"),
        ("flood",    "high",     "Chooralmala", "node_02"),
        ("medical",  "high",     "Attamala",    "node_03"),
        ("sos",      "critical", "Noolpuzha",   "node_04"),
        ("safe",     "low",      "Mundakkai",   "node_01"),
    ]
    for hazard, severity, loc, nid in demos:
        alert_id = save_alert(nid, hazard, severity, loc, int(time.time()), -60, "demo", 85)
        loop = asyncio.get_running_loop()
        loop.call_soon_threadsafe(notify_sse, alert_id)
        await asyncio.sleep(6)

@app.post("/demo")
async def trigger_demo():
    global _demo_task
    if _demo_task and not _demo_task.done():
        return {"status": "already running"}
    _demo_task = asyncio.create_task(run_demo_sequence())
    return {"status": "started"}

@app.get("/serial/ports")
def list_ports():
    return {"ports": [{"port": p.device, "desc": p.description}
                      for p in serial.tools.list_ports.comports()]}

@app.get("/ollama/status")
async def ollama_status():
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            models = [m["name"] for m in r.json().get("models", [])]
            return {"connected": True, "models": models, "active_model": OLLAMA_MODEL}
    except Exception as e:
        return {"connected": False, "error": str(e), "active_model": OLLAMA_MODEL}

# MUST be last — serves built frontend
import os as _os
_dist = _os.path.join(_os.path.dirname(__file__), "..", "frontend", "dist")
if _os.path.isdir(_dist):
    app.mount("/", StaticFiles(directory=_dist, html=True), name="static")
