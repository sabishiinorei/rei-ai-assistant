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
// чтобы тень шла именно на Рей (а не "куда-то")
scene.add(dirLight.target);
dirLight.target.position.set(0, 1.0, 0);

/* модель */
let reiModel = null;

// кости головы/шеи
let reiHead = null;
let reiNeck = null;
let headBaseRot = null;
let neckBaseRot = null;

function findBoneByName(root, keywords) {
  let found = null;
  root.traverse((obj) => {
    if (found) return;
    if (!obj.name) return;
    const n = obj.name.toLowerCase();
    if (keywords.some(k => n.includes(k))) found = obj;
  });
  return found;
}

/* базовая поза */
const basePose = {
  y: -1.22,
  rotY: 0
};

const floorGeo = new THREE.PlaneGeometry(20, 20);
const floorMat = new THREE.ShadowMaterial({ opacity: 0.28 }); // чуть мягче, красивее
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

  // Настройки “аниме”
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

    // reset
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

    // --- приоритет: DEF-lid** (они деформируют сетку) ---
    const defTopL = [];
    const defTopR = [];
    const defBotL = [];
    const defBotR = [];

    const plainTopL = [];
    const plainTopR = [];
    const plainBotL = [];
    const plainBotR = [];

    const isTL = (n) => n.includes("tl");
    const isTR = (n) => n.includes("tr");
    const isBL = (n) => n.includes("bl");
    const isBR = (n) => n.includes("br");

    for (const b of allBones) {
      const n = norm(b.name);

      if (!this.bones.jaw && n.includes("jaw")) this.bones.jaw = b;

      // DEF-lid...
      if (n.startsWith("def-lid")) {
        if (isTL(n)) defTopL.push(b);
        else if (isTR(n)) defTopR.push(b);
        else if (isBL(n)) defBotL.push(b);
        else if (isBR(n)) defBotR.push(b);
        continue;
      }

      // plain lid... (fallback)
      if (n.startsWith("lid")) {
        if (isTL(n)) plainTopL.push(b);
        else if (isTR(n)) plainTopR.push(b);
        else if (isBL(n)) plainBotL.push(b);
        else if (isBR(n)) plainBotR.push(b);
        continue;
      }

      // brows
      if (n.includes("brow")) {
        if (isTL(n) || isBL(n) || n.includes("left") || n.endsWith("l")) this.bones.browTopL.push(b);
        if (isTR(n) || isBR(n) || n.includes("right") || n.endsWith("r")) this.bones.browTopR.push(b);
      }

      // lips/cheeks (улыбка)
      if (n.includes("lip") || n.includes("mouth") || n.includes("corner") || n.includes("cheek")) {
        if (isTL(n) || isBL(n) || n.includes("left") || n.endsWith("l")) this.bones.lipTopL.push(b);
        if (isTR(n) || isBR(n) || n.includes("right") || n.endsWith("r")) this.bones.lipTopR.push(b);
      }
    }

    // выбор: DEF если есть, иначе plain
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

    const remember = (arr) => {
      for (const b of arr) this.baseRot.set(b.uuid, b.rotation.clone());
    };
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
   BODY IDLE + RELAX ARMS (auto-bones, reiState-aware)
   (вариант 1: безопасно для твоего stretch-рига)
