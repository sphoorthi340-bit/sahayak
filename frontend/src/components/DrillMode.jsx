// ─── DRILL MODE (Quiz) ───────────────────────────────────
// 5-question quiz per hazard type, runs from static JSON.

import { useState } from "react";
import QUIZ_DATA from "../data/quizData.js";

const HAZARD_META = {
  flood:     { icon: "🌊", label: "Flash Flood",  bg: "bg-blue-600" },
  cyclone:   { icon: "🌀", label: "Cyclone",      bg: "bg-slate-600" },
  landslide: { icon: "⛰️", label: "Landslide",    bg: "bg-amber-700" },
  heatwave:  { icon: "🌡️", label: "Heatwave",     bg: "bg-orange-600" },
};

export default function DrillMode({ onClose }) {
  const [phase, setPhase]           = useState("pick");  // pick | quiz | result
  const [hazard, setHazard]         = useState(null);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [score, setScore]           = useState(0);
  const [selected, setSelected]     = useState(null);
  const [locked, setLocked]         = useState(false);
  const [animKey, setAnimKey]       = useState(0);

  const questions = hazard ? QUIZ_DATA[hazard] : [];
  const current   = questions[questionIdx];

  function pickHazard(h) {
    setHazard(h);
    setPhase("quiz");
    setQuestionIdx(0);
    setScore(0);
    setSelected(null);
    setLocked(false);
    setAnimKey(k => k + 1);
  }

  function selectAnswer(idx) {
    if (locked) return;
    setSelected(idx);
    setLocked(true);
    if (idx === current.answer) setScore(s => s + 1);

    setTimeout(() => {
      if (questionIdx < questions.length - 1) {
        setQuestionIdx(i => i + 1);
        setSelected(null);
        setLocked(false);
        setAnimKey(k => k + 1);
      } else {
        setPhase("result");
      }
    }, 1200);
  }

  function restart() {
    setPhase("pick");
    setHazard(null);
    setQuestionIdx(0);
    setScore(0);
    setSelected(null);
    setLocked(false);
  }

  // ─── PICK HAZARD ───
  if (phase === "pick") {
    return (
      <div className="flex flex-col gap-4 animate-fade-slide-in">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">🎯 Emergency Drill</h2>
            <p className="text-xs text-gray-400 mt-0.5">Test your disaster preparedness</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-gray-500">Choose a hazard to practice:</p>

        <div className="grid grid-cols-2 gap-3">
          {Object.entries(HAZARD_META).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => pickHazard(key)}
              className={`${meta.bg} text-white rounded-2xl p-4 flex flex-col items-center gap-2 
                transition-all hover:scale-[1.03] active:scale-[0.97] shadow-lg`}
            >
              <span className="text-3xl">{meta.icon}</span>
              <span className="text-sm font-bold">{meta.label}</span>
              <span className="text-xs opacity-75">5 Questions</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── QUIZ ───
  if (phase === "quiz" && current) {
    const meta = HAZARD_META[hazard];
    const progress = ((questionIdx + 1) / questions.length) * 100;

    return (
      <div className="flex flex-col gap-4 animate-fade-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{meta.icon}</span>
            <span className="text-sm font-bold text-gray-700">{meta.label} Drill</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className={`${meta.bg} h-full rounded-full transition-all duration-500`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Question */}
        <div key={animKey} className="animate-question-in">
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">
            Question {questionIdx + 1} of {questions.length}
          </p>
          <p className="text-base font-semibold text-gray-900 leading-relaxed">
            {current.q}
          </p>
        </div>

        {/* Options */}
        <div key={`opts-${animKey}`} className="flex flex-col gap-2 stagger-children">
          {current.options.map((opt, idx) => {
            let optStyle = "bg-gray-50 border-gray-200 text-gray-800 hover:border-gray-300";
            if (locked) {
              if (idx === current.answer) {
                optStyle = "bg-green-50 border-green-400 text-green-800 flash-correct";
              } else if (idx === selected && idx !== current.answer) {
                optStyle = "bg-red-50 border-red-400 text-red-800 flash-wrong";
              } else {
                optStyle = "bg-gray-50 border-gray-100 text-gray-400";
              }
            } else if (idx === selected) {
              optStyle = `${meta.bg.replace("bg-", "bg-")} border-transparent text-white`;
            }

            return (
              <button
                key={idx}
                onClick={() => selectAnswer(idx)}
                disabled={locked}
                className={`step-card flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${optStyle}`}
              >
                <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  locked && idx === current.answer
                    ? "bg-green-500 border-green-500 text-white"
                    : locked && idx === selected && idx !== current.answer
                    ? "bg-red-500 border-red-500 text-white"
                    : "border-current"
                }`}>
                  {locked && idx === current.answer ? "✓" :
                   locked && idx === selected && idx !== current.answer ? "✗" :
                   String.fromCharCode(65 + idx)}
                </span>
                <span className="text-sm font-medium leading-snug">{opt}</span>
              </button>
            );
          })}
        </div>

        {/* Score tracker */}
        <p className="text-center text-xs text-gray-400">
          Score: {score}/{questionIdx + (locked ? 1 : 0)}
        </p>
      </div>
    );
  }

  // ─── RESULT ───
  if (phase === "result") {
    const meta = HAZARD_META[hazard];
    const pct = Math.round((score / questions.length) * 100);
    const emoji = pct >= 80 ? "🏆" : pct >= 60 ? "👍" : pct >= 40 ? "📖" : "⚠️";
    const message = pct >= 80
      ? "Excellent! You're well prepared."
      : pct >= 60
      ? "Good knowledge! Review a few areas."
      : pct >= 40
      ? "Keep learning — practice makes perfect."
      : "Please review the safety guidelines.";

    return (
      <div className="flex flex-col items-center gap-5 py-6 animate-fade-slide-in">
        <span className="text-5xl animate-count-up">{emoji}</span>
        <div className="text-center">
          <p className="text-4xl font-black text-gray-900 animate-count-up">
            {score}/{questions.length}
          </p>
          <p className="text-sm text-gray-500 mt-1">{message}</p>
        </div>

        <div className={`${meta.bg} text-white px-4 py-2 rounded-full text-sm font-medium`}>
          {meta.icon} {meta.label} Drill — {pct}%
        </div>

        <div className="flex gap-3 mt-2">
          <button
            onClick={() => pickHazard(hazard)}
            className="px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold 
              hover:bg-gray-800 active:scale-[0.97] transition-all"
          >
            Try Again
          </button>
          <button
            onClick={restart}
            className="px-5 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold 
              hover:bg-gray-200 active:scale-[0.97] transition-all"
          >
            Other Hazards
          </button>
        </div>

        <button
          onClick={onClose}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors mt-2"
        >
          ← Back to Safety Info
        </button>
      </div>
    );
  }

  return null;
}
