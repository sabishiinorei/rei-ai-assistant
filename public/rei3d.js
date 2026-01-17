import * as THREE from './libs/three.module.js';
import { GLTFLoader } from './libs/GLTFLoader.js';

import { onReiStateChange, setReiState } from "./reiState.js";

console.log('rei3d.js module loaded');

/* контейнер */
const container = document.getElementById('rei-3d-container');
if (!container) throw new Error('rei-3d-container NOT found');

/* сцена */
const scene = new THREE.Scene();

/* камера */
const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.1,
  100
);
camera.position.set(0, 1.45, 4.75);
camera.lookAt(0, 0.75, 0);

/* рендерер */
const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(container.clientWidth, container.clientHeight);

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

/* свет */
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(2, 4, 3);

dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 15;
dirLight.shadow.camera.left = -6;
dirLight.shadow.camera.right = 6;
dirLight.shadow.camera.top = 6;
dirLight.shadow.camera.bottom = -6;

scene.add(dirLight);
scene.add(dirLight.target);
dirLight.target.position.set(0, 1.0, 0);

/* модель */
let reiModel = null;

// кости головы/шеи
let reiHead = null;
let reiNeck = null;
let headBaseRot = null;
let neckBaseRot = null;

function findBonePrefer(root, preferLists) {
  // preferLists: [ ["neck", "c_p_neck"], ["head", "skull"], ... ]
  const bones = [];
  root.traverse((o) => { if (o.isBone && o.name) bones.push(o); });

  const byName = (keys) => {
    const ks = keys.map(k => String(k).toLowerCase());
    return bones.find(b => {
      const n = b.name.toLowerCase();
      return ks.some(k => n.includes(k));
    }) || null;
  };

  for (const keys of preferLists) {
    const f = byName(keys);
    if (f) return f;
  }
  return null;
}

/* базовая поза */
const basePose = {
  y: -1.22,
  rotY: 0
};

const floorGeo = new THREE.PlaneGeometry(20, 20);
const floorMat = new THREE.ShadowMaterial({ opacity: 0.28 });
let floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

/* idle параметры (дыхание) */
const idle = {
  breathSpeed: 1.0,
  breathPower: 0.022
};

