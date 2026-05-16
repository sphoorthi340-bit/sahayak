# Sahayak: Resilience in Silence

## Elevator Pitch
When disaster strikes, the first casualty is often communication. **Sahayak** is an offline-first, AI-powered disaster response ecosystem that keeps communities connected when cellular towers go dark. By combining low-cost ESP32 mesh networking with the localized intelligence of the **Gemma 4 LLM**, Sahayak provides 640,000+ vulnerable Indian villages with a lifeline that is 15x cheaper than traditional emergency systems.

## Project Vision
To bridge the "digital dark" gap during natural disasters like landslides and cyclones. Sahayak ensures that emergency guidance, responder coordination, and citizen safety protocols remain accessible without a single byte of internet connectivity.

## Key Pillars
1.  **Resilient Mesh Network**: Distributed ESP32 nodes create a self-healing communication grid.
2.  **Edge Intelligence**: Gemma 4 quantized for local execution provides protocol-grounded advice in regional languages.
3.  **Universal Access**: A PWA for modern smartphones and a simplified OLED/Keypad interface for direct node interaction.
4.  **Social Impact**: Grounded in National Disaster Management Authority (NDMA) protocols for real-world compliance.

## Technical Architecture
-   **Hardware**: ESP32-WROOM-32 (Mesh), SSD1306 OLED, 4x4 Matrix Keypad.
-   **Backend**: FastAPI, SQLite, Ollama (Gemma 4 - 4bit).
-   **Frontend**: React PWA with offline-sync capabilities.
