import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert "status" in response.json()
    assert response.json()["status"] == "ok"

def test_get_alerts():
    response = client.get("/alerts")
    assert response.status_code == 200
    assert "alerts" in response.json()

def test_manual_alert():
    payload = {
        "hazard": "flood",
        "severity": "high",
        "location": "Test Area"
    }
    response = client.post("/manual-alert", json=payload)
    assert response.status_code == 200
    assert response.json()["hazard"] == "flood"
    assert "alert_id" in response.json()

def test_ask_endpoint():
    payload = {
        "message": "What to do in a flood?",
        "context": "General"
    }
    # This might fail if Ollama isn't running, so we check for either success or the handled exception message
    response = client.post("/ask", json=payload)
    assert response.status_code == 200
    assert "response" in response.json()
