import { useState, useEffect, useCallback, useRef } from "react";
import DrillMode from "./src/components/DrillMode.jsx";
import ZoneMap from "./src/components/ZoneMap.jsx";
import ArchitectureDiagram from "./src/components/ArchitectureDiagram.jsx";
import SituationPanel from "./src/components/SituationPanel.jsx";
import NodeHealthBar from "./src/components/NodeHealthBar.jsx";

// ─── CONFIG ──────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || "";

// ─── CONSTANTS ───────────────────────────────────────────
const HAZARD_CONFIG = {
  // 9 one-press types
  medical:    { gradient: "from-red-500 to-red-700",      light: "bg-red-50",     border: "border-red-400",     text: "text-red-700",     accent: "#ef4444", icon: "🚑", label: "MEDICAL"      },
  missing:    { gradient: "from-purple-500 to-purple-700", light: "bg-purple-50",  border: "border-purple-400",  text: "text-purple-700",  accent: "#a855f7", icon: "🔍", label: "MISSING"      },
  flood:      { gradient: "from-blue-600 to-blue-800",    light: "bg-blue-50",    border: "border-blue-400",    text: "text-blue-700",    accent: "#2563eb", icon: "🌊", label: "FLOOD"        },
  fire:       { gradient: "from-orange-500 to-red-600",   light: "bg-orange-50",  border: "border-orange-400",  text: "text-orange-700",  accent: "#f97316", icon: "🔥", label: "FIRE"         },
  food_water: { gradient: "from-green-500 to-green-700",  light: "bg-green-50",   border: "border-green-400",   text: "text-green-700",   accent: "#22c55e", icon: "🥤", label: "FOOD/WATER"   },
  trapped:    { gradient: "from-yellow-600 to-orange-600",light: "bg-yellow-50",  border: "border-yellow-400",  text: "text-yellow-700",  accent: "#ca8a04", icon: "🆘", label: "TRAPPED"      },
  safe:       { gradient: "from-teal-500 to-teal-700",    light: "bg-teal-50",    border: "border-teal-400",    text: "text-teal-700",    accent: "#14b8a6", icon: "✅", label: "SAFE HERE"    },
  evac:       { gradient: "from-indigo-500 to-indigo-700",light: "bg-indigo-50",  border: "border-indigo-400",  text: "text-indigo-700",  accent: "#6366f1", icon: "🚶", label: "NEED EVAC"    },
  sos:        { gradient: "from-red-600 to-rose-800",     light: "bg-rose-50",    border: "border-rose-400",    text: "text-rose-700",    accent: "#dc2626", icon: "🔴", label: "SOS"          },
  // Legacy types
  cyclone:    { gradient: "from-slate-600 to-slate-800",  light: "bg-slate-50",   border: "border-slate-400",   text: "text-slate-700",   accent: "#475569", icon: "🌀", label: "CYCLONE"      },
  landslide:  { gradient: "from-amber-600 to-amber-800",  light: "bg-amber-50",   border: "border-amber-400",   text: "text-amber-700",   accent: "#d97706", icon: "⛰️", label: "LANDSLIDE"    },
  heatwave:   { gradient: "from-orange-400 to-red-500",   light: "bg-orange-50",  border: "border-orange-300",  text: "text-orange-600",  accent: "#ea580c", icon: "🌡️", label: "HEATWAVE"     },
};

const LANG_LABELS = { en: "EN", hi: "हि", te: "తె" };

const SEVERITY_COLOR = {
  low:      "bg-green-100 text-green-800",
  medium:   "bg-yellow-100 text-yellow-800",
  high:     "bg-red-100 text-red-800",
  critical: "bg-red-600 text-white severity-critical",
};

