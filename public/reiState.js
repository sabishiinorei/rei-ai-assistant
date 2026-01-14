// reiState.js — ядро поведения Rei

const state = {
  mode: "idle",        // idle | thinking | speaking | listening
  mood: "calm",        // calm | happy | caring | focused
  energy: 0.8          // 0..1
};

const listeners = [];

// ===== УВЕДОМЛЕНИЕ О СМЕНЕ СОСТОЯНИЯ =====
function notify() {
  console.log("[ReiState]", { ...state });
  listeners.forEach(fn => fn({ ...state }));
}

// ===== ПУБЛИЧНЫЙ SET =====
function setReiState(patch = {}) {
  Object.assign(state, patch);
  notify();
}

// ===== ПОДПИСКА =====
function onReiStateChange(fn) {
  listeners.push(fn);
  fn({ ...state });
}

// =================================================
// 🧠 ПОВЕДЕНИЕ / АВТОМАТИКА
// =================================================

// ⏳ СПАД ЭМОЦИЙ
let moodTimer = null;

function scheduleMoodReset() {
  clearTimeout(moodTimer);

  // caring держится дольше
  const timeout =
    state.mood === "caring" ? 60000 :
    state.mood === "happy" ? 40000 :
    state.mood === "focused" ? 25000 :
    0;

  if (!timeout) return;

  moodTimer = setTimeout(() => {
    setReiState({ mood: "calm" });
  }, timeout);
}

// ⏳ СПАД РЕЖИМОВ
let modeTimer = null;

function scheduleModeFlow() {
  clearTimeout(modeTimer);

  if (state.mode === "thinking") {
    modeTimer = setTimeout(() => {
      setReiState({ mode: "speaking" });
    }, 1200);
  }

  if (state.mode === "speaking") {
    modeTimer = setTimeout(() => {
      setReiState({ mode: "listening" });
    }, 1500);
  }

  if (state.mode === "listening") {
    modeTimer = setTimeout(() => {
      setReiState({ mode: "idle" });
    }, 3000);
  }
}

// ===== АВТО-РЕАКЦИИ НА ИЗМЕНЕНИЯ =====
onReiStateChange((s) => {
  scheduleMoodReset();
  scheduleModeFlow();
});

// ===== ПУБЛИЧНЫЙ EXPORT =====
export {
  state as reiState,
  setReiState,
  onReiStateChange
};
