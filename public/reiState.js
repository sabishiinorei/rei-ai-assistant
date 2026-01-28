// ЯДРО РЕЙ (reiState)

export const reiState = {
  mode: "idle",        // idle | thinking | speaking | listening | alarm
  mood: "calm",        // calm | happy | caring | focused
  energy: 0.6,         // 0..1
  focus: "chat",       // chat | input | cursor

  intent: "observing", // наблюдение

  decision: "silence" // silence | soft_ack | respond | reflect
};

const listeners = new Set();

export function getReiState() {
  return reiState;
}

export function setReiState(patch = {}) {
  Object.assign(reiState, patch);
  listeners.forEach(fn => fn(reiState));
}

export function onReiStateChange(fn) {
  listeners.add(fn);
  // сразу отдаём текущее состояние, чтобы HUD/3D не ждали первого изменения
  fn(reiState);
  return () => listeners.delete(fn);
}

/* =========================
   ENERGY SYSTEM (Boss A)
   ========================= */

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Базовые скорости (в единицах energy/сек).
 * Подбирай “ощущение” тут — остальное само будет плавным.
 */
const BASE_RATES = {
  thinking:  -0.030,
  speaking:  -0.045,
  idle:       0.020,
  listening:  0.028,
  alarm:     -0.020
};

/**
 * Множители настроения.
 * - focused: быстрее тратит, чуть хуже восстанавливается
 * - happy/caring: мягче расход, лучше восстановление
 */
const MOOD_MULT = {
  calm:   { drain: 1.00, regen: 1.00 },
  happy:  { drain: 0.90, regen: 1.10 },
  caring: { drain: 0.85, regen: 1.15 },
  focused:{ drain: 1.15, regen: 0.90 }
};

// Плавность изменения СКОРОСТИ (не самой энергии).
// Чем больше — тем быстрее скорость “догоняет” целевую.
const RATE_SMOOTHING = 6.0;

// Чтобы не спамить listeners каждую миллисекунду
const EPS = 0.0005;

let _energyLoopStarted = false;
let _rafId = 0;
let _lastT = 0;

// Текущая “плавная” скорость (low-pass), energy/сек
let _currentRate = 0;

function getTargetRate(mode, mood) {
  const base = BASE_RATES[mode] ?? 0;
  const m = MOOD_MULT[mood] ?? MOOD_MULT.calm;

  if (base < 0) return base * m.drain;
  if (base > 0) return base * m.regen;
  return 0;
}

function stepEnergy(t) {
  _rafId = requestAnimationFrame(stepEnergy);

  if (!_lastT) _lastT = t;
  let dt = (t - _lastT) / 1000;
  _lastT = t;

  // страховка от рывков при сворачивании вкладки/лаг-кадрах
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 0.05); // максимум 50мс на тик

  const mode = reiState.mode;
  const mood = reiState.mood;

  const targetRate = getTargetRate(mode, mood);

  // Плавно ведём скорость к targetRate (экспоненциальное сглаживание)
  // alpha = 1 - exp(-k*dt) — стабильнее, чем “0.1”
  const alpha = 1 - Math.exp(-RATE_SMOOTHING * dt);
  _currentRate = _currentRate + (targetRate - _currentRate) * alpha;

  const prev = reiState.energy;
  const next = clamp01(prev + _currentRate * dt);

  if (Math.abs(next - prev) > EPS) {
    // Важно: используем setReiState, чтобы HUD/3D реагировали как обычно
    setReiState({ energy: next });
  }
}

export function startEnergyLoop() {
  if (_energyLoopStarted) return;
  _energyLoopStarted = true;
  _lastT = 0;
  _currentRate = 0;
  _rafId = requestAnimationFrame(stepEnergy);
}

/* =========================
   AUTOPILOT (mood/mode/intent)
   ========================= */