const OFFLINE_PROTOCOLS = {
  flood: {
    en: "1. Move to higher ground immediately.\n2. Avoid walking or driving through flood waters.\n3. Disconnect electrical appliances to prevent shock.\n4. Keep your emergency kit and documents ready.\n5. Wait for official clearance before returning home.",
    hi: "1. तुरंत ऊंचे स्थानों पर चले जाएं।\n2. बाढ़ के पानी में चलने या गाड़ी चलाने से बचें।\n3. बिजली के उपकरणों को डिस्कनेक्ट करें।\n4. अपनी आपातकालीन किट और दस्तावेज तैयार रखें।\n5. घर लौटने से पहले आधिकारिक सूचना का इंतजार करें।",
    te: "1. వెంటనే ఎత్తైన ప్రాంతాలకు వెళ్ళండి.\n2. వరద నీటిలో నడవడం లేదా వాహనాలు నడపడం నివారించండి.\n3. విద్యుత్ పరికరాలను నిలిపివేయండి.\n4. అత్యవసర కిట్ మరియు పత్రాలను సిద్ధంగా ఉంచుకోండి.\n5. అధికారిక అనుమతి వచ్చేవరకు ఇంటికి వెళ్ళవద్దు."
  },
  cyclone: {
    en: "1. Stay indoors and away from windows.\n2. Keep your mobile phone charged for emergencies.\n3. Turn off gas supply and main power switch.\n4. Secure loose items outside your house.\n5. Remain indoors until the cyclone has completely passed.",
    hi: "1. घर के अंदर रहें और खिड़कियों से दूर रहें।\n2. आपात स्थिति के लिए अपना मोबाइल फोन चार्ज रखें।\n3. गैस की आपूर्ति और मुख्य पावर स्विच बंद करें।\n4. घर के बाहर की ढीली वस्तुओं को सुरक्षित करें।\n5. चक्रवात के पूरी तरह से गुजरने तक घर के अंदर रहें।",
    te: "1. కిటికీలకు దూరంగా ఇంటి లోపలే ఉండండి.\n2. అత్యవసర పరిస్థితుల కోసం మొబైల్ ఫోన్‌ను ఛార్జ్ చేసి ఉంచండి.\n3. గ్యాస్ సరఫరా మరియు ప్రధాన పవర్ స్విచ్‌ను ఆఫ్ చేయండి.\n4. ఇంటి బయట ఉన్న వస్తువులను భద్రపరచండి.\n5. తుఫాను పూర్తిగా తగ్గే వరకు ఇంటి లోపలే ఉండండి."
  },
  landslide: {
    en: "1. Stay alert for loud noises or ground movement.\n2. Move away from slopes and landslide-prone areas.\n3. If you cannot escape, curl into a ball and protect your head.\n4. Watch for sudden increases or decreases in water flow.\n5. Do not return to the area until officials declare it safe.",
    hi: "1. तेज आवाजों या जमीन की हलचल के प्रति सतर्क रहें।\n2. ढलानों और भूस्खलन वाले क्षेत्रों से दूर रहें।\n3. यदि आप बच नहीं सकते हैं, तो सिर की रक्षा के लिए झुक जाएं।\n4. जल प्रवाह में अचानक वृद्धि या कमी पर नजर रखें।\n5. अधिकारियों द्वारा सुरक्षित घोषित किए जाने तक क्षेत्र में न लौटें।",
    te: "1. పెద్ద శబ్దాలు లేదా భూమి కదలికల పట్ల అప్రమత్తంగా ఉండండి.\n2. వాలులు మరియు కొండచరియలు విరిగిపడే ప్రాంతాలకు దూరంగా ఉండండి.\n3. తప్పించుకోలేకపోతే, తలను రక్షించుకోవడానికి ముడుచుకోండి.\n4. నీటి ప్రవాహంలో మార్పులను గమనిస్తూ ఉండండి.\n5. అధికారులు సురక్షితమని ప్రకటించే వరకు ఆ ప్రాంతానికి వెళ్ళవద్దు."
  },
  heatwave: {
    en: "1. Stay hydrated by drinking plenty of water and ORS.\n2. Avoid going outdoors between 12 PM and 3 PM.\n3. Wear light-colored, loose cotton clothing.\n4. Keep your home cool with curtains and cross-ventilation.\n5. Never leave children or pets in parked vehicles.",
    hi: "1. खूब पानी और ओआरएस पीकर हाइड्रेटेड रहें।\n2. दोपहर 12 बजे से 3 बजे के बीच बाहर जाने से बचें।\n3. हल्के रंग के, ढीले सूती कपड़े पहनें।\n4. पर्दों और वेंटिलेशन के साथ अपने घर को ठंडा रखें।\n5. बच्चों या पालतू जानवरों को पार्क किए गए वाहनों में कभी न छोड़ें।",
    te: "1. పుష్కలంగా నీరు మరియు ORS తాగుతూ ఉండండి.\n2. మధ్యాహ్నం 12 నుండి 3 గంటల మధ్య బయటకు వెళ్ళవద్దు.\n3. లేత రంగు, వదులుగా ఉండే కాటన్ దుస్తులను ధరించండి.\n4. కిటికీలు మరియు వెంటిలేషన్ ద్వారా మీ ఇంటిని చల్లగా ఉంచండి.\n5. పిల్లలను లేదా పెంపుడు జంతువులను పార్క్ చేసిన వాహనాల్లో వదిలివేయవద్దు."
  }
};

// ─── UTILS ───────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso + "Z")) / 1000);
  if (diff < 60)  return `${diff} seconds ago`;
  if (diff < 3600) return `${Math.floor(diff/60)} minutes ago`;
  return `${Math.floor(diff/3600)} hours ago`;
}

