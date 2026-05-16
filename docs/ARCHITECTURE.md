# Sahayak System Architecture

This document details the technical flow and structure of the Sahayak disaster response system.

## High-Level System Flow

The system operates in three main tiers: The Mesh Layer (Hardware), the Intelligence Layer (Backend), and the Presentation Layer (Frontend).

```mermaid
graph TD
    subgraph "Field Node (Multiple)"
        A[Sensor/Input] --> B[ESP32 Field Node]
        B --> C[OLED Display]
        B --> D[Matrix Keypad]
    end

    subgraph "Mesh Network"
        B <-->|ESP-NOW| E[ESP32 Base Station]
    end

    subgraph "Local Server"
        E <-->|Serial/USB| F[FastAPI Backend]
        F <-->|Local API| G[Ollama / Gemma 4]
        F <-->|SQLite| H[(Local DB)]
    end

    subgraph "User Interface"
        F <-->|WiFi/HTTP| I[React PWA Dashboard]
        I --> J[Citizen/Responder App]
    end
```

## Data Propagation Flow

When an alert is triggered from the field:

1.  **Trigger**: A user enters a code on the Matrix Keypad (e.g., `1` for Medical) or sends a message via the PWA connected to a node.
2.  **Mesh Routing**: The message hops across Field Nodes using the ESP-NOW protocol until it reaches the **Base Station**.
3.  **Local Processing**: The Base Station forwards the data via Serial to the **FastAPI Backend**.
4.  **AI Analysis**: The Backend queries the **Gemma 4 LLM** (running locally via Ollama) to generate a response based on NDMA protocols.
5.  **Feedback Loop**: The response is saved to the local SQLite DB and broadcast back through the mesh to the originating node's OLED and the PWA dashboard.

## Resilience Features

-   **Offline-First**: No internet required at any stage.
-   **Self-Healing**: Nodes automatically find the best path to the base station.
-   **PWA Persistence**: The frontend works as a standalone app on smartphones, caching data via service workers.
-   **Hardware Fallback**: If a smartphone is unavailable, the node's OLED and Keypad provide a direct interface for emergency alerts.

## Prompt Engineering & Grounding

To ensure safety and reliability, Sahayak uses a strict multi-layered prompting strategy to ground Gemma 4 in official disaster management frameworks.

### System Prompt Strategy
Every query sent to Gemma 4 includes a persona-specific system prompt. For example:

**Citizen Persona:**
> "You are an emergency assistant helping ordinary village citizens during a disaster. Follow NDMA (National Disaster Management Authority) India official guidelines. Respond in clear, simple language. Keep instructions extremely simple. Use numbered steps. Maximum 6 steps. Focus on immediate survival actions."

**Responder Persona:**
> "You are a disaster response assistant for a trained first responder or NDRF volunteer. Use triage terminology. Be precise and technical. Prioritize life safety. Include resource requirements and priority order."

### Technical Grounding
1.  **Deterministic Guidance**: We set `temperature: 0.1` to ensure instructions are consistent and not "hallucinated" differently in the same scenario.
2.  **Context Injection**: The backend injects the hazard type, severity, and region (e.g., Wayanad) into every prompt to make the AI aware of the local context.
3.  **Instruction Caching**: Validated responses are cached in SQLite. If the hardware reports a known hazard-severity pair, the system provides a pre-verified instruction set, ensuring zero-latency even if the AI engine is busy.

## Data Flow Lifecycle
The following sequence details the journey of an alert from the field to the user:

1.  **Origin**: **Keypad Press** on Field Node (e.g., `1` for Flood).
2.  **Transport**: Packet broadcast via **ESP-NOW Mesh**.
3.  **Bridge**: **Base Station** receives and relays via **USB Serial**.
4.  **Process**: **FastAPI Backend** parses the JSON and stores the alert.
5.  **Intelligence**: Backend invokes **Local Gemma 4** with persona prompts.
6.  **Delivery**: **React UI** displays the alert and instructions via **SSE/WebSocket**.