========================= */
const BodyIdleController = {
  bones: {
    hips: null,
    spine: null,
    chest: null,
    shoulderL: null,
    shoulderR: null,
    upperArmL: null,
    upperArmR: null,
    foreArmL: null,
    foreArmR: null,
    handL: null,
    handR: null
  },

  baseQ: new Map(), // uuid -> Quaternion
  w: { pose: 0, amp: 1, speed: 1 },

  cfg: {
    poseBase: 1.0,

    // ВАРИАНТ 1: плечи + локоть, без upperArm/кистей
    relax: {
      shoulder: { x: -0.22, y: -0.14, z: 0.05 },
      upperArm: { x: 0.00, y: 0.00, z: 0.00 }, // не используем
      foreArm:  { x: 0.12, y: 0.00, z: 0.00 }, // bend only
      hand:     { x: 0.00, y: 0.00, z: 0.00 }  // не используем
    },

    // ЖИВОЕ ТЕЛО: дыхание + sway + перенос веса hips
    idle: {
      breathX: 0.028,
      swayZ: 0.018,
      swayY: 0.010,
      hipsY: 0.016,
      hipsZ: 0.010,
      shoulderZ: 0.012
    },

    modes: {
      idle:      { amp: 1.00, speed: 1.00, pose: 1.00 },
      listening: { amp: 0.80, speed: 0.95, pose: 1.05 },
      thinking:  { amp: 0.45, speed: 0.70, pose: 1.10 },
      speaking:  { amp: 1.20, speed: 1.15, pose: 0.98 }
    },

    smooth: 10.0
  },

  init(model) {
    model.updateMatrixWorld(true);

    const isHelper = (name) => {
      const n = String(name || "").toLowerCase();
      return (
        n.includes("twist") ||
        n.includes("track") ||
        n.includes("pole")  ||
        n.includes("ik")    ||
        n.includes("target")||
        n.includes("refr")  ||
        n.includes("traj")
      );
    };

    const preferDeform = (bone, maxUp = 8) => {
      let b = bone;
      for (let i = 0; i < maxUp && b; i++) {
        if (!b?.isBone) break;
        if (!isHelper(b.name)) return b;
        b = b.parent;
      }
      return bone;
    };

    const bones = [];
    model.traverse(o => { if (o.isBone) bones.push(o); });

    const norm = (s) => String(s || "").toLowerCase();

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

    const pickOne = (keys) => bones.find(b => keys.some(k => norm(b.name).includes(k))) || null;
    const pickAll = (keys) => bones.filter(b => keys.some(k => norm(b.name).includes(k)));

    // core
    this.bones.hips  = pickOne(["hips", "pelvis", "rootjoint", "root"]);
    this.bones.spine = pickOne(["spine", "c_p_spine", "spine_00", "spine00", "spine1"]);
    this.bones.chest = pickOne(["chest", "spine2", "upperchest", "spine_02", "spine02"]);

    // shoulders
    const shoulders = pickAll(["shoulder"]);
    const slr = pickLRByX(shoulders);
    this.bones.shoulderL = slr.L;
    this.bones.shoulderR = slr.R;

    // hands (name-first, fallback)
    const hands = pickAll(["hand"]);
    const handByNameL = hands.find(b => /(^|_)handl(_|$)/i.test(b.name) || /left.*hand/i.test(b.name));
    const handByNameR = hands.find(b => /(^|_)handr(_|$)/i.test(b.name) || /right.*hand/i.test(b.name));

    if (handByNameL || handByNameR) {
      this.bones.handL = handByNameL || null;
      this.bones.handR = handByNameR || null;
    } else {
      const hlr = pickLRByX(hands);
      this.bones.handL = hlr.L;
      this.bones.handR = hlr.R;
    }

    // prefer deform bones
    this.bones.shoulderL = preferDeform(this.bones.shoulderL);
    this.bones.shoulderR = preferDeform(this.bones.shoulderR);
    this.bones.handL = preferDeform(this.bones.handL);
    this.bones.handR = preferDeform(this.bones.handR);

    // resolve forearm/upperarm from hand chain (stretch-safe)
    const upNonHelper = (b, steps = 10) => {
      let x = b;
      for (let i = 0; i < steps && x; i++) {
        if (x.isBone && !isHelper(x.name)) return x;
        x = x.parent;
      }
      return b || null;
    };

    const resolveArmFromHand = (hand) => {
      if (!hand) return { fore: null, upper: null };

      let fore = upNonHelper(hand.parent);
      let upper = upNonHelper(fore?.parent || null);

      if (upper === fore) upper = null;
      if (fore === hand) fore = null;

      return { fore, upper };
    };

    const L = resolveArmFromHand(this.bones.handL);
    const R = resolveArmFromHand(this.bones.handR);

    this.bones.foreArmL = preferDeform(L.fore);
    this.bones.foreArmR = preferDeform(R.fore);

    // upperArm на этом риге часто helper/общий контроллер — оставляем, но НЕ используем в update
    this.bones.upperArmL = preferDeform(L.upper);
    this.bones.upperArmR = preferDeform(R.upper);

    // финальная защита от дублей
    if (this.bones.upperArmL === this.bones.foreArmL) this.bones.upperArmL = null;
    if (this.bones.upperArmR === this.bones.foreArmR) this.bones.upperArmR = null;

    this.baseQ.clear();
    Object.values(this.bones).forEach(b => {
      if (b) this.baseQ.set(b.uuid, b.quaternion.clone());
    });

    console.groupCollapsed("REI BODY RIG (auto v2)");
    Object.entries(this.bones).forEach(([k, v]) => console.log(`${k}:`, v?.name || "no"));
    console.groupEnd();

    window.__REI_BODY__ = this;
  },

  _baseQuat(b) {
    return b ? this.baseQ.get(b.uuid) : null;
  },

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

    // ---------- helpers: accumulate deltas per bone ----------
    const acc = new Map(); // uuid -> {x,y,z,bone}

    const add = (bone, dx, dy, dz) => {
      if (!bone) return;
      const key = bone.uuid;
      const v = acc.get(key) || { x: 0, y: 0, z: 0, bone };
      v.x += dx; v.y += dy; v.z += dz;
      acc.set(key, v);
    };

    const applyAll = (alpha = 1.0) => {
      for (const v of acc.values()) {
        this._applyDeltaEuler(v.bone, v.x, v.y, v.z, alpha);
      }
    };

    // ---------- RELAX POSE (вариант 1: плечи + локоть) ----------
    const r = this.cfg.relax;

    add(this.bones.shoulderL, r.shoulder.x, r.shoulder.y, +r.shoulder.z);
    add(this.bones.shoulderR, r.shoulder.x, r.shoulder.y, -r.shoulder.z);

    // foreArm — только bend (X). Никаких y/z.
    add(this.bones.foreArmL, r.foreArm.x, 0.0, 0.0);
    add(this.bones.foreArmR, r.foreArm.x, 0.0, 0.0);

    // применяем relax отдельно (зависит от poseAlpha)
    applyAll(poseAlpha);

    // ---------- BODY IDLE (живость тела) ----------
    acc.clear();

    const t = (phase || 0) * this.w.speed;
    const breath = Math.sin(t * 1.15);
    const swayA = Math.sin(t * 0.55 + 1.3);
    const swayB = Math.sin(t * 0.85 + 0.2);

    const idleCfg = this.cfg.idle;
    const amp = this.w.amp;

    // chest/spine breathing + sway
    add(this.bones.chest, idleCfg.breathX * breath * amp, 0, 0);
    add(this.bones.spine, idleCfg.breathX * breath * amp * 0.55, 0, 0);

    add(this.bones.chest, 0, idleCfg.swayY * swayA * amp, idleCfg.swayZ * swayB * amp);
    add(this.bones.spine, 0, idleCfg.swayY * swayA * amp * 0.55, idleCfg.swayZ * swayB * amp * 0.55);

    // hips weight shift (перенос веса)
    const hipA = Math.sin(t * 0.55 + 0.8);
    const hipB = Math.sin(t * 0.85 + 2.0);
    add(this.bones.hips, 0, idleCfg.hipsY * hipA * amp, idleCfg.hipsZ * hipB * amp);

    // micro shoulder float
    const shZ = idleCfg.shoulderZ * Math.sin(t * 1.6 + 2.2) * amp;
    add(this.bones.shoulderL, 0, 0, +shZ);
    add(this.bones.shoulderR, 0, 0, -shZ);

    // применяем body-idle отдельно (он уже масштабируется amp-ом по режимам)
    applyAll(1.0);
  }
};