function parseSteps(text) {
  if (!text) return [];
  return text
    .split("\n")
    .map(l => l.replace(/^[\d\.\-\*\s]+/, "").trim())
    .filter(l => l.length > 5);
}

function getZone(location) {
  if (!location) return "Mundakkai";
  const loc = location.toLowerCase();
  if (loc.includes("_a") || loc.includes("zone a") || loc === "a" || loc.includes("mundakkai")) return "Mundakkai";
  if (loc.includes("_b") || loc.includes("zone b") || loc === "b" || loc.includes("chooralmala")) return "Chooralmala";
  if (loc.includes("_c") || loc.includes("zone c") || loc === "c" || loc.includes("attamala")) return "Attamala";
  if (loc.includes("_d") || loc.includes("zone d") || loc === "d" || loc.includes("noolpuzha")) return "Noolpuzha";
  const hash = loc.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return ["Mundakkai", "Chooralmala", "Attamala", "Noolpuzha"][hash % 4];
}

// ─── HOOKS (SSE Based) ───────────────────────────────────
function useAlerts() {
  const [alerts, setAlerts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/alerts`);
      if (!r.ok) throw new Error("API error");
      const data = await r.json();
      setAlerts(data.alerts || []);
      setError(null);
    } catch (e) {
      setError("Cannot reach server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    
    // Connect to SSE for real-time updates
    const sse = new EventSource(`${API_BASE}/stream/alerts`);
    sse.onopen = () => setError(null);
    sse.onmessage = (e) => {
      const incoming = JSON.parse(e.data);
      setAlerts(prev => {
        if (prev.some(a => a.id === incoming.alert_id || a.id === incoming.id)) return prev;
        return [{
          id:          incoming.alert_id || incoming.id,
          node_id:     incoming.node_id,
          hazard:      incoming.hazard,
          severity:    incoming.severity,
          location:    incoming.location,
          source:      incoming.source,
          battery_pct: incoming.battery_pct,
          response:    incoming.response || null,
          received_at: incoming.received_at || new Date().toISOString(),
        }, ...prev].slice(0, 20);
      });
      setError(null);
    };
    sse.onerror = () => {
      setError("Connection lost");
    };

    return () => sse.close();
  }, [fetchAlerts]);

  return { alerts, loading, error, refetch: fetchAlerts };
}

function useInstructions(hazard, userType, lang, severity = "high") {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [cached, setCached]   = useState(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!hazard || !userType || !lang) return;
    setLoading(true);
    setOffline(false);
    fetch(`${API_BASE}/instructions/${hazard}/${userType}/${lang}?severity=${severity}`)
      .then(r => r.json())
      .then(d => { setData(d); setCached(d); setLoading(false); })
      .catch(() => {
        if (cached) {
          setData(cached);
        } else {
          const fallback = OFFLINE_PROTOCOLS[hazard]?.[lang] || OFFLINE_PROTOCOLS[hazard]?.en || "Stay safe. Follow official instructions.";
          setData({ response: `[Offline Fallback] ${fallback}` });
        }
        setOffline(true);
        setLoading(false);
      });
  }, [hazard, userType, lang, severity]);

  return { data: data || cached, loading, offline };
}

// ─── SHARED COMPONENTS ───────────────────────────────────

function LangToggle({ lang, setLang }) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
      {Object.entries(LANG_LABELS).map(([code, label]) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            lang === code
              ? "bg-white shadow text-gray-900"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function AlertPulse({ active }) {
  if (!active) return null;
  return (
    <span className="relative flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
    </span>
  );
}

function LoadingSpinner({ text = "Getting instructions..." }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
      <p className="text-gray-500 text-sm">{text}</p>
    </div>
  );
}

function OfflineBanner({ visible }) {
  if (!visible) return null;
  return (
    <div className="offline-banner-enter bg-amber-500 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium shadow-lg mb-4">
      <span className="text-lg">📡</span>
      <div>
        <p className="font-bold text-xs">OFFLINE MODE</p>
        <p className="text-xs opacity-90">Using local fallback protocols</p>
      </div>
    </div>
  );
}

const CONFIDENCE_BADGE = {
  high:   "🟢 HIGH",
  medium: "🟡 MED",
  low:    "🔴 LOW",
};

function ChatInterface({ userType = "citizen", lang = "en" }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([
    { type: 'ai', text: "Hello! I'm Sahayak AI. How can I help you stay safe today?" }
  ]);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history]);

  const [thinkingMsg, setThinkingMsg] = useState("Gemma is thinking...");

  const handleSend = async (e) => {
    e.preventDefault();
    if (!query.trim() || loading) return;
    const userMsg = query;
    setQuery("");
    setHistory(prev => [...prev, { type: 'user', text: userMsg }]);
    setLoading(true);
    setThinkingMsg("Gemma is thinking...");

    // After 10s show hint — reasoning takes ~30-60s
    const hintTimer = setTimeout(() => setThinkingMsg("Gemma is reasoning... (~30-60s)"), 10000);
    const hintTimer2 = setTimeout(() => setThinkingMsg("Formulating survival steps..."), 35000);

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 180000);

    try {
      const r = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, user_type: userType, language: lang }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await r.json();
      setHistory(prev => [...prev, { type: "ai", text: data.response }]);
    } catch (err) {
      clearTimeout(timeoutId);
      const msg = err.name === "AbortError"
        ? "Request timed out (180s). Gemma may still be loading — please try again."
        : "Connection lost. Please follow manual safety protocols.";
      setHistory(prev => [...prev, { type: "ai", text: msg }]);
    } finally {
      clearTimeout(hintTimer);
      clearTimeout(hintTimer2);
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="font-bold text-gray-900 text-sm flex items-center gap-2">
          <span className="text-lg">🤖</span> AI Emergency Assistant
        </p>
        <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Local Gemma 4</span>
      </div>
      
      <div ref={scrollRef} className="max-h-48 overflow-y-auto mb-3 flex flex-col gap-2 p-1 custom-scrollbar">
        {history.map((msg, i) => (
          <div key={i} className={`p-3 rounded-2xl text-sm leading-relaxed ${
            msg.type === 'user' 
              ? 'bg-blue-600 text-white self-end rounded-tr-none max-w-[85%]' 
              : 'bg-gray-100 text-gray-800 self-start rounded-tl-none max-w-[85%] border border-gray-200 shadow-sm'
          }`}>
            {msg.text}
          </div>
        ))}
        {loading && (
          <div className="bg-gray-50 text-gray-400 text-[10px] p-2 rounded-lg self-start animate-pulse flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"></span>
            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0.2s]"></span>
            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0.4s]"></span>
            {thinkingMsg}
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="relative">
        <input 
          type="text" 
          value={query} 
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a question (e.g. 'How to treat a burn?')"
          className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-inner"
        />
        <button 
          type="submit" 
          disabled={loading || !query.trim()} 
          className="absolute right-2 top-1.5 bg-blue-600 text-white w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 disabled:opacity-30 disabled:grayscale transition-all shadow-md"
        >
          ➤
        </button>
      </form>
    </div>
  );
}

// ─── PIN LOCK COMPONENT ──────────────────────────────────
function PinLock({ onUnlock, roleName }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const CORRECT_PIN = "1234";

  const handlePress = (num) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      setError(false);
      if (newPin.length === 4) {
        if (newPin === CORRECT_PIN) {
          onUnlock();
        } else {
          setError(true);
          setTimeout(() => setPin(""), 500);
        }
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-6 bg-white rounded-2xl shadow-sm p-6 mt-4">
      <div className="text-center">
        <span className="text-4xl">🔒</span>
        <h2 className="text-xl font-bold mt-2 text-gray-800">Secure Access</h2>
        <p className="text-sm text-gray-500">Enter PIN for {roleName}</p>
      </div>
      <div className="flex gap-3 mb-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`w-4 h-4 rounded-full border-2 ${pin.length > i ? 'bg-gray-800 border-gray-800' : 'bg-transparent border-gray-300'} ${error ? 'bg-red-500 border-red-500 animate-pulse' : ''}`}></div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
          <button key={num} onClick={() => handlePress(num.toString())} className="w-16 h-16 rounded-full bg-gray-50 text-xl font-bold text-gray-800 shadow-sm border border-gray-100 active:bg-gray-200">
            {num}
          </button>
        ))}
        <div className="w-16 h-16"></div>
        <button onClick={() => handlePress("0")} className="w-16 h-16 rounded-full bg-gray-50 text-xl font-bold text-gray-800 shadow-sm border border-gray-100 active:bg-gray-200">0</button>
        <button onClick={() => setPin(pin.slice(0, -1))} className="w-16 h-16 rounded-full bg-transparent text-xl font-bold text-gray-400 active:text-gray-800">⌫</button>
      </div>
    </div>
  );
}

// ─── CITIZEN VIEW ────────────────────────────────────────
function CitizenView({ latestAlert, isOnline, globalLang, setGlobalLang }) {
  const [hazard, setHazard]   = useState(latestAlert?.hazard || "flood");
  const [showDrill, setShowDrill] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const severity              = latestAlert?.severity || "high";
  const { data, loading, offline } = useInstructions(hazard, "citizen", globalLang, severity);
  const cfg                   = HAZARD_CONFIG[hazard] || HAZARD_CONFIG.flood;

  useEffect(() => {
    if (latestAlert?.hazard) setHazard(latestAlert.hazard);
  }, [latestAlert]);

  useEffect(() => {
    setAnimKey(k => k + 1);
  }, [hazard]);

  const steps = parseSteps(data?.response);

  if (showDrill) {
    return <DrillMode onClose={() => setShowDrill(false)} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <OfflineBanner visible={!isOnline || offline} />

      {/* Massive Hazard Banner */}
      <div className={`bg-gradient-to-br ${cfg.gradient} text-white rounded-2xl p-5 shadow-lg animate-scale-in`}>
        <div className="flex items-start justify-between">
          <div>
            {latestAlert && (
              <div className="flex items-center gap-2 mb-2">
                <AlertPulse active={true} />
                <span className="text-xs font-bold uppercase tracking-widest opacity-80">Active Alert</span>
              </div>
            )}
            <span className="text-5xl block mb-1">{cfg.icon}</span>
            <h2 className="text-2xl font-black tracking-tight leading-tight">{cfg.label}</h2>
          </div>
          <div className="text-right">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase
              ${severity === "critical" ? "bg-white/30 severity-critical" : "bg-white/20"}`}>
              {severity}
            </span>
            {latestAlert && (
              <p className="text-xs opacity-60 mt-2">{timeAgo(latestAlert.received_at)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Hazard Selector Pills */}
      <div className="flex flex-wrap gap-2 hazard-pills py-1 px-0.5">
        {Object.entries(HAZARD_CONFIG).map(([key, val]) => (
          <button
            key={key}
            onClick={() => setHazard(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full border-2 whitespace-nowrap transition-all flex-shrink-0 step-card ${
              hazard === key
                ? `bg-gradient-to-r ${val.gradient} text-white border-transparent shadow-md`
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            <span className="text-lg">{val.icon}</span>
            <span className="text-xs font-bold">{val.label}</span>
          </button>
        ))}
      </div>

      {/* Instructions */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-bold text-gray-900 text-base">What To Do Now</p>
            <p className="text-xs text-gray-400 mt-0.5">Follow these steps in order</p>
          </div>
          <div className="flex items-center gap-2">
            {steps.length > 0 && (
              <a 
                href={`whatsapp://send?text=${encodeURIComponent(`*SAHAYAK ALERT: ${cfg.label}*\n\n${steps.map((s,i) => `${i+1}. ${s}`).join('\n')}`)}`} 
                className="text-green-600 font-bold text-xs bg-green-50 px-2 py-1.5 rounded-lg flex items-center gap-1 shadow-sm border border-green-100"
              >
                <span className="text-sm">💬</span> Share
              </a>
            )}
            <LangToggle lang={globalLang} setLang={setGlobalLang} />
          </div>
        </div>

        {loading ? <LoadingSpinner /> : (
          <div key={animKey} className="flex flex-col gap-3 stagger-children">
            {steps.length > 0 ? steps.map((step, i) => (
              <div
                key={i}
                className={`step-card flex gap-3 items-start p-4 rounded-xl border-l-4 bg-gray-50 ${cfg.border}`}
                style={{ minHeight: "60px" }}
              >
                <span
                  className={`bg-gradient-to-br ${cfg.gradient} text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-black flex-shrink-0 shadow-sm`}
                >
                  {i + 1}
                </span>
                <p className="text-gray-800 text-[15px] leading-relaxed font-medium pt-1">{step}</p>
              </div>
            )) : (
              <p className="text-gray-400 text-sm text-center py-6">
                {data?.response || "Select a hazard to get safety instructions"}
              </p>
            )}
            {steps.length > 0 && (
              <p className="text-center text-[10px] text-gray-400 mt-2 font-medium">
                {data?.generation_ms ? `Generated by Gemma 4 E4B in ${(data.generation_ms / 1000).toFixed(1)}s` : 'Served from local cache'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* AI Chat Interface */}
      <ChatInterface lang={globalLang} />

      {/* Drill Mode Button */}
      <button
        onClick={() => setShowDrill(true)}
        className="drill-button w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl p-4 
          flex items-center justify-center gap-3 shadow-lg hover:shadow-xl 
          active:scale-[0.98] transition-all"
      >
        <span className="text-xl">🎯</span>
        <div className="text-left">
          <p className="text-sm font-bold">Practice Emergency Drill</p>
          <p className="text-xs opacity-75">Test your preparedness — works offline</p>
        </div>
        <span className="text-lg ml-auto opacity-60">→</span>
      </button>
    </div>
  );
}

// ─── PANCHAYAT VIEW ───────────────────────────────────────
function PanchayatView({ alerts, globalLang, setGlobalLang }) {
  const latestAlert           = alerts[0];
  const hazard                = latestAlert?.hazard || "flood";
  const severity              = latestAlert?.severity || "high";
  const { data, loading }     = useInstructions(hazard, "panchayat", globalLang, severity);
  const steps                 = parseSteps(data?.response);

  const zoneCounts = {};
  alerts.forEach(a => {
    const zone = getZone(a.location);
    zoneCounts[zone] = (zoneCounts[zone] || 0) + 1;
  });

  const hazardCounts = {};
  Object.keys(HAZARD_CONFIG).forEach(h => {
    hazardCounts[h] = alerts.filter(a => a.hazard === h).length;
  });

  return (
    <div className="flex flex-col gap-4">
      <SituationPanel />
      <NodeHealthBar />
      <ZoneMap zoneCounts={zoneCounts} />

      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-xs text-gray-400 font-medium mb-3 uppercase tracking-wide">Hazard Summary</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(HAZARD_CONFIG).map(([key, val]) => (
            <div key={key} className={`p-3 rounded-xl ${val.light} border ${val.border}`}>
              <div className="flex items-center justify-between">
                <span className="text-xl">{val.icon}</span>
                <span className={`text-lg font-bold ${val.text}`}>{hazardCounts[key] || 0}</span>
              </div>
              <p className={`text-xs font-medium mt-1 ${val.text}`}>{val.label}</p>
              <p className="text-xs text-gray-400">{hazardCounts[key] ? "alerts" : "clear"}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-bold text-gray-800">Coordination Actions</p>
            {latestAlert && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-sm">{(HAZARD_CONFIG[hazard] || HAZARD_CONFIG.flood).icon}</span>
                <span className={`text-xs font-semibold ${(HAZARD_CONFIG[hazard] || HAZARD_CONFIG.flood).text}`}>
                  {(HAZARD_CONFIG[hazard] || HAZARD_CONFIG.flood).label}
                </span>
              </div>
            )}
          </div>
          <LangToggle lang={globalLang} setLang={setGlobalLang} />
        </div>

        {loading ? <LoadingSpinner text="Loading coordination plan..." /> : (
          <div className="flex flex-col gap-2">
            {steps.map((step, i) => (
              <CheckItem key={i} index={i + 1} text={step} />
            ))}
            {steps.length > 0 && (
              <p className="text-center text-[10px] text-gray-400 mt-2 font-medium">
                {data?.generation_ms ? `Generated by Gemma 4 4B in ${(data.generation_ms / 1000).toFixed(1)}s` : 'Served from local cache'}
              </p>
            )}
          </div>
        )}
      </div>

      <ChatInterface userType="panchayat" lang={globalLang} />

      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="font-bold text-gray-800 mb-3">Alert Log</p>
        {alerts.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">No alerts yet</p>
        ) : (
          <div className="flex flex-col gap-2">
            {alerts.slice(0, 8).map((a, i) => {
              const c = HAZARD_CONFIG[a.hazard] || HAZARD_CONFIG.flood;
              const zone = getZone(a.location);
              return (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-xl">{c.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{c.label}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      {a.node_id} · Zone {zone} · {timeAgo(a.received_at)}
                      {a.battery_pct !== undefined && (
                        <span className="font-medium ml-1 flex items-center gap-0.5" title="Battery">
                          <span className={a.battery_pct < 20 ? "text-red-500" : "text-gray-400"}>🔋</span>
                          {a.battery_pct}%
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLOR[a.severity] || SEVERITY_COLOR.high}`}>
                      {a.severity}
                    </span>
                    {a.confidence && (
                      <span className="text-[9px] text-gray-400 font-medium">{CONFIDENCE_BADGE[a.confidence] || ""}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CheckItem({ index, text }) {
  const [checked, setChecked] = useState(false);
  return (
    <button
      onClick={() => setChecked(!checked)}
      className={`flex gap-3 items-start p-3 rounded-xl border transition-all text-left ${
        checked
          ? "bg-green-50 border-green-200"
          : "bg-gray-50 border-gray-100 hover:border-gray-200"
      }`}
    >
      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
        checked ? "bg-green-500 border-green-500" : "border-gray-300"
      }`}>
        {checked && <span className="text-white text-xs">✓</span>}
      </div>
      <p className={`text-sm leading-relaxed ${checked ? "line-through text-gray-400" : "text-gray-800"}`}>
        {text}
      </p>
    </button>
  );
}

// ─── RESPONDER VIEW ───────────────────────────────────────
function ResponderView({ alerts, globalLang, setGlobalLang }) {
  const latestAlert         = alerts[0];
  const hazard              = latestAlert?.hazard || "flood";
  const severity            = latestAlert?.severity || "high";
  const { data, loading }   = useInstructions(hazard, "responder", globalLang, severity);
  const cfg                 = HAZARD_CONFIG[hazard] || HAZARD_CONFIG.flood;
  const steps               = parseSteps(data?.response);

  const PRIORITY_COLORS = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-blue-500"];

  return (
    <div className="flex flex-col gap-4">
      <div className={`bg-gradient-to-br ${cfg.gradient} text-white rounded-2xl p-4`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm opacity-75 font-medium">ACTIVE INCIDENT</p>
            <p className="text-xl font-bold">{cfg.icon} {cfg.label}</p>
          </div>
          <div className="text-right">
            <p className="text-sm opacity-75">Severity</p>
            <p className="text-lg font-bold uppercase">{severity}</p>
          </div>
        </div>
        {latestAlert && (
          <p className="text-xs opacity-75 mt-2">
            Node: {latestAlert.node_id} · {timeAgo(latestAlert.received_at)}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <p className="font-bold text-gray-800">Triage Protocol</p>
          <LangToggle lang={globalLang} setLang={setGlobalLang} />
        </div>

        {loading ? <LoadingSpinner text="Loading triage protocol..." /> : (
          <div className="flex flex-col gap-2">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-3 items-start p-3 rounded-xl bg-gray-50">
                <span className={`${PRIORITY_COLORS[i] || "bg-gray-400"} text-white text-xs font-bold px-2 py-1 rounded-md flex-shrink-0`}>
                  P{i + 1}
                </span>
                <p className="text-sm text-gray-800 leading-relaxed">{step}</p>
              </div>
            ))}
            {steps.length > 0 && (
              <p className="text-center text-[10px] text-gray-400 mt-2 font-medium">
                {data?.generation_ms ? `Generated by Gemma 4 4B in ${(data.generation_ms / 1000).toFixed(1)}s` : 'Served from local cache'}
              </p>
            )}
          </div>
        )}
      </div>

      <ChatInterface userType="responder" lang={globalLang} />

      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="font-bold text-gray-800 mb-3">Incident Feed</p>
        <div className="flex flex-col gap-2">
          {alerts.slice(0, 5).map((a, i) => {
            const c = HAZARD_CONFIG[a.hazard] || HAZARD_CONFIG.flood;
            const zone = getZone(a.location);
            return (
              <div key={i} className={`p-3 rounded-xl ${c.light} border ${c.border} flex items-center gap-3`}>
                <span className="text-lg">{c.icon}</span>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${c.text}`}>{c.label}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    {a.node_id} · Zone {zone} · {timeAgo(a.received_at)}
                    {a.battery_pct !== undefined && (
                      <span className="font-medium ml-1 flex items-center gap-0.5" title="Battery">
                        <span className={a.battery_pct < 20 ? "text-red-500" : "text-gray-400"}>🔋</span>
                        {a.battery_pct}%
                      </span>
                    )}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${SEVERITY_COLOR[a.severity] || SEVERITY_COLOR.high}`}>
                  {a.severity?.toUpperCase()}
                </span>
              </div>
            );
          })}
          {alerts.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-4">No incidents reported</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── INFO VIEW ────────────────────────────────────────────
const TECH_STACK = [
  { label: "Gemma 4 E4B",  color: "from-blue-500 to-blue-700" },
  { label: "FastAPI",      color: "from-emerald-500 to-emerald-700" },
  { label: "ESP-NOW",      color: "from-amber-500 to-amber-700" },
  { label: "React PWA",    color: "from-cyan-500 to-cyan-700" },
  { label: "SQLite",       color: "from-violet-500 to-violet-700" },
  { label: "SSE Stream",   color: "from-pink-500 to-pink-700" },
];

const IMPACT_STATS = [
  {
    event: "Wayanad Landslides 2024",
    icon: "⛰️",
    stats: [
      { value: "100%", label: "Cell tower failure" },
      { value: "420+", label: "Lives lost" },
      { value: "0", label: "Digital warnings sent" },
    ],
  },
  {
    event: "Cyclone Michaung 2023",
    icon: "🌀",
    stats: [
      { value: "30%", label: "Tower failure" },
      { value: "4M+", label: "People affected" },
      { value: "17hrs", label: "Communication blackout" },
    ],
  },
];

function InfoView() {
  return (
    <div className="flex flex-col gap-4 animate-fade-slide-in">
      <div className="bg-gradient-to-br from-gray-900 to-slate-800 text-white rounded-2xl p-5 shadow-lg text-center">
        <p className="text-4xl mb-1">🛡️</p>
        <h2 className="text-2xl font-black tracking-tight">सहायक</h2>
        <p className="text-lg font-medium text-slate-300">Sahayak</p>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed max-w-xs mx-auto">
          Offline-first disaster response system for rural India.
          When towers fall, Sahayak keeps communities connected.
        </p>
      </div>

      <ArchitectureDiagram />

      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-xs text-gray-400 font-medium mb-3 uppercase tracking-wide">Tech Stack</p>
        <div className="flex flex-wrap gap-2">
          {TECH_STACK.map((tech) => (
            <span
              key={tech.label}
              className={`bg-gradient-to-r ${tech.color} text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm`}
            >
              {tech.label}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-xs text-gray-400 font-medium mb-1 uppercase tracking-wide">Why Sahayak Matters</p>
        <p className="text-xs text-gray-500 mb-3">Real disasters where communication failed</p>
        {IMPACT_STATS.map((disaster) => (
          <div key={disaster.event} className="mb-4 last:mb-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{disaster.icon}</span>
              <p className="text-sm font-bold text-gray-800">{disaster.event}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {disaster.stats.map((stat) => (
                <div key={stat.label} className="bg-red-50 rounded-xl p-2 text-center">
                  <p className="text-lg font-black text-red-600">{stat.value}</p>
                  <p className="text-[10px] text-red-400 font-medium leading-tight">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl p-4 shadow-lg text-center">
        <p className="text-2xl mb-1">🏆</p>
        <p className="text-sm font-bold">Gemma 4 Good Hackathon</p>
        <p className="text-xs opacity-75 mt-1">Kaggle × Google DeepMind 2026</p>
      </div>

      <p 
        className="text-center text-xs text-gray-300 pb-2 cursor-pointer"
        onDoubleClick={() => fetch(`${API_BASE}/demo`, { method: 'POST' })}
        title="Double-click to start demo sequence"
      >
        Sahayak v1.0.0 (Phase 3)
      </p>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────
const TABS = [
  { id: "citizen",   label: "Citizen",   icon: "👤" },
  { id: "panchayat", label: "Leader",    icon: "🏛" },
  { id: "responder", label: "Responder", icon: "🚨" },
  { id: "info",      label: "Info",      icon: "ℹ️" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("citizen");
  const [unlocked, setUnlocked] = useState({ panchayat: false, responder: false });
  const [globalLang, setGlobalLang] = useState("en");
  const { alerts, loading, error } = useAlerts();
  const latestAlert = alerts[0] || null;
  const isOnline = !error;
  const activeNodes = new Set(alerts.filter(a => a.node_id).map(a => a.node_id)).size;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col max-w-md mx-auto">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-3 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-gray-900">
              सहायक <span className="text-gray-400 font-normal text-sm">Sahayak</span>
            </h1>
            <p className="text-xs text-gray-400 font-medium tracking-wide">Offline Disaster Resilience</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">
              {activeNodes} {activeNodes === 1 ? 'node' : 'nodes'} active
            </span>
            {latestAlert && <AlertPulse active={true} />}
            <span className="relative flex h-3 w-3">
              {isOnline && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${error ? 'bg-red-400' : 'bg-green-500'}`}></span>
            </span>
            <span className={`text-xs font-bold uppercase tracking-wide ${error ? 'text-red-500' : 'text-green-600'}`}>
              {error ? 'offline' : 'live'}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && alerts.length === 0 ? (
          <LoadingSpinner text="Connecting to Sahayak Mesh..." />
        ) : (
          <>
            {activeTab === "citizen"   && <CitizenView latestAlert={latestAlert} isOnline={isOnline} globalLang={globalLang} setGlobalLang={setGlobalLang} />}
            {activeTab === "panchayat" && (unlocked.panchayat ? <PanchayatView alerts={alerts} globalLang={globalLang} setGlobalLang={setGlobalLang} /> : <PinLock roleName="Leader" onUnlock={() => setUnlocked({...unlocked, panchayat: true})} />)}
            {activeTab === "responder" && (unlocked.responder ? <ResponderView alerts={alerts} globalLang={globalLang} setGlobalLang={setGlobalLang} /> : <PinLock roleName="Responder" onUnlock={() => setUnlocked({...unlocked, responder: true})} />)}
            {activeTab === "info"      && <InfoView />}
          </>
        )}
      </div>

      {/* Bottom nav */}
      <div className="bg-white border-t border-gray-200 px-2 pb-8 pt-2 sticky bottom-0">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all ${
                activeTab === tab.id
                  ? "bg-gray-900 text-white shadow-md transform scale-105"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="text-[11px] font-bold tracking-wide">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
