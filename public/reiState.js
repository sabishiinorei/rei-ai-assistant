// reiState

const state = {
  mode: "idle",     // idle | thinking | speaking | listening
  mood: "calm",     // calm | happy | caring | focused
  energy: 1         // 0..1
};

const listeners = [];

export function getReiState() {
  return { ...state };
}

export function setReiState(patch) {
  Object.assign(state, patch);

  console.log("[ReiState]", state);

  listeners.forEach(fn => fn(getReiState()));
}

export function onReiStateChange(fn) {
  listeners.push(fn);
}

// чтобы было видно в консоли браузера
window.reiState = state;
window.setReiState = setReiState;

// поведение мини-окошки

let idleTimer = null;

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);

  // через 5 сек — idle
  idleTimer = setTimeout(() => {
    setReiState({ mode: "idle", mood: "calm" });

    // через 20 сек — спокойствие
    idleTimer = setTimeout(() => {
      setReiState({ mode: "idle", mood: "peaceful" });

      // через 60 сек — сонливость
      idleTimer = setTimeout(() => {
        setReiState({ mode: "idle", mood: "sleepy" });
      }, 40000);

    }, 15000);

  }, 5000);
}

// любые действия пользователя сбрасывают idle
["click", "keydown", "mousemove"].forEach(event => {
  document.addEventListener(event, resetIdleTimer);
});

// запуск при старте
resetIdleTimer();