/* =========================
   Мышь (нормализация по контейнеру)
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
    focus: "chat",
    idlePhase: Math.random() * Math.PI * 2,

    lookYaw: 0,
    lookPitch: 0
  },

  update(delta) {
    this.state.idlePhase += delta;
    this._dt = delta || (1 / 60);
  },

  apply(model) {
    const { mode, mood, energy, idlePhase } = this.state;
    let focus = this.state.focus;

    const active = document.activeElement;
    if (active && active.id === "input") focus = "input";

    const e = THREE.MathUtils.clamp(energy, 0, 1);

    // дыхание
    model.position.y =
      basePose.y + Math.sin(idlePhase * idle.breathSpeed) * idle.breathPower * e;

    // --- idle sway (перенос веса, очень мягко) ---
    const sway = 0.028 * (0.35 + 0.65 * e);
    const swayY = Math.sin(idlePhase * 0.7) * sway;
    const swayX = Math.sin(idlePhase * 0.5 + 1.2) * sway * 0.35;

    const hipShift = Math.sin(idlePhase * 0.6) * 0.015;

    model.rotation.y = basePose.rotY + swayY;
    model.rotation.x = swayX;
    model.position.x = hipShift;

    const DEADZONE = 0.05;

    let LOOK_SMOOTH = 26;
    let MAX_YAW = 0.24;
    let MAX_PITCH = 0.14;

    if (mood === "happy") {
      LOOK_SMOOTH = 32;
      MAX_YAW = 0.28;
      MAX_PITCH = 0.16;
    } else if (mood === "caring") {
      LOOK_SMOOTH = 20;
      MAX_YAW = 0.22;
      MAX_PITCH = 0.13;
    } else if (mood === "focused") {
      LOOK_SMOOTH = 34;
      MAX_YAW = 0.20;
      MAX_PITCH = 0.12;
    }

    if (mode === "thinking") {
      MAX_YAW *= 0.9;
      MAX_PITCH *= 0.95;
    } else if (mode === "speaking") {
      MAX_YAW *= 1.05;
      MAX_PITCH *= 1.05;
    }

    MAX_YAW *= (0.65 + 0.35 * e);
    MAX_PITCH *= (0.65 + 0.35 * e);

    const HEAD_YAW_LIMIT = Math.min(0.30, MAX_YAW * 1.15);
    const HEAD_PITCH_LIMIT = Math.min(0.18, MAX_PITCH * 1.15);

    const NECK_YAW_LIMIT = Math.min(0.16, MAX_YAW * 0.65);
    const NECK_PITCH_LIMIT = Math.min(0.11, MAX_PITCH * 0.65);

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
      targetYaw = 0.06 * YAW_SIGN;
      targetPitch = 0.02 * PITCH_SIGN;
    }

    // микро-качания
    const micro = 0.010 * (0.35 + 0.65 * e);
    const microYaw = Math.sin(idlePhase * 1.6) * micro;
    const microPitch = Math.sin(idlePhase * 2.1) * micro * 0.7;

    targetYaw += microYaw * (mode === "speaking" ? 1.2 : 0.8);
    targetPitch += microPitch;

    targetYaw = THREE.MathUtils.clamp(targetYaw, -MAX_YAW, MAX_YAW);
    targetPitch = THREE.MathUtils.clamp(targetPitch, -MAX_PITCH, MAX_PITCH);

    const dt = this._dt || (1 / 60);
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

  reiHead = findBoneByName(reiModel, ["head", "skull", "голов", "head_"]);
  reiNeck = findBoneByName(reiModel, ["neck", "spine2", "шея", "c_p_neck"]);

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

  const delta = clock.getDelta();

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
