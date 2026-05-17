# Sahayak (सहायक): When Towers Fall, Communities Must Not

**Track:** Climate & Global Resilience
**Team:** Shashank | ECE Student, Hyderabad, India

---

## The Problem: The Last Mile Goes Silent

On July 30, 2024, a catastrophic landslide buried Mundakkai and Chooralmala villages in Wayanad, Kerala. 420 lives were lost. What made this tragedy worse was not just the scale of destruction — it was the silence that preceded it. Communication towers failed at 100%. No digital warnings reached the villages. No coordinated evacuation was possible. Zero.

This is not an isolated failure. In December 2023, Cyclone Michaung rendered 12,800 towers non-operational across Tamil Nadu and Andhra Pradesh, leaving 4 million people without connectivity for up to 17 hours. The pattern is consistent and deadly: the communities most at risk of natural disasters are precisely the communities that lose communication infrastructure when a disaster strikes.

Existing solutions fail the last mile in three ways. Government alert systems depend on cellular networks that collapse under the same disasters they warn against. Cloud-based AI tools require internet connectivity that disappears first. Emergency apps designed for urban users assume literacy, smartphone capability, and English fluency that rural India cannot guarantee.

Sahayak addresses all three failures simultaneously.

---

## The Solution: Intelligence Without Internet

Sahayak is an offline-first disaster response system that delivers Gemma-powered multilingual emergency guidance to three distinct user types — general citizens, Panchayat leaders, and disaster responders — across four major hazard types (flash flood, cyclone, landslide, heatwave), with zero internet dependency at any point in the pipeline.

The core insight is architectural: separate the communication layer from the intelligence layer, and make both work offline.

**The communication layer** uses two ESP32-WROOM-32 microcontrollers communicating via ESP-NOW — a connectionless WiFi protocol that requires no router, no internet, and no infrastructure. A field node deployed in a village sends structured JSON alert packets (hazard type, severity, location, battery percentage) to a base station node up to 500 metres away. The base station forwards packets via USB serial to the laptop running the AI brain. In production deployment, this backbone upgrades to LoRa SX1278 modules for 10-15km range per node — a full district covered by 20-30 nodes at approximately ₹600 each.

**The intelligence layer** runs Gemma 4 E4B locally via Ollama. No API calls. No cloud dependency. The model generates contextually appropriate emergency instructions grounded in NDMA (National Disaster Management Authority) India official guidelines and NDRF protocols. Every prompt explicitly references the region and official framework, giving judges and users confidence that the output is not arbitrary AI generation but structured guidance aligned with government protocols.

---

## How Gemma 4 Powers Sahayak

Gemma is not a peripheral feature of Sahayak — it is the core intelligence that transforms a simple alert relay into a genuine decision-support system. Three design choices make this integration meaningful:

**1. User-Persona Prompting**
The same flood alert generates three entirely different responses depending on who is asking. A citizen gets five simple numbered survival steps in their local language, with no technical jargon and immediate action focus. A Panchayat leader gets a seven-point coordination checklist covering evacuation routes, resource mobilization, and community headcount. A first responder gets a triage protocol with priority classifications, required equipment, and danger zone identification. This persona-aware prompting means the same hardware deployment serves all three responder types with appropriate intelligence.

**2. Multilingual Generation**
India's disaster-affected communities speak Hindi, Telugu, Tamil, Kannada — not English. Sahayak uses Gemma's multilingual capability to generate responses in English, Hindi (Devanagari script), and Telugu natively. The language toggle in the citizen interface allows a first-generation smartphone user in Mundakkai to receive survival instructions in their mother tongue, without any translation layer or API dependency.

**3. NDMA-Grounded System Prompts**
Every Gemma call includes a system prompt that explicitly invokes NDMA guidelines and specifies the deployment region. This grounds the output in official Indian government disaster protocols rather than generic advice. When a judge or official asks "how is this advice validated?", the answer is traceable: Gemma generates responses within the framework of the same guidelines that govern India's official disaster management apparatus.

Response caching in SQLite ensures that once a hazard-language-region combination has been generated, subsequent identical requests are served instantly without re-invoking the model — critical for RAM-constrained hardware during high-frequency emergency scenarios.

---

## System Architecture

