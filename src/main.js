import * as THREE from "three";

import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { HALL, buildHall, loadMark } from "./hall.js";
import { buildPaint } from "./paint.js";
import { blockHost, connectVoice, loadHost } from "./host.js";
import { createTalk, VOICE_ENABLED } from "./voice.js";
import { groundsSnapshot, updateGrounds } from "./grounds.js";
import { footAt, levelSolids, standAt } from "./stairs.js";

const params = new URLSearchParams(location.search);
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || params.has("still");
const SPIN = reduced ? 0 : (Math.PI * 2) / 12;

const canvas = document.getElementById("view");
const hint = document.getElementById("hint");
const stickEl = document.getElementById("stick");
const knob = stickEl.querySelector("i");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

function officeEnvironment() {
  const env = new THREE.Scene();
  const geo = new THREE.SphereGeometry(6, 24, 16);
  const pos = geo.attributes.position;
  const top = new THREE.Color(0xb7d0ea);
  const horizon = new THREE.Color(0xf7f4ef);
  const ground = new THREE.Color(0xd9d3c8);
  const tmp = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 6;
    tmp.copy(horizon).lerp(top, THREE.MathUtils.smoothstep(y, -0.02, 0.62));
    if (y < 0) tmp.lerp(ground, Math.min(1, -y * 2.2));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  return env;
}

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(officeEnvironment(), 0.14).texture;
scene.environmentIntensity = 0.48;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.08, 420);
camera.rotation.order = "YXZ";

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.06, 0.35, 0.97);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const WALK_SPEED = 3.7;
const SPRINT_SPEED = 8.4;
const GROUND_RATE = 22;
const BRAKE_RATE = 28;
const AIR_RATE = 10;
const GRAVITY = 18;
const JUMP_V = 5.5;
const HEADROOM = 10.8;

const UP = new THREE.Vector3(0, 1, 0);
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const keys = new Set();
const stick = { x: 0, y: 0 };

const startPos = new THREE.Vector3(0.15, 6.5, 31.2);
const endPos = new THREE.Vector3(4.6, HALL.eye, 16.6);
const startLook = new THREE.Vector3(0, 4.6, -4);
const endLook = new THREE.Vector3(0, 3.4, 0);
const aimTarget = new THREE.Vector3();
const aimDir = new THREE.Vector3();

let yaw = 0;
let pitch = 0;
let intro = reduced ? 1 : 0;
let dragging = false;
let dragX = 0;
let dragY = 0;
let ignoreLockJump = false;
let mark = null;
let paint = null;
let lockFailed = false;
let host = null;
let talk = null;
let running = true;
let velX = 0;
let velZ = 0;
let vy = 0;
let lift = 0;
let stance = 0;
let grounded = true;
let jumpQueued = 0;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let clickPress = null;
let pressMove = 0;

function hitsHost(clientX, clientY) {
  if (!host || !host.group) return false;
  const locked = document.pointerLockElement === canvas;
  if (locked) {
    ndc.set(0, 0);
  } else {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(host.group, true);
  for (const hit of hits) {
    if (!hit.object.userData.noHit) return true;
  }
  return false;
}

const coarse = window.matchMedia("(pointer: coarse)").matches;
if (coarse) {
  document.body.classList.add("coarse");
  stickEl.hidden = false;
  hint.textContent = "Drag to look · push to run · tap Jump";
}

function aimFrom(position, target) {
  aimDir.subVectors(target, position);
  const len = aimDir.length() || 1;
  aimDir.multiplyScalar(1 / len);
  pitch = Math.asin(THREE.MathUtils.clamp(aimDir.y, -1, 1));
  // Camera local forward is -Z. yaw 0 looks down -Z; positive yaw turns toward -X.
  yaw = Math.atan2(-aimDir.x, -aimDir.z);
}

function applyAim() {
  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
  camera.rotation.z = 0;
  camera.updateMatrixWorld();
}

function placeIntro(t) {
  const s = t * t * t * (t * (t * 6 - 15) + 10);
  camera.position.lerpVectors(startPos, endPos, s);
  aimTarget.lerpVectors(startLook, endLook, s);
  aimFrom(camera.position, aimTarget);
  applyAim();
}

function finishIntro() {
  if (intro >= 1) return;
  intro = 1;
  placeIntro(1);
}

function went() {
  document.body.classList.add("went");
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  const pr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h);
  composer.setPixelRatio(pr);
  if (paint) paint.layout();
}