const autopilot = {
  enabled: true,

  // "датчики" (их будет дергать твой чат/инпут/сеть)
  flags: {
    thinking: false,
    speaking: false,
    listening: false,
    userTyping: false
  },

  memory: {
    lastUserMessageAt: 0,
    lastTypingAt: 0,

    lastMoodHintAt: 0,
    moodHint: null // "happy" | "caring" | "focused" | null
  },

  locks: {
    modeUntil: 0,
    moodUntil: 0,
    intentUntil: 0
  },

  holdMs: {
    mode: 350,
    mood: 2500,
    intent: 3000
  }
};

const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function pickMode() {
  if (autopilot.flags.speaking) return "speaking";
  if (autopilot.flags.thinking) return "thinking";
  if (autopilot.flags.listening) return "listening";
  return "idle";
}

function pickMood(t) {
  const e = reiState.energy;

  // Mood-hint от текста пользователя (живёт 10 сек)
  const hintAge = t - (autopilot.memory.lastMoodHintAt || 0);
  const hint = autopilot.memory.moodHint;

  if (hint && hintAge < 10000) {
    if (e < 0.22) return "focused";
    if (hint === "caring" && e > 0.30) return "caring";
    if (hint === "happy" && e > 0.45) return "happy";
    if (hint === "focused") return "focused";
  }

  // твоя старая базовая логика — оставляем как есть
  if (e < 0.22) return "focused";
  if (e > 0.78) return "happy";
  if (e > 0.55) return "caring";
  return "calm";
}

function pickIntent() {
  const e = reiState.energy;

  if (autopilot.flags.speaking || autopilot.flags.thinking) return "respond";
  if (e < 0.18) return "withdrawn";
  if (e < 0.45) return "present";
  return "observing";
}

function applyAutopilotTick() {
  if (!autopilot.enabled) return;

  const t = nowMs();

  const desiredMode = pickMode();
  if (t >= autopilot.locks.modeUntil && reiState.mode !== desiredMode) {
    setReiState({ mode: desiredMode });
    autopilot.locks.modeUntil = t + autopilot.holdMs.mode;
  }

  const desiredMood = pickMood(t);
  if (t >= autopilot.locks.moodUntil && reiState.mood !== desiredMood) {
    setReiState({ mood: desiredMood });
    autopilot.locks.moodUntil = t + autopilot.holdMs.mood;
  }

  const desiredIntent = pickIntent();
  if (t >= autopilot.locks.intentUntil && reiState.intent !== desiredIntent) {
    setReiState({ intent: desiredIntent });
    autopilot.locks.intentUntil = t + autopilot.holdMs.intent;
  }
}

let _apRaf = 0;
export function startAutopilot() {
  if (_apRaf) return;
  autopilot.enabled = true;
  const loop = () => {
    _apRaf = requestAnimationFrame(loop);
    applyAutopilotTick();
  };
  loop();
}

export function stopAutopilot() {
  autopilot.enabled = false;
  if (_apRaf) cancelAnimationFrame(_apRaf);
  _apRaf = 0;
}

/**
 * События-датчики (минимум ручного управления).
 */
export function reiEvent(type, payload = {}) {
  const t = nowMs();
  switch (type) {
    case "thinking_start": autopilot.flags.thinking = true; break;
    case "thinking_end": autopilot.flags.thinking = false; break;

    case "speaking_start": autopilot.flags.speaking = true; break;
    case "speaking_end": autopilot.flags.speaking = false; break;

    case "listening_start": autopilot.flags.listening = true; break;
    case "listening_end": autopilot.flags.listening = false; break;

    case "user_typing":
      autopilot.flags.userTyping = !!payload.active;
      autopilot.memory.lastTypingAt = t;
      break;

    case "user_emotion":
      autopilot.memory.moodHint = payload?.mood || null;
      autopilot.memory.lastMoodHintAt = t;
      break;


    case "user_message":
      autopilot.memory.lastUserMessageAt = t;
      break;
  }
}

// автостарт
if (typeof window !== "undefined") {
  startAutopilot();
}