/* =========================
   BONE FACE CONTROLLER (DEF-first + anime blink)
========================= */
const BoneFaceController = {
  bones: {
    lidTopL: [],
    lidTopR: [],
    lidBotL: [],
    lidBotR: [],
    browTopL: [],
    browTopR: [],
    lipTopL: [],
    lipTopR: [],
    jaw: null
  },

  baseRot: new Map(),

  w: { blink: 0, smile: 0, focus: 0, squint: 0 },

  blink: {
    phase: "idle",
    timer: 0,
    nextIn: 2.2,
    pendingDouble: false,
    doubleDelay: 0.12,
    doubleTimer: 0
  },

  cfg: {
    BLINK_TOP_X: -0.55,
    BLINK_BOT_X: +0.35,
    SQUINT_TOP_X: -0.12,
    BROW_FOCUS_X: -0.18,
    LIP_SMILE_Z: 0.10
  },

  _rand(a, b) { return a + Math.random() * (b - a); },

  init(model) {
    this.baseRot.clear();
    this.w = { blink: 0, smile: 0, focus: 0, squint: 0 };
    this.blink = {
      phase: "idle",
      timer: 0,
      nextIn: 2.2,
      pendingDouble: false,
      doubleDelay: 0.12,
      doubleTimer: 0
    };

    this.bones.lidTopL = [];
    this.bones.lidTopR = [];
    this.bones.lidBotL = [];
    this.bones.lidBotR = [];
    this.bones.browTopL = [];
    this.bones.browTopR = [];
    this.bones.lipTopL = [];
    this.bones.lipTopR = [];
    this.bones.jaw = null;

    const norm = (s) => String(s || "").toLowerCase();

    const allBones = [];
    model.traverse((o) => {
      if (!o.isBone || !o.name) return;
      allBones.push(o);
    });

    const defTopL = [], defTopR = [], defBotL = [], defBotR = [];
    const plainTopL = [], plainTopR = [], plainBotL = [], plainBotR = [];

    const isTL = (n) => n.includes("tl");
    const isTR = (n) => n.includes("tr");
    const isBL = (n) => n.includes("bl");
    const isBR = (n) => n.includes("br");

    for (const b of allBones) {
      const n = norm(b.name);

      if (!this.bones.jaw && n.includes("jaw")) this.bones.jaw = b;

      if (n.startsWith("def-lid")) {
        if (isTL(n)) defTopL.push(b);
        else if (isTR(n)) defTopR.push(b);
        else if (isBL(n)) defBotL.push(b);
        else if (isBR(n)) defBotR.push(b);
        continue;
      }

      if (n.startsWith("lid")) {
        if (isTL(n)) plainTopL.push(b);
        else if (isTR(n)) plainTopR.push(b);
        else if (isBL(n)) plainBotL.push(b);
        else if (isBR(n)) plainBotR.push(b);
        continue;
      }

      if (n.includes("brow")) {
        if (isTL(n) || isBL(n) || n.includes("left") || n.endsWith("l")) this.bones.browTopL.push(b);
        if (isTR(n) || isBR(n) || n.includes("right") || n.endsWith("r")) this.bones.browTopR.push(b);
      }

      if (n.includes("lip") || n.includes("mouth") || n.includes("corner") || n.includes("cheek")) {
        if (isTL(n) || isBL(n) || n.includes("left") || n.endsWith("l")) this.bones.lipTopL.push(b);
        if (isTR(n) || isBR(n) || n.includes("right") || n.endsWith("r")) this.bones.lipTopR.push(b);
      }
    }

    const pick = (defArr, plainArr, limit) => {
      const src = defArr.length ? defArr : plainArr;
      return src.slice(0, Math.min(limit, src.length));
    };

    this.bones.lidTopL = pick(defTopL, plainTopL, 8);
    this.bones.lidTopR = pick(defTopR, plainTopR, 8);
    this.bones.lidBotL = pick(defBotL, plainBotL, 8);
    this.bones.lidBotR = pick(defBotR, plainBotR, 8);

    this.bones.browTopL = this.bones.browTopL.slice(0, 10);
    this.bones.browTopR = this.bones.browTopR.slice(0, 10);
    this.bones.lipTopL = this.bones.lipTopL.slice(0, 14);
    this.bones.lipTopR = this.bones.lipTopR.slice(0, 14);

    const remember = (arr) => { for (const b of arr) this.baseRot.set(b.uuid, b.rotation.clone()); };
    remember(this.bones.lidTopL);
    remember(this.bones.lidTopR);
    remember(this.bones.lidBotL);
    remember(this.bones.lidBotR);
    remember(this.bones.browTopL);
    remember(this.bones.browTopR);
    remember(this.bones.lipTopL);
    remember(this.bones.lipTopR);
    if (this.bones.jaw) this.baseRot.set(this.bones.jaw.uuid, this.bones.jaw.rotation.clone());

    console.groupCollapsed("BONE FACE DEBUG (DEF-first)");
    console.log("lidTopL:", this.bones.lidTopL.map(b => b.name));
    console.log("lidTopR:", this.bones.lidTopR.map(b => b.name));
    console.log("lidBotL:", this.bones.lidBotL.map(b => b.name));
    console.log("lidBotR:", this.bones.lidBotR.map(b => b.name));
    console.log("browTopL:", this.bones.browTopL.slice(0, 10).map(b => b.name));
    console.log("browTopR:", this.bones.browTopR.slice(0, 10).map(b => b.name));
    console.log("lipTopL:", this.bones.lipTopL.slice(0, 10).map(b => b.name));
    console.log("lipTopR:", this.bones.lipTopR.slice(0, 10).map(b => b.name));
    console.log("jaw:", this.bones.jaw?.name || "no");
    console.groupEnd();

    window.__REI_FACE__ = this;
  },

  _applyRot(bone, dx, dy, dz) {
    const base = this.baseRot.get(bone.uuid);
    if (!base) return;
    bone.rotation.x = base.x + dx;
    bone.rotation.y = base.y + dy;
    bone.rotation.z = base.z + dz;
  },

  update(delta, reiState) {
    const mode = reiState?.mode || "idle";
    const mood = reiState?.mood || "calm";
    const energy = (typeof reiState?.energy === "number") ? reiState.energy : 0.6;

    let targetSmile = 0.0;
    if (mode === "speaking") targetSmile = 0.28;
    if (mood === "happy") targetSmile = Math.max(targetSmile, 0.42);

    let targetFocus = 0.0;
    if (mode === "thinking") targetFocus = 0.34;
    if (mood === "focused") targetFocus = Math.max(targetFocus, 0.42);

    let targetSquint = 0.0;
    if (targetSmile > 0.20) targetSquint = 0.10 + (targetSmile - 0.20) * 0.22;

    const k = 1 - Math.exp(-12.0 * delta);
    this.w.smile += (targetSmile - this.w.smile) * k;
    this.w.focus += (targetFocus - this.w.focus) * k;
    this.w.squint += (targetSquint - this.w.squint) * k;

    const e = THREE.MathUtils.clamp(energy, 0, 1);
    const tired = 1 - e;

    let minI = 2.2, maxI = 4.6;
    if (mode === "thinking") { minI = 3.8; maxI = 7.0; }
    if (mode === "speaking") { minI = 1.4; maxI = 3.0; }
    if (mode === "listening") { minI = 2.0; maxI = 4.4; }

    minI *= (1.0 - 0.18 * tired);
    maxI *= (1.0 - 0.18 * tired);

    const doubleChance = (mode === "speaking" ? 0.22 : 0.12) + (mood === "happy" ? 0.10 : 0);
    const closeDur = 0.035 + 0.015 * tired;
    const openDur  = 0.050 + 0.020 * tired;

    if (this.blink.phase === "idle") {
      if (this.blink.pendingDouble) {
        this.blink.doubleTimer -= delta;
        if (this.blink.doubleTimer <= 0) {
          this.blink.pendingDouble = false;
          this.blink.phase = "closing";
          this.blink.timer = 0;
        }
      } else {
        this.blink.nextIn -= delta;
        if (this.blink.nextIn <= 0) {
          this.blink.phase = "closing";
          this.blink.timer = 0;
        }
      }
    } else if (this.blink.phase === "closing") {
      this.blink.timer += delta;
      const t = THREE.MathUtils.clamp(this.blink.timer / closeDur, 0, 1);
      this.w.blink = t * t;
      if (t >= 1) { this.blink.phase = "opening"; this.blink.timer = 0; }
    } else if (this.blink.phase === "opening") {
      this.blink.timer += delta;
      const t = THREE.MathUtils.clamp(this.blink.timer / openDur, 0, 1);
      const inv = 1 - t;
      this.w.blink = inv * inv;
      if (t >= 1) {
        this.blink.phase = "idle";
        this.blink.timer = 0;
        this.w.blink = 0;
        if (Math.random() < doubleChance) {
          this.blink.pendingDouble = true;
          this.blink.doubleTimer = this.blink.doubleDelay;
        } else {
          this.blink.pendingDouble = false;
          this.blink.nextIn = this._rand(minI, maxI);
        }
      }
    }

    const blink = THREE.MathUtils.clamp(this.w.blink, 0, 1);
    const smile = THREE.MathUtils.clamp(this.w.smile * (1.0 - 0.35 * this.w.focus), 0, 1);
    const focus = THREE.MathUtils.clamp(this.w.focus, 0, 1);
    const squint = THREE.MathUtils.clamp(this.w.squint, 0, 1);

    const topX = (this.cfg.BLINK_TOP_X * blink) + (this.cfg.SQUINT_TOP_X * squint);
    const botX = (this.cfg.BLINK_BOT_X * blink);

    for (const b of this.bones.lidTopL) this._applyRot(b, topX, 0, 0);
    for (const b of this.bones.lidTopR) this._applyRot(b, topX, 0, 0);
    for (const b of this.bones.lidBotL) this._applyRot(b, botX, 0, 0);
    for (const b of this.bones.lidBotR) this._applyRot(b, botX, 0, 0);

    for (const b of this.bones.browTopL) this._applyRot(b, this.cfg.BROW_FOCUS_X * focus, 0, 0);
    for (const b of this.bones.browTopR) this._applyRot(b, this.cfg.BROW_FOCUS_X * focus, 0, 0);

    for (const b of this.bones.lipTopL) this._applyRot(b, 0, 0, +this.cfg.LIP_SMILE_Z * smile);
    for (const b of this.bones.lipTopR) this._applyRot(b, 0, 0, -this.cfg.LIP_SMILE_Z * smile);
  }
};