function basis() {
  camera.getWorldDirection(fwd);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1);
  else fwd.normalize();
  right.crossVectors(fwd, UP);
}

function groundHere() {
  velX = 0;
  velZ = 0;
  vy = 0;
  lift = 0;
  grounded = true;
  jumpQueued = 0;
}

function updateMove(dt) {
  if (intro < 1) return;
  if (grounded) stance = camera.position.y - HALL.eye;
  jumpQueued = Math.max(0, jumpQueued - dt);

  let f = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  let s = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
  f += stick.y;
  s += stick.x;
  const len = Math.hypot(f, s);
  const moving = len >= 0.04;
  if (moving) {
    f /= len;
    s /= len;
  }
  basis();
  const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight") || Math.hypot(stick.x, stick.y) > 0.86;
  const top = moving ? (sprint ? SPRINT_SPEED : WALK_SPEED) : 0;
  const wishX = moving ? (fwd.x * f + right.x * s) * top : 0;
  const wishZ = moving ? (fwd.z * f + right.z * s) * top : 0;
  const rate = grounded ? (moving ? GROUND_RATE : BRAKE_RATE) : AIR_RATE;
  const blend = 1 - Math.exp(-rate * dt);
  velX += (wishX - velX) * blend;
  velZ += (wishZ - velZ) * blend;
  if (velX * velX + velZ * velZ < 0.0004) {
    velX = 0;
    velZ = 0;
  }

  const dist = Math.hypot(velX, velZ) * dt;
  if (dist > 0) {
    const slices = Math.max(1, Math.ceil(dist / 0.1));
    const stepX = (velX * dt) / slices;
    const stepZ = (velZ * dt) / slices;
    for (let i = 0; i < slices; i++) {
      const prevX = camera.position.x;
      const prevZ = camera.position.z;
      const foot = stance;
      camera.position.x += stepX;
      camera.position.z += stepZ;
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, HALL.minX, HALL.maxX);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, HALL.minZ, HALL.maxZ);
      if (foot < 0.8) {
        const dx = camera.position.x;
        const dz = camera.position.z;
        const reach = HALL.plinthR;
        if (dx * dx + dz * dz < reach * reach) {
          const d = Math.hypot(dx, dz) || 0.0001;
          camera.position.x = (dx / d) * reach;
          camera.position.z = (dz / d) * reach;
        }
        if (host) blockHost(camera.position);
      }
      const gun = paint && paint.blocker();
      const upstairs = [];
      if (gun && Math.abs(foot - gun.foot) < 0.6) upstairs.push(gun);
      for (const solid of levelSolids()) {
        if (Math.abs(foot - solid.foot) < 0.6) upstairs.push(solid);
      }
      for (const solid of upstairs) {
        const ax = camera.position.x - solid.x;
        const az = camera.position.z - solid.z;
        if (ax * ax + az * az >= solid.radius * solid.radius) continue;
        const d = Math.hypot(ax, az) || 0.0001;
        camera.position.x = solid.x + (ax / d) * solid.radius;
        camera.position.z = solid.z + (az / d) * solid.radius;
      }
      const next = footAt(camera.position.x, camera.position.z, foot);
      if (next === null) {
        camera.position.x = prevX;
        camera.position.z = prevZ;
        break;
      }
      stance = next;
    }
  }

  if (!grounded) {
    vy -= GRAVITY * dt;
    lift += vy * dt;
    const cap = HEADROOM - stance - HALL.eye;
    if (lift > cap) {
      lift = Math.max(0, cap);
      vy = Math.min(vy, 0);
    }
    if (lift <= 0 && vy <= 0) {
      lift = 0;
      vy = 0;
      grounded = true;
    }
  }
  if (jumpQueued > 0 && grounded) {
    vy = JUMP_V;
    lift = 0;
    grounded = false;
    jumpQueued = 0;
  }
  camera.position.y = stance + lift + HALL.eye;
}

