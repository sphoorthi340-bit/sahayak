import os
import pytest
from unittest.mock import patch, MagicMock

# Patch serial before importing app so the serial thread doesn't crash CI
os.environ.setdefault("SERIAL_PORT", "/dev/null")

import threading

# Mock pyserial so the background thread doesn't blow up in CI
with patch("serial.Serial", side_effect=Exception("CI: no serial port")):
    from fastapi.testclient import TestClient
    from main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "serial_port" in data
    assert "model" in data


def test_get_alerts():
    response = client.get("/alerts")
    assert response.status_code == 200
    assert "alerts" in response.json()


def test_get_alerts_limit():
    response = client.get("/alerts?limit=5")
    assert response.status_code == 200
    alerts = response.json()["alerts"]
    assert len(alerts) <= 5


def test_manual_alert_flood():
    payload = {"hazard": "flood", "severity": "high", "location": "Test Zone"}
    response = client.post("/manual-alert", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["hazard"] == "flood"
    assert "alert_id" in data


def test_manual_alert_trapped():
    payload = {"hazard": "trapped", "severity": "critical", "location": "Field 02", "node_id": "test_node"}
    response = client.post("/manual-alert", json=payload)
    assert response.status_code == 200
    assert "alert_id" in response.json()


def test_manual_alert_sos():
    payload = {"hazard": "sos", "severity": "critical"}
    response = client.post("/manual-alert", json=payload)
    assert response.status_code == 200


def test_nodes_status():
    response = client.get("/nodes/status")
    assert response.status_code == 200
    assert "nodes" in response.json()


def test_node_heartbeat():
    payload = {"node_id": "test_node_01", "battery_pct": 85, "rssi": -62}
    response = client.post("/nodes/heartbeat", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    # Verify node appears in status
    status = client.get("/nodes/status").json()
    node_ids = [n["node_id"] for n in status["nodes"]]
    assert "test_node_01" in node_ids


def test_situation_empty():
    # Should return gracefully even with no alerts
    response = client.get("/situation")
    assert response.status_code == 200
    data = response.json()
    assert "alert_count" in data
    assert "analysis" in data


def test_ask_citizen():
    payload = {"message": "What to do in a flood?", "user_type": "citizen", "language": "en"}
    response = client.post("/ask", json=payload)
    assert response.status_code == 200
    assert "response" in response.json()


def test_ask_panchayat():
    payload = {"message": "How to coordinate evacuation?", "user_type": "panchayat", "language": "en"}
    response = client.post("/ask", json=payload)
    assert response.status_code == 200
    assert "response" in response.json()


def test_ask_responder():
    payload = {"message": "Triage protocol for flood casualties", "user_type": "responder", "language": "en"}
    response = client.post("/ask", json=payload)
    assert response.status_code == 200
    assert "response" in response.json()


def test_serial_ports():
    response = client.get("/serial/ports")
    assert response.status_code == 200
    assert "ports" in response.json()


def test_ollama_status():
    # Should return connected or disconnected — never crash
    response = client.get("/ollama/status")
    assert response.status_code == 200
    data = response.json()
    assert "connected" in data
    assert "active_model" in data


def test_instructions_invalid_hazard():
    response = client.get("/instructions/invalid/citizen/en")
    assert response.status_code == 400


def test_instructions_invalid_lang():
    response = client.get("/instructions/flood/citizen/fr")
    assert response.status_code == 400


def test_demo_trigger():
    response = client.post("/demo")
    assert response.status_code == 200
    assert response.json()["status"] in ("started", "already running")