/* =========================
   BODY IDLE + RELAX ARMS (stretch-safe)
========================= */
const BodyIdleController = {
  bones: {
    hips: null,
    spine: null,
    chest: null,
    shoulderL: null,
    shoulderR: null,
    foreArmL: null,
    foreArmR: null,
    handL: null,
    handR: null
  },

  baseQ: new Map(),
  w: { pose: 1, amp: 1, speed: 1 },

  cfg: {
    poseBase: 1.0,

    relax: {
      shoulder: { x: -0.20, y: -0.10, z: 0.05 },
      foreArmX: 0.10 // только X (bend)
    },

    idle: {
      breathX: 0.022,
      swayZ: 0.014,
      swayY: 0.008,
      shoulderZ: 0.010
    },

    modes: {
      idle:      { amp: 1.00, speed: 1.00, pose: 1.00 },
      listening: { amp: 0.85, speed: 0.95, pose: 1.03 },
      thinking:  { amp: 0.55, speed: 0.75, pose: 1.07 },
      speaking:  { amp: 1.15, speed: 1.10, pose: 0.98 }
    },

    smooth: 6.0
  },

  init(model) {
    model.updateMatrixWorld(true);

    const norm = (s) => String(s || "").toLowerCase();
    const bones = [];
    model.traverse(o => { if (o.isBone && o.name) bones.push(o); });

    const pickOne = (keys) => bones.find(b => keys.some(k => norm(b.name).includes(k))) || null;
    const pickAll = (keys) => bones.filter(b => keys.some(k => norm(b.name).includes(k)));

    const pickLRByX = (cands) => {
      if (!cands.length) return { L: null, R: null };
      const withX = cands.map(b => {
        const p = new THREE.Vector3();
        b.getWorldPosition(p);
        return { b, x: p.x };
      }).sort((a, b) => a.x - b.x);

      if (withX.length === 1) return { L: null, R: withX[0].b };
      return { L: withX[0].b, R: withX[withX.length - 1].b };
    };

    // core
    this.bones.hips  = pickOne(["hips", "pelvis", "rootjoint", "root"]);
    this.bones.spine = pickOne(["c_p_spine", "spine_00", "spine00", "spine1", "spine"]);
    this.bones.chest = pickOne(["upperchest", "chest", "spine2", "spine_02", "spine02"]);

    // shoulders
    const slr = pickLRByX(pickAll(["shoulder"]));
    this.bones.shoulderL = slr.L;
    this.bones.shoulderR = slr.R;

    // hands (name-first)
    const hands = pickAll(["hand"]);
    this.bones.handL = hands.find(b => /(^|_)handl(_|$)/i.test(b.name) || /left.*hand/i.test(b.name)) || null;
    this.bones.handR = hands.find(b => /(^|_)handr(_|$)/i.test(b.name) || /right.*hand/i.test(b.name)) || null;
    if (!this.bones.handL || !this.bones.handR) {
      const hlr = pickLRByX(hands);
      this.bones.handL = this.bones.handL || hlr.L;
      this.bones.handR = this.bones.handR || hlr.R;
    }

    // forearms: берём родителей кистей (stretch-safe)
    this.bones.foreArmL = this.bones.handL?.parent?.isBone ? this.bones.handL.parent : null;
    this.bones.foreArmR = this.bones.handR?.parent?.isBone ? this.bones.handR.parent : null;

    // base quats
    this.baseQ.clear();
    Object.values(this.bones).forEach(b => {
      if (b) this.baseQ.set(b.uuid, b.quaternion.clone());
    });

    console.groupCollapsed("REI BODY RIG (stable)");
    Object.entries(this.bones).forEach(([k, v]) => console.log(`${k}:`, v?.name || "no"));
    console.groupEnd();

    window.__REI_BODY__ = this;
  },

  _baseQuat(b) { return b ? this.baseQ.get(b.uuid) : null; },

  _applyDeltaEuler(bone, dx, dy, dz, alpha) {
    if (!bone) return;
    const base = this._baseQuat(bone);
    if (!base) return;

    const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(dx, dy, dz, "XYZ"));
    const target = base.clone().multiply(dq);
    bone.quaternion.slerp(target, THREE.MathUtils.clamp(alpha, 0, 1));
  },

  update(delta, reiState, phase) {
    const mode = reiState?.mode || "idle";
    const energy = (typeof reiState?.energy === "number") ? reiState.energy : 0.6;

    const prof = this.cfg.modes[mode] || this.cfg.modes.idle;

    const e = THREE.MathUtils.clamp(energy, 0, 1);
    const ampT = prof.amp * (0.60 + 0.40 * e);
    const spdT = prof.speed * (0.75 + 0.25 * e);
    const poseT = prof.pose;

    const k = 1 - Math.exp(-this.cfg.smooth * (delta || 1 / 60));
    this.w.amp += (ampT - this.w.amp) * k;
    this.w.speed += (spdT - this.w.speed) * k;
    this.w.pose += (poseT - this.w.pose) * k;

    const poseAlpha = this.cfg.poseBase * this.w.pose;

    // RESET -> база каждый кадр (без накоплений = без дрожи)
    for (const b of Object.values(this.bones)) {
      if (!b) continue;
      const base = this.baseQ.get(b.uuid);
      if (base) b.quaternion.copy(base);
    }

    const t = (phase || 0) * this.w.speed;
    const amp = this.w.amp;

    // ---------- RELAX (очень аккуратно) ----------
    const r = this.cfg.relax;
    this._applyDeltaEuler(this.bones.shoulderL, r.shoulder.x, r.shoulder.y, +r.shoulder.z, poseAlpha);
    this._applyDeltaEuler(this.bones.shoulderR, r.shoulder.x, r.shoulder.y, -r.shoulder.z, poseAlpha);

    // локоть — только X bend, чтобы не ломать запястья
    this._applyDeltaEuler(this.bones.foreArmL, r.foreArmX, 0, 0, poseAlpha);
    this._applyDeltaEuler(this.bones.foreArmR, r.foreArmX, 0, 0, poseAlpha);

    // ---------- BODY IDLE ----------
    const breath = Math.sin(t * 1.15);
    const swayA = Math.sin(t * 0.55 + 1.3);
    const swayB = Math.sin(t * 0.85 + 0.2);

    const ic = this.cfg.idle;

    this._applyDeltaEuler(this.bones.chest, ic.breathX * breath * amp, 0, 0, 1.0);
    this._applyDeltaEuler(this.bones.spine, ic.breathX * breath * amp * 0.55, 0, 0, 1.0);

    this._applyDeltaEuler(this.bones.chest, 0, ic.swayY * swayA * amp, ic.swayZ * swayB * amp, 1.0);
    this._applyDeltaEuler(this.bones.spine, 0, ic.swayY * swayA * amp * 0.55, ic.swayZ * swayB * amp * 0.55, 1.0);

    const shZ = ic.shoulderZ * Math.sin(t * 1.6 + 2.2) * amp;
    this._applyDeltaEuler(this.bones.shoulderL, 0, 0, +shZ, 1.0);
    this._applyDeltaEuler(this.bones.shoulderR, 0, 0, -shZ, 1.0);
  }
};