function frame() {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (intro < 1) {
    intro = Math.min(1, intro + dt / 4.6);
    placeIntro(intro);
  }
  updateMove(dt);
  if (mark && SPIN) mark.rotation.y += dt * SPIN;
  if (host) host.update(dt, camera.position);
  if (talk && host) talk.follow(host.near);
  if (paint) {
    paint.update(dt, {
      x: camera.position.x,
      z: camera.position.z,
      playable: intro >= 1,
    });
  }
  updateGrounds(dt, reduced);
  composer.render();
}

const clock = new THREE.Clock();

canvas.addEventListener("pointerdown", (event) => {
  clickPress = null;
  pressMove = 0;
  if (event.button === 0 && !paint?.armed) {
    clickPress = {
      id: event.pointerId,
      hit: hitsHost(event.clientX, event.clientY),
    };
  }
  if (paint?.armed && event.button === 2) {
    paint.setFiring(true);
    finishIntro();
    went();
    return;
  }
  if (paint?.armed && !coarse && event.button === 0 && document.pointerLockElement === canvas) {
    paint.setFiring(true);
    finishIntro();
    went();
    return;
  }
  if (paint?.armed && !coarse && event.button === 0 && !lockFailed) {
    if (canvas.requestPointerLock) {
      const pending = canvas.requestPointerLock();
      if (pending && pending.catch) pending.catch(() => {
        lockFailed = true;
      });
    } else {
      lockFailed = true;
    }
    finishIntro();
    went();
    if (!lockFailed) return;
  }
  if (paint?.armed && !coarse && lockFailed && event.button === 0) paint.setFiring(true);
  dragging = true;
  dragX = event.clientX;
  dragY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
  finishIntro();
  went();
  if (!coarse && document.pointerLockElement !== canvas) {
    const lock = canvas.requestPointerLock();
    if (lock && typeof lock.catch === "function") lock.catch(() => {});
  }
});
document.addEventListener("pointerlockchange", () => {
  ignoreLockJump = document.pointerLockElement === canvas;
});
canvas.addEventListener("pointermove", (event) => {
  const locked = document.pointerLockElement === canvas;
  if (!locked && !dragging) return;
  if (locked && ignoreLockJump) {
    ignoreLockJump = false;
    return;
  }
  const dx = locked ? event.movementX : event.clientX - dragX;
  const dy = locked ? event.movementY : event.clientY - dragY;
  if (clickPress && event.pointerId === clickPress.id) pressMove += Math.hypot(dx, dy);
  if (!locked) {
    dragX = event.clientX;
    dragY = event.clientY;
  }
  yaw -= dx * 0.0022;
  pitch -= dy * 0.0018;
  pitch = THREE.MathUtils.clamp(pitch, -0.55, 0.72);
  applyAim();
});
function endDrag(event) {
  const press = clickPress;
  clickPress = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  dragging = false;
  if (event.type !== "pointerup") return;
  if (!press || event.pointerId !== press.id || event.button !== 0) return;
  if (paint?.armed || pressMove > 8 || !press.hit) return;
  host?.speak();
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

const MOVE = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
window.addEventListener("keydown", (event) => {
  if (event.code === "KeyT") {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "A" || tag === "BUTTON" || tag === "INPUT") return;
    if (host && host.talk()) event.preventDefault();
    return;
  }
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "A" || tag === "BUTTON" || tag === "INPUT") return;
    if (!event.repeat) keys.add(event.code);
    return;
  }
  if (event.code === "Space") {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "A" || tag === "BUTTON" || tag === "INPUT") return;
    event.preventDefault();
    if (event.repeat) return;
    jumpQueued = 0.16;
    finishIntro();
    went();
    return;
  }
  if (!MOVE.includes(event.code)) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "A" || tag === "BUTTON" || tag === "INPUT") return;
  event.preventDefault();
  if (!event.repeat) keys.add(event.code);
  finishIntro();
  went();
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});
window.addEventListener("keydown", (event) => {
  if (event.code !== "KeyE" || event.repeat) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "A" || tag === "BUTTON" || tag === "INPUT") return;
  if (!paint?.tryPickup()) return;
  event.preventDefault();
  finishIntro();
  went();
});
window.addEventListener("pointerup", (event) => {
  if (event.button === 0 || event.button === 2) paint?.setFiring(false);
});
window.addEventListener("blur", () => {
  keys.clear();
  jumpQueued = 0;
  paint?.setFiring(false);
});
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) dragging = false;
  paint?.setLocked(locked);
});