export function stopEnergyLoop() {
  if (!_energyLoopStarted) return;
  _energyLoopStarted = false;
  cancelAnimationFrame(_rafId);
  _rafId = 0;
  _lastT = 0;
  _currentRate = 0;
}

/**
 * Авто-старт в браузере при импорте модуля.
 * Если тебе нужен ручной контроль — удали блок ниже и вызывай startEnergyLoop() в entry-файле.
 */
if (typeof window !== "undefined") {
  startEnergyLoop();
}

// =========================
// alarm PULSE (temporary mode)
// =========================

let _alarmTimer = 0;

/**
 * Включает alarm-режим на ms (по умолчанию 1500мс),
 * затем возвращает прошлый режим (обычно idle).
 * Важно: ставим lock, чтобы autopilot не перебил alarm мгновенно.
 */
export function pulseAlarm(ms = 1500) {
  const t = (typeof performance !== "undefined" ? performance.now() : Date.now());

  // запомним, куда возвращаться (если уже alarm — возвращаемся туда же)
  const prevMode = reiState.mode === "alarm" ? "idle" : reiState.mode;

  // включаем alarm
  setReiState({ mode: "alarm" });

  // заблокируем автопилот по mode, чтобы он не переключил обратно сразу
  autopilot.locks.modeUntil = t + ms;

  // если дернули pulseAlarm несколько раз — продлеваем
  if (_alarmTimer) clearTimeout(alarmTimer);
  _alarmTimer = setTimeout(() => {
    // если за это время началось speaking/thinking/listening — не мешаем (автопилот сам разрулит)
    // если всё ещё alarm — вернёмся
    if (reiState.mode === "alarm") setReiState({ mode: prevMode });
  }, ms);
}

// удобно дергать из любых мест фронта
if (typeof window !== "undefined") {
  window.reiAlarmPulse = pulseAlarm;
}

/* =========================
   DECISION LAYER (Boss C)
   ========================= */

const decision = {
  lockedUntil: 0,
  holdMs: 1200,
  lastDecision: "silence"
};

// “Счастлива = чаще рядом” → снижает готовность отвечать
const MOOD_READINESS = {
  calm:    0.55,
  caring:  0.65,
  focused: 0.50,
  happy:   0.35
};

function computeReadiness(t) {
  const e = reiState.energy; // 0..1
  const m = reiState.mood;
  const intent = reiState.intent;

  // базовая готовность от intent
  let r =
    intent === "withdrawn" ? 0.05 :
    intent === "present"   ? 0.25 :
    intent === "observing" ? 0.45 :   // было 0.35
    intent === "respond"   ? 0.75 :
    0.35;

  // энергия
  r *= (0.35 + 0.65 * e);

  // настроение
  r *= (MOOD_READINESS[m] ?? 0.55) / 0.55;

  // 🔥 главный фикс: свежее сообщение юзера = импульс проявиться
  const sinceMsg = t - (autopilot.memory.lastUserMessageAt || 0);
  if (sinceMsg >= 0 && sinceMsg < 1500) r += 0.45;

  return clamp01(r);
}


/**
 * Вызывай это при событии "user_message".
 * Возвращает "silence" | "soft_ack" | "respond"
 */
export function decideOnUserMessage() {
  const t = (typeof performance !== "undefined" ? performance.now() : Date.now());
  if (t < decision.lockedUntil) return decision.lastDecision;

  const r = computeReadiness(t);

  // Пороги (можно потом тонко настроить)
  let d = "silence";

  // ✅ reflect — между soft_ack и respond
  // “спокойно и заботливо”: сначала уточнить, а не выдавать простыню
  if (r > 0.78) d = "respond";
  else if (r > 0.55) d = "reflect";
  else if (r > 0.40) d = "soft_ack";


  decision.lastDecision = d;
  decision.lockedUntil = t + decision.holdMs;

  // сохраним в state, чтобы HUD/анимации могли реагировать
  if (reiState.decision !== d) setReiState({ decision: d });

  return d;
}