/* =========================
   Мышь
========================= */
let pointer = { x: 0, y: 0, has: false };

function updatePointerFromEvent(e) {
  const rect = container.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const dx = (e.clientX - cx) / (rect.width / 2);
  const dy = (e.clientY - cy) / (rect.height / 2);

  pointer.x = THREE.MathUtils.clamp(dx, -1, 1);
  pointer.y = THREE.MathUtils.clamp(dy, -1, 1);
  pointer.has = true;
}
window.addEventListener("mousemove", updatePointerFromEvent, { passive: true });

/* часы */
const clock = new THREE.Clock();

/* yaw/pitch */
const YAW_SIGN = -1;
const PITCH_SIGN = -1;

/* контроллер поведения */
const ReiController = {
  state: {
    mode: "idle",
    mood: "calm",
    energy: 0.6,
    energyV: 0.6,
    focus: "chat",
    idlePhase: Math.random() * Math.PI * 2,

    lookYaw: 0,
    lookPitch: 0,

    // сглаженные параметры (чтобы mood не давал “скачок”)
    lookSmoothV: 26,
    maxYawV: 0.24,
    maxPitchV: 0.14
  },

  update(delta) {
    this.state.idlePhase += delta;
    this._dt = delta || (1 / 60);

    // smooth energy (чтобы тело не “дёргалось” если energy скачет)
    const dt = this._dt;
    const kE = 1 - Math.exp(-4.0 * dt);
    this.state.energyV += (this.state.energy - this.state.energyV) * kE;
  },

  apply(model) {
    const mode = this.state.mode;
    const mood = this.state.mood;
    let focus = this.state.focus;

    const active = document.activeElement;
    if (active && active.id === "input") focus = "input";

    const idlePhase = this.state.idlePhase;
    const e = THREE.MathUtils.clamp(this.state.energyV, 0, 1);

    // глобальная “живость” — ТОЛЬКО от энергии (не от mood)
    model.position.y = basePose.y + Math.sin(idlePhase * idle.breathSpeed) * idle.breathPower * e;

    const sway = 0.020 * (0.35 + 0.65 * e);
    const swayY = Math.sin(idlePhase * 0.7) * sway;
    const swayX = Math.sin(idlePhase * 0.5 + 1.2) * sway * 0.35;
    const hipShift = Math.sin(idlePhase * 0.6) * 0.010;

    model.rotation.y = basePose.rotY + swayY;
    model.rotation.x = swayX;
    model.position.x = hipShift;

    const DEADZONE = 0.12;

    // target params (mood влияет, но параметры будут сглажены -> без “рывка”)
    let LOOK_SMOOTH_T = 26;
    let MAX_YAW_T = 0.16;
    let MAX_PITCH_T = 0.09;

    if (mood === "happy") {
      LOOK_SMOOTH_T = 30;
      MAX_YAW_T = 0.26;
      MAX_PITCH_T = 0.15;
    } else if (mood === "caring") {
      LOOK_SMOOTH_T = 22;
      MAX_YAW_T = 0.22;
      MAX_PITCH_T = 0.13;
    } else if (mood === "focused") {
      LOOK_SMOOTH_T = 32;
      MAX_YAW_T = 0.20;
      MAX_PITCH_T = 0.12;
    }

    // mode tweaks (мягко)
    if (mode === "thinking") {
      MAX_YAW_T *= 0.92;
      MAX_PITCH_T *= 0.95;
    } else if (mode === "speaking") {
      MAX_YAW_T *= 1.05;
      MAX_PITCH_T *= 1.05;
    }

    MAX_YAW_T *= (0.65 + 0.35 * e);
    MAX_PITCH_T *= (0.65 + 0.35 * e);

    const dt = this._dt || (1 / 60);

    // сглаживаем параметры взгляда медленнее (чтобы mood не “дёргал” кости)
    const km = 1 - Math.exp(-3.5 * dt);
    this.state.lookSmoothV += (LOOK_SMOOTH_T - this.state.lookSmoothV) * km;
    this.state.maxYawV     += (MAX_YAW_T - this.state.maxYawV) * km;
    this.state.maxPitchV   += (MAX_PITCH_T - this.state.maxPitchV) * km;

    const LOOK_SMOOTH = this.state.lookSmoothV;
    const MAX_YAW = this.state.maxYawV;
    const MAX_PITCH = this.state.maxPitchV;

    // лимиты
    const HEAD_YAW_LIMIT = Math.min(0.26, MAX_YAW * 1.10);
    const HEAD_PITCH_LIMIT = Math.min(0.16, MAX_PITCH * 1.10);

    const NECK_YAW_LIMIT = Math.min(0.14, MAX_YAW * 0.60);
    const NECK_PITCH_LIMIT = Math.min(0.10, MAX_PITCH * 0.60);

    let targetYaw = 0;
    let targetPitch = 0;

    if (focus === "input") {
      targetYaw = 0.04 * YAW_SIGN;
      targetPitch = 0.03 * PITCH_SIGN;
    } else if (focus === "cursor") {
      let dx0 = pointer.has ? pointer.x : 0;
      let dy0 = pointer.has ? pointer.y : 0;

      if (Math.abs(dx0) < DEADZONE) dx0 = 0;
      if (Math.abs(dy0) < DEADZONE) dy0 = 0;

      const nonLinear = (v) => Math.tanh(v * 1.25);
      const dx = nonLinear(dx0);
      const dy = nonLinear(dy0);

      targetYaw = (dx * MAX_YAW) * YAW_SIGN;
      targetPitch = (dy * MAX_PITCH) * PITCH_SIGN;
    } else {
      targetYaw = 0.05 * YAW_SIGN;
      targetPitch = 0.02 * PITCH_SIGN;
    }

    // микро-качания
    // const micro = 0.002 * (0.35 + 0.65 * e);
    // targetYaw += Math.sin(idlePhase * 1.4) * micro;
    // targetPitch += Math.sin(idlePhase * 1.8) * micro * 0.4;

    targetYaw = THREE.MathUtils.clamp(targetYaw, -MAX_YAW, MAX_YAW);
    targetPitch = THREE.MathUtils.clamp(targetPitch, -MAX_PITCH, MAX_PITCH);

    // основное сглаживание поворота головы/шеи
    const k = 1 - Math.exp(-LOOK_SMOOTH * dt);
    this.state.lookYaw += (targetYaw - this.state.lookYaw) * k;
    this.state.lookPitch += (targetPitch - this.state.lookPitch) * k;

    const headYaw = THREE.MathUtils.clamp(this.state.lookYaw, -HEAD_YAW_LIMIT, HEAD_YAW_LIMIT);
    const headPitch = THREE.MathUtils.clamp(this.state.lookPitch, -HEAD_PITCH_LIMIT, HEAD_PITCH_LIMIT);

    const neckYaw = THREE.MathUtils.clamp(this.state.lookYaw * 0.55, -NECK_YAW_LIMIT, NECK_YAW_LIMIT);
    const neckPitch = THREE.MathUtils.clamp(this.state.lookPitch * 0.45, -NECK_PITCH_LIMIT, NECK_PITCH_LIMIT);

    if (reiNeck && neckBaseRot) {
      reiNeck.rotation.y = neckBaseRot.y + neckYaw;
      reiNeck.rotation.x = neckBaseRot.x + neckPitch;
    }

    if (reiHead && headBaseRot) {
      reiHead.rotation.y = headBaseRot.y + headYaw;
      reiHead.rotation.x = headBaseRot.x + headPitch;
    }
  }
};