```
[ESP32 Field Node]
 • Button/sensor trigger
 • 4 hazard modes
 • Deep sleep between alerts
 • Battery telemetry via ADC
 • SPIFFS offline queue
        |
    ESP-NOW (500m, no infrastructure)
        |
[ESP32 Base Station]
 • MAC whitelisting
 • ACK confirmation
 • USB Serial bridge
        |
    Serial 115200 baud
        |
[FastAPI Backend]
 • Serial reader thread
 • SQLite with WAL mode
 • Response cache layer
 • WebSocket live push
 • SSE streaming
 • Rate limiting + API key auth
        |
    Ollama local inference
        |
[Gemma 4 E4B — fully offline]
 • NDMA-grounded prompts
 • 3 user personas
 • 3 languages
 • <5 second response time
        |
    HTTP polling + WebSocket
        |
[React PWA — Samsung A26]
 • Citizen view (visual guide)
 • Panchayat dashboard (zone map)
 • Responder triage protocol
 • Offline drill mode
 • PIN-locked secure views
 • Battery telemetry display
 • WhatsApp share button
 • IP67 rated demo device
```

---

## Technical Challenges and Solutions

**RAM Constraint:** Running Gemma locally on a 3.8GB laptop required aggressive optimization — quantized Q4_K_M weights, reduced num_predict to 100 tokens, num_thread tuning to 4, and temperature reduced to 0.1 for deterministic emergency guidance. Response time dropped from 30+ seconds to under 5 seconds.

**ESP-NOW vs LoRa Tradeoff:** ESP-NOW was chosen for the prototype because both team members had hands-on experience with it from a prior ESP32 project (a secure bidirectional chat terminal with AES-128 hardware encryption). The 500m range is sufficient for hackathon demonstration. The writeup and README explicitly document the LoRa upgrade path for production deployment.

**Multilingual Prompt Engineering:** Getting Gemma to produce clean Devanagari and Telugu output required specific prompt framing — "Respond ONLY in Hindi (Devanagari script)" rather than generic language requests. Testing across 12 hazard-language-user-type combinations validated response quality before caching.

**Offline PWA Reliability:** The React frontend is configured as a Progressive Web App with service worker caching, allowing the entire citizen interface to function without any network connectivity once initially loaded. The Samsung Galaxy A26 used for demonstration is IP67 rated — water and dust resistant — making it physically appropriate for flood-scenario demonstrations.

---

## Real-World Impact Potential

**Cost:** ₹600 per ESP32 node. ₹15,000 to cover a full district with 25 nodes. Compare this to traditional emergency broadcast infrastructure at ₹30-50 lakh per district.

**Scale:** India has 640,000 villages. The architecture is horizontally scalable — each new node joins the mesh automatically with zero configuration.

**Upgrade Path:** Swapping ESP32 + ESP-NOW for ESP32 + LoRa SX1278 (₹400 additional per node) extends range to 15km per hop. A state-level deployment would connect district emergency operations centers to the farthest villages through a relay chain.

**Institutional Path:** State Disaster Management Authorities already maintain district-level disaster management plans. Feeding these plans into a RAG (Retrieval Augmented Generation) layer would make every Gemma response directly traceable to the official district plan — transforming Sahayak from a generic advisory tool to a verified last-mile delivery mechanism for official government guidance.

**IMD Integration:** India Meteorological Department provides open APIs for weather alerts. Integrating IMD triggers would make Sahayak fully autonomous — no human needs to press a button. When IMD issues a cyclone warning for a district, all Sahayak nodes in that district automatically alert without any manual intervention.

---

## Closing

The 2024 Wayanad landslide did not have to be a communication blackout. The 2023 Cyclone Michaung did not have to leave 4 million people unreachable for 17 hours. The technology to prevent this exists — it runs on a ₹300 microcontroller and a locally-hosted language model. What was missing was the architecture that brings them together.

Sahayak is that architecture. Offline by design. Multilingual by necessity. Built for the 640,000 villages that existing solutions have never reached.

When towers fall, Sahayak keeps communities connected.

---

**GitHub:** https://github.com/sphoorthi340-bit/sahayak
**Demo:** https://dicing-yo-yo-angelic.ngrok-free.dev
**Model:** Gemma 4 E4B via Ollama (local inference, zero cloud dependency — optimized for offline disaster response)
**Hardware:** 2× ESP32-WROOM-32, Samsung Galaxy A26 (IP67), Dell Precision 7510
