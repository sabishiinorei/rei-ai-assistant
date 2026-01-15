// ЯДРО РЕЙ (reiState)

export const reiState = {
  mode: "idle",        // idle | thinking | speaking | listening
  mood: "calm",        // calm | happy | caring | focused
  energy: 0.6,         // 0..1
  focus: "chat"        // chat | input | cursor
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