/* подписка 3D на reiState */
onReiStateChange((s) => {
  ReiController.state.mode = s.mode || "idle";
  ReiController.state.mood = s.mood || "calm";
  ReiController.state.energy = (typeof s.energy === "number") ? s.energy : 0.6;
  ReiController.state.focus = s.focus || "chat";
});

/* CommandBus */
const CommandBus = {
  listeners: {},
  on(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  },
  emit(type, payload) {
    this.listeners[type]?.forEach(fn => fn(payload));
  }
};

CommandBus.on('command', ({ text }) => {
  const t = (text || "").toLowerCase();

  if (t.includes('успокой')) {
    setReiState({ mood: 'calm', mode: 'idle', energy: 0.25, focus: "chat" });
  }

  if (t.includes('улыб') || t.includes('рад')) {
    setReiState({ mood: 'happy', mode: 'listening', energy: 0.75, focus: "chat" });
  }

  if (t.includes('стоп')) {
    setReiState({ energy: 0.0 });
  }
});

window.CommandBus = CommandBus;

/* загрузка */
const loader = new GLTFLoader();
loader.load('./models/rei.glb', (gltf) => {
  reiModel = gltf.scene;

  reiModel.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });

  reiModel.scale.setScalar(2);
  reiModel.position.set(0, basePose.y, 0);
  reiModel.rotation.set(0, basePose.rotY, 0);
  scene.add(reiModel);

  // --- AUTO FLOOR + AUTO SHADOW FIT ---
  {
    const box = new THREE.Box3().setFromObject(reiModel);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const floorY = box.min.y - 0.01;
    floor.position.y = floorY;

    basePose.y += (floorY - box.min.y);
    reiModel.position.y = basePose.y;

    const box2 = new THREE.Box3().setFromObject(reiModel);
    box2.getCenter(center);
    box2.getSize(size);

    dirLight.target.position.copy(center);

    const r = Math.max(size.x, size.z) * 0.9;
    dirLight.shadow.camera.left = -r;
    dirLight.shadow.camera.right = r;
    dirLight.shadow.camera.top = r;
    dirLight.shadow.camera.bottom = -r;

    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 30;

    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.bias = -0.00025;
    dirLight.shadow.normalBias = 0.02;
  }

  // IMPORTANT: neck ищем ТОЛЬКО по “neck”, чтобы не взять spine2 и не трясти грудь
  reiNeck = findBonePrefer(reiModel, [
    ["c_p_neck", "neck"],
    ["spine2", "spine_02", "upperchest", "chest"] // запасной
  ]);

  reiHead = findBonePrefer(reiModel, [
    ["head_", "head", "skull"],
    ["face"]
  ]);

  if (reiHead) headBaseRot = reiHead.rotation.clone();
  if (reiNeck) neckBaseRot = reiNeck.rotation.clone();

  console.log('REI MODEL LOADED');
  console.log('FOUND HEAD:', reiHead?.name || "no");
  console.log('FOUND NECK:', reiNeck?.name || "no");

  BoneFaceController.init(reiModel);
  BodyIdleController.init(reiModel);

}, undefined, (err) => {
  console.error("Failed to load rei.glb:", err);
});

/* анимация */
function animate() {
  requestAnimationFrame(animate);

  // clamp delta -> нет телепортов при лаг-спайках/переключениях вкладки
  const delta = Math.min(clock.getDelta(), 1 / 30);

  if (reiModel) {
    ReiController.update(delta);
    ReiController.apply(reiModel);

    BodyIdleController.update(delta, ReiController.state, ReiController.state.idlePhase);
    BoneFaceController.update(delta, ReiController.state);
  }

  renderer.render(scene, camera);
}
animate();

/* resize */
window.addEventListener('resize', () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});
