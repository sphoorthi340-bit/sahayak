# backend/tests/test_main.py
# conftest.py handles: serial mock + init_db() before these tests run.

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "ok"
    assert "model" in d
    assert "serial_port" in d


def test_get_alerts():
    r = client.get("/alerts")
    assert r.status_code == 200
    assert "alerts" in r.json()


def test_get_alerts_limit():
    r = client.get("/alerts?limit=5")
    assert r.status_code == 200
    assert len(r.json()["alerts"]) <= 5


def test_manual_alert_flood():
    r = client.post("/manual-alert", json={"hazard": "flood", "severity": "high", "location": "Test Zone"})
    assert r.status_code == 200
    d = r.json()
    assert d["hazard"] == "flood"
    assert "alert_id" in d


def test_manual_alert_trapped():
    r = client.post("/manual-alert", json={"hazard": "trapped", "severity": "critical", "node_id": "ci_node"})
    assert r.status_code == 200
    assert "alert_id" in r.json()


def test_manual_alert_sos():
    r = client.post("/manual-alert", json={"hazard": "sos", "severity": "critical"})
    assert r.status_code == 200
    assert "alert_id" in r.json()


def test_nodes_status():
    r = client.get("/nodes/status")
    assert r.status_code == 200
    assert "nodes" in r.json()


def test_node_heartbeat():
    r = client.post("/nodes/heartbeat", json={"node_id": "ci_node_01", "battery_pct": 85, "rssi": -62})
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    # Verify node appears in status listing
    node_ids = [n["node_id"] for n in client.get("/nodes/status").json()["nodes"]]
    assert "ci_node_01" in node_ids


def test_situation_empty():
    r = client.get("/situation")
    assert r.status_code == 200
    d = r.json()
    assert "analysis" in d
    assert "alert_count" in d


def test_situation_with_alerts():
    # Seed some alerts first
    client.post("/manual-alert", json={"hazard": "medical", "severity": "high", "node_id": "ci_node_02"})
    client.post("/manual-alert", json={"hazard": "flood",   "severity": "high", "node_id": "ci_node_02"})
    r = client.get("/situation")
    assert r.status_code == 200
    d = r.json()
    assert d["alert_count"] >= 2
    assert isinstance(d["type_breakdown"], dict)


def test_ask_citizen():
    r = client.post("/ask", json={"message": "What to do in a flood?", "user_type": "citizen", "language": "en"})
    assert r.status_code == 200
    assert "response" in r.json()


def test_ask_panchayat():
    r = client.post("/ask", json={"message": "How to coordinate evacuation?", "user_type": "panchayat", "language": "en"})
    assert r.status_code == 200
    assert "response" in r.json()


def test_ask_responder():
    r = client.post("/ask", json={"message": "Triage for flood casualties", "user_type": "responder", "language": "en"})
    assert r.status_code == 200
    assert "response" in r.json()


def test_serial_ports():
    r = client.get("/serial/ports")
    assert r.status_code == 200
    assert "ports" in r.json()


def test_ollama_status():
    r = client.get("/ollama/status")
    assert r.status_code == 200
    d = r.json()
    assert "connected" in d
    assert "active_model" in d


def test_instructions_invalid_hazard():
    r = client.get("/instructions/invalid_hazard/citizen/en")
    assert r.status_code == 400


def test_instructions_invalid_lang():
    r = client.get("/instructions/flood/citizen/fr")
    assert r.status_code == 400


def test_demo_trigger():
    r = client.post("/demo")
    assert r.status_code == 200
    assert r.json()["status"] in ("started", "already running")