const pickupBtn = document.getElementById("pickup");
const sprayBtn = document.getElementById("spray");
pickupBtn.addEventListener("click", () => {
  if (!paint?.tryPickup()) return;
  finishIntro();
  went();
});
sprayBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  sprayBtn.setPointerCapture(event.pointerId);
  paint?.setFiring(true);
  finishIntro();
  went();
});
sprayBtn.addEventListener("pointerup", () => paint?.setFiring(false));
sprayBtn.addEventListener("pointercancel", () => paint?.setFiring(false));

let stickId = null;
const STICK = 44;
stickEl.addEventListener("pointerdown", (event) => {
  stickId = event.pointerId;
  stickEl.setPointerCapture(event.pointerId);
  moveStick(event);
  finishIntro();
  went();
});
stickEl.addEventListener("pointermove", (event) => {
  if (event.pointerId !== stickId) return;
  moveStick(event);
});
function moveStick(event) {
  const rect = stickEl.getBoundingClientRect();
  let x = event.clientX - (rect.left + rect.width / 2);
  let y = event.clientY - (rect.top + rect.height / 2);
  const len = Math.hypot(x, y) || 1;
  const clamped = Math.min(STICK, len);
  x = (x / len) * clamped;
  y = (y / len) * clamped;
  knob.style.transform = `translate(${x}px, ${y}px)`;
  stick.x = x / STICK;
  stick.y = -y / STICK;
}
function endStick(event) {
  if (event.pointerId !== stickId) return;
  stickId = null;
  stick.x = 0;
  stick.y = 0;
  knob.style.transform = "translate(0px, 0px)";
}
stickEl.addEventListener("pointerup", endStick);
stickEl.addEventListener("pointercancel", endStick);

const jumpBtn = document.getElementById("jump");
if (coarse) jumpBtn.hidden = false;
jumpBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  jumpQueued = 0.16;
  finishIntro();
  went();
});

window.addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => {
  running = !document.hidden;
  if (running) {
    clock.getDelta();
    requestAnimationFrame(frame);
  }
});

placeIntro(intro);
resize();

try {
  await document.fonts.ready;
  buildHall(scene);
  [mark, host] = await Promise.all([
    loadMark(scene),
    loadHost(scene, { reduced, live: document.getElementById("host-line") }),
  ]);
  if (VOICE_ENABLED) {
    talk = createTalk({
      line: document.getElementById("talk-line"),
      button: document.getElementById("talk"),
    });
    connectVoice((detail) => talk.toggle(detail));
  }
  paint = await buildPaint(scene, camera, {
    reduced,
    coarse,
    live: document.getElementById("piece-line"),
    prompt: document.getElementById("prompt"),
    quip: document.getElementById("quip"),
    pickup: pickupBtn,
    spray: sprayBtn,
    crosshair: document.getElementById("crosshair"),
  });
  document.body.classList.add("ready");
  clock.getDelta();
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  document.body.classList.add("fallback");
}

if (params.has("test") || params.has("still")) {
  window.THREE = THREE;
  window.__hall = {
    camera,
    get mark() {
      return mark;
    },
    get yaw() {
      return yaw;
    },
    get pitch() {
      return pitch;
    },
    get paint() {
      return paint;
    },
    get host() {
      return host;
    },
    grounds() {
      return groundsSnapshot();
    },
    skip() {
      intro = 1;
      placeIntro(1);
      went();
    },
    place(x, z, tx, ty, tz) {
      intro = 1;
      groundHere();
      stance = standAt(x, z);
      camera.position.set(x, stance + HALL.eye, z);
      aimFrom(camera.position, new THREE.Vector3(tx, ty, tz));
      applyAim();
      went();
    },
    grab(cols = 5, rows = 4) {
      composer.render();
      const gl = renderer.getContext();
      const width = renderer.domElement.width;
      const height = renderer.domElement.height;
      const out = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = Math.floor(((col + 0.5) / cols) * width);
          const y = Math.floor(((row + 0.5) / rows) * height);
          const pixel = new Uint8Array(4);
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          out.push([pixel[0], pixel[1], pixel[2]]);
        }
      }
      return { width, height, pixels: out };
    },
  };
}

