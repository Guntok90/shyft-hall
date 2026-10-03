import * as THREE from "three";

import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { HALL, buildHall, loadMark } from "./hall.js";
import { buildPieces } from "./pieces.js";
import { buildPaint } from "./paint.js";
import { blockHost, loadHost } from "./host.js";

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

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.08, 160);
camera.rotation.order = "YXZ";

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.06, 0.35, 0.97);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const WALK_SPEED = 3.7;
const SPRINT_SPEED = 6.5;

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
let pieces = null;
let paint = null;
let recoil = 0;
let lockFailed = false;
let host = null;
let running = true;

const coarse = window.matchMedia("(pointer: coarse)").matches;
if (coarse) {
  document.body.classList.add("coarse");
  stickEl.hidden = false;
  hint.textContent = "Drag to look · push to run";
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

function updateMove(dt) {
  if (intro < 1) return;
  let f = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  let s = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
  f += stick.y;
  s += stick.x;
  const len = Math.hypot(f, s);
  if (len < 0.04) return;
  f /= len;
  s /= len;
  basis();
  const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight") || Math.hypot(stick.x, stick.y) > 0.86;
  const step = (sprint ? SPRINT_SPEED : WALK_SPEED) * dt;
  camera.position.addScaledVector(fwd, f * step);
  camera.position.addScaledVector(right, s * step);
  camera.position.y = HALL.eye;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, HALL.minX, HALL.maxX);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, HALL.minZ, HALL.maxZ);
  const dx = camera.position.x;
  const dz = camera.position.z;
  const reach = HALL.plinthR;
  if (dx * dx + dz * dz < reach * reach) {
    const d = Math.hypot(dx, dz) || 0.0001;
    camera.position.x = (dx / d) * reach;
    camera.position.z = (dz / d) * reach;
  }
  if (host) blockHost(camera.position);
  const blockers = pieces ? pieces.solids : [];
  const gun = paint && paint.blocker();
  for (const solid of gun ? blockers.concat(gun) : blockers) {
    const ax = camera.position.x - solid.x;
    const az = camera.position.z - solid.z;
    if (ax * ax + az * az >= solid.radius * solid.radius) continue;
    const d = Math.hypot(ax, az) || 0.0001;
    camera.position.x = solid.x + (ax / d) * solid.radius;
    camera.position.z = solid.z + (az / d) * solid.radius;
  }
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
  if (pieces) pieces.update(dt, camera.position);
  if (host) host.update(dt, camera.position);
  if (paint) {
    recoil = paint.update(dt, {
      x: camera.position.x,
      z: camera.position.z,
      playable: intro >= 1,
    });
    if (intro >= 1) camera.rotation.x = pitch - recoil;
  }
  composer.render();
}

const clock = new THREE.Clock();

canvas.addEventListener("pointerdown", (event) => {
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
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  dragging = false;
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
  pieces = buildPieces(scene, { reduced, live: document.getElementById("piece-line") });
  [mark, host] = await Promise.all([
    loadMark(scene),
    loadHost(scene, { reduced, live: document.getElementById("host-line") }),
  ]);
  paint = buildPaint(scene, camera, {
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
    get pieces() {
      return pieces;
    },
    get paint() {
      return paint;
    },
    get host() {
      return host;
    },
    skip() {
      intro = 1;
      placeIntro(1);
      went();
    },
    place(x, z, tx, ty, tz) {
      intro = 1;
      camera.position.set(x, HALL.eye, z);
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

