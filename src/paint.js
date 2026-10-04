import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HALL } from "./hall.js";
import { GUN_SPOT } from "./stairs.js";

// A paint siphon stands on the left gangway. The nozzle is local −Z, which
// is Blender +Y in scripts/build_siphon.py. The sight is the camera ray, and
// the ball flies straight from the muzzle to that hit. Splats are planes
// whose +Z matches the surface normal, so a floor hit lies flat and a wall
// hit stands up. Paint on the spinning mark is parented to the mark.

const REACH_IN = 2.9;
const REACH_OUT = 3.35;
const SPEED = 48;
const GRAVITY = -6.5;
const FIRE_INTERVAL = 1 / 12;
const BALLS = 40;
const SPLATS = 700;
const BALL_R = 0.055;

const PAINT = [0xff2b4a, 0xffd23a, 0x2ee6a6, 0x3ec4ff, 0xff6a1a, 0xb388ff, 0xf6f1e8];

const _forward = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ortho = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _bitangent = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _streak = new THREE.Vector3();
const _side = new THREE.Vector3();
const _sat = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _barrel = new THREE.Vector3(0, 0, -1);
const _up = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _down = new THREE.Vector3(0, -1, 0);
const _color = new THREE.Color();
const _shot = new THREE.Color();
const _dummy = new THREE.Object3D();
const _ray = new THREE.Raycaster();
const _basis = new THREE.Matrix4();
const _localM = new THREE.Matrix4();
const _castFrom = new THREE.Vector3();
const _castDir = new THREE.Vector3();
const _clingP = new THREE.Vector3();
const _clingN = new THREE.Vector3();
const _white = new THREE.Color(0xffffff);

function blobTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, 256, 256);
  const spots = [
    [128, 132, 86],
    [104, 146, 48],
    [156, 112, 44],
    [92, 104, 36],
    [164, 158, 34],
    [120, 84, 30],
    [146, 150, 24],
    [78, 128, 22],
  ];
  for (const [x, y, r] of spots) {
    const grad = g.createRadialGradient(x, y, r * 0.15, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.92)");
    grad.addColorStop(0.78, "rgba(255,255,255,0.4)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = "rgba(0,0,0,0.65)";
  g.beginPath();
  g.arc(176, 86, 18, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(84, 168, 14, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

async function loadSiphon() {
  const gltf = await new GLTFLoader().loadAsync("/models/siphon.glb");
  const root = gltf.scene;
  root.name = "siphon";
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (!material || !("envMapIntensity" in material)) continue;
      material.envMapIntensity = material.transmission > 0 ? 1 : 0.62;
    }
  });
  return root;
}

function makeNoise(ctx) {
  const len = Math.floor(ctx.sampleRate * 0.25);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export async function buildPaint(scene, camera, opts) {
  const { reduced = false, coarse = false, live = null, prompt, quip, pickup, spray, crosshair } = opts;

  const targets = [];
  const world = await loadSiphon();
  const held = world.clone(true);

  // The gauge sits on local +X. Yaw −π/2 turns that face toward world −Z,
  // which is the stair you climb to reach the gangway.
  const prop = new THREE.Group();
  prop.name = "siphon-prop";
  prop.add(world);
  prop.rotation.y = -Math.PI / 2;
  prop.scale.setScalar(2.15);
  prop.position.set(GUN_SPOT.x, GUN_SPOT.y, GUN_SPOT.z);
  scene.add(prop);
  prop.updateMatrixWorld(true);
  const raised = new THREE.Box3().setFromObject(prop);
  prop.position.y += GUN_SPOT.y + 0.02 - raised.min.y;
  prop.updateMatrixWorld(true);
  const seated = new THREE.Box3().setFromObject(prop);
  const seatCenter = seated.getCenter(new THREE.Vector3());
  const anchor = { x: seatCenter.x, z: seatCenter.z, foot: GUN_SPOT.y };

  world.traverse((obj) => {
    obj.userData.noHit = true;
  });

  const practical = new THREE.PointLight(0xe4d3c0, 28, 5.5, 2);
  practical.position.set(anchor.x + 0.35, anchor.foot + 1.55, anchor.z - 0.85);
  scene.add(practical);

  const viewAnchor = new THREE.Group();
  viewAnchor.name = "view-rig";
  viewAnchor.matrixAutoUpdate = false;
  const kick = new THREE.Group();
  const aim = new THREE.Group();
  aim.add(held);
  kick.add(aim);
  viewAnchor.add(kick);
  scene.add(viewAnchor);

  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 12, 8),
    new THREE.MeshBasicMaterial({
      color: 0xfff1c9,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  flash.visible = false;
  const muzzle = held.getObjectByName("muzzle");
  muzzle.add(flash);

  viewAnchor.traverse((obj) => {
    obj.userData.noHit = true;
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.layers.set(1);
    obj.frustumCulled = false;
  });
  camera.layers.enable(1);
  viewAnchor.visible = false;

  const basePos = new THREE.Vector3(0.22, -0.04, -0.62);
  function layout() {
    const narrow = window.innerWidth < 720;
    // Narrow lens (38°). Keep the bottle in the lower corner so the nozzle
    // points inward without filling the frame.
    basePos.set(narrow ? 0.16 : 0.22, narrow ? -0.02 : -0.03, narrow ? -0.5 : -0.62);
    held.scale.setScalar(narrow ? 0.48 : 0.58);
    _aimPoint.set(-0.12, 0.04, -6).normalize();
    aim.quaternion.setFromUnitVectors(_barrel, _aimPoint);
    aim.rotateZ(narrow ? 0.16 : 0.22);
    kick.position.copy(basePos);
  }
  layout();

  const splatMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: blobTexture(),
    alphaTest: 0.32,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const splatMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), splatMat, SPLATS);
  splatMesh.userData.noHit = true;
  splatMesh.frustumCulled = false;
  splatMesh.count = SPLATS;
  const ballMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const ballMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), ballMat, BALLS);
  ballMesh.userData.noHit = true;
  ballMesh.frustumCulled = false;
  ballMesh.count = BALLS;
  scene.add(splatMesh, ballMesh);

  scene.traverse((obj) => {
    if (!obj.isMesh || !obj.visible || obj.userData.noHit) return;
    targets.push(obj);
  });

  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < SPLATS; i++) {
    splatMesh.setMatrixAt(i, hide);
    splatMesh.setColorAt(i, _color.set(0xffffff));
  }
  for (let i = 0; i < BALLS; i++) {
    ballMesh.setMatrixAt(i, hide);
    ballMesh.setColorAt(i, _color.set(0xffffff));
  }
  splatMesh.instanceMatrix.needsUpdate = true;
  ballMesh.instanceMatrix.needsUpdate = true;

  const pool = Array.from({ length: BALLS }, () => ({
    alive: false,
    noGrav: false,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    color: new THREE.Color(),
    age: 0,
    r: BALL_R,
  }));
  const stuck = new Map();

  let armed = false;
  let near = false;
  let firing = false;
  let locked = false;
  let cooldown = 0;
  let heat = 0;
  let kickAmt = 0;
  let recoil = 0;
  let draw = 0;
  let bob = 0;
  let flashLife = 0;
  let splatCursor = 0;
  let splatsLanded = 0;
  let promptText = "";
  let quipTimer = 0;
  let aimHint = 0;
  let audioCtx = null;
  let noiseBuf = null;
  let nextSplatSound = 0;
  const lastNormal = new THREE.Vector3();
  const lastPoint = new THREE.Vector3();
  let prevXZ = new THREE.Vector2();
  let havePrev = false;
  let hitObject = null;
  let clingObject = null;

  function raycast(origin, dir, far) {
    _ray.set(origin, dir);
    _ray.near = 0.02;
    _ray.far = far;
    const hits = _ray.intersectObjects(targets, false);
    for (const hit of hits) {
      _normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      if (_normal.dot(dir) < -0.05) {
        _hitPoint.copy(hit.point);
        hitObject = hit.object;
        return true;
      }
    }
    hitObject = null;
    return false;
  }

  function paintAnchor(object) {
    let node = object;
    while (node) {
      if (node.userData && node.userData.stickPaint) return node;
      node = node.parent;
    }
    return null;
  }

  function stuckRecord(anchor) {
    const found = stuck.get(anchor);
    if (found) return found;
    const mesh = new THREE.InstancedMesh(splatMesh.geometry, splatMat, SPLATS);
    mesh.name = "stuck-paint";
    mesh.userData.noHit = true;
    mesh.frustumCulled = false;
    mesh.count = SPLATS;
    for (let i = 0; i < SPLATS; i++) {
      mesh.setMatrixAt(i, hide);
      mesh.setColorAt(i, _white);
    }
    mesh.instanceMatrix.needsUpdate = true;
    anchor.add(mesh);
    const record = { mesh, cursor: 0 };
    stuck.set(anchor, record);
    return record;
  }

  function writeSplat(px, py, pz, quat, sx, sy, color, anchor) {
    const record = anchor ? stuckRecord(anchor) : null;
    const mesh = record ? record.mesh : splatMesh;
    const i = record ? record.cursor : splatCursor;
    if (record) record.cursor = (record.cursor + 1) % SPLATS;
    else splatCursor = (splatCursor + 1) % SPLATS;
    _dummy.position.set(px, py, pz);
    _dummy.quaternion.copy(quat);
    _dummy.scale.set(sx, sy, 1);
    _dummy.updateMatrix();
    if (record) {
      anchor.updateMatrixWorld(true);
      _localM.copy(anchor.matrixWorld).invert().multiply(_dummy.matrix);
      mesh.setMatrixAt(i, _localM);
    } else {
      mesh.setMatrixAt(i, _dummy.matrix);
    }
    mesh.setColorAt(i, color);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    splatsLanded += 1;
  }

  // Extra blobs only stay where a surface still sits under them. A sideways
  // step into a gap in the mark is dropped instead of left hanging in the air.
  function cling(point, normal) {
    _castFrom.copy(point).addScaledVector(normal, 0.35);
    _castDir.copy(normal).negate();
    _ray.set(_castFrom, _castDir);
    _ray.near = 0;
    _ray.far = 0.6;
    const hits = _ray.intersectObjects(targets, false);
    for (const hit of hits) {
      _clingN.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      if (_clingN.dot(normal) < 0.35) continue;
      if (Math.abs(hit.distance - 0.35) > 0.22) continue;
      _clingP.copy(hit.point);
      clingObject = hit.object;
      return true;
    }
    clingObject = null;
    return false;
  }

  // `orient` fills _quat. It also writes _tangent and _bitangent, so callers
  // keep any direction they still need in their own vector.
  function orient(normal, yAxis) {
    _tangent.copy(yAxis);
    _tangent.addScaledVector(normal, -_tangent.dot(normal));
    if (_tangent.lengthSq() < 1e-6) {
      const helper = Math.abs(normal.y) > 0.85 ? _xAxis : _up;
      _tangent.crossVectors(helper, normal);
    }
    _tangent.normalize();
    _bitangent.crossVectors(_tangent, normal).normalize();
    // PlaneGeometry lies in XY. Columns are local X, local Y, local +Z (the normal).
    _basis.makeBasis(_bitangent, _tangent, normal);
    _quat.setFromRotationMatrix(_basis);
  }

  function stamp(point, normal, incoming, color, scale, anchor) {
    const lift = 0.012 + (splatsLanded % 5) * 0.0016;
    _pos.copy(point).addScaledVector(normal, lift);
    _streak.copy(incoming).addScaledVector(normal, -incoming.dot(normal));
    if (_streak.lengthSq() < 1e-6) _streak.copy(Math.abs(normal.y) > 0.85 ? _xAxis : _up);
    _streak.normalize();
    orient(normal, _streak);
    _side.copy(_bitangent);
    const main = scale * (0.85 + Math.random() * 0.45);
    writeSplat(_pos.x, _pos.y, _pos.z, _quat, main * 0.78, main * 1.28, color, anchor);

    _color.copy(color).offsetHSL(0, -0.02, 0.03);
    _sat.copy(_pos).addScaledVector(normal, 0.004);
    writeSplat(_sat.x, _sat.y, _sat.z, _quat, main * 0.34, main * 0.42, _color, anchor);

    const satellites = reduced ? 3 : 5;
    for (let s = 0; s < satellites; s++) {
      const along = (Math.random() - 0.15) * main * 0.95;
      const side = (Math.random() - 0.5) * main * 0.85;
      _sat.copy(point).addScaledVector(_streak, along).addScaledVector(_side, side);
      if (!cling(_sat, normal)) continue;
      _color.copy(color).offsetHSL((Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.12);
      _tmp.copy(_streak).applyAxisAngle(_clingN, Math.random() * Math.PI * 2);
      orient(_clingN, _tmp);
      _sat.copy(_clingP).addScaledVector(_clingN, 0.008);
      const blob = main * (0.18 + Math.random() * 0.28);
      writeSplat(_sat.x, _sat.y, _sat.z, _quat, blob, blob * (0.8 + Math.random() * 0.5), _color, paintAnchor(clingObject));
    }

    if (!reduced && Math.abs(normal.y) < 0.55 && Math.random() < 0.55) {
      _down.set(0, -1, 0).addScaledVector(normal, normal.y);
      if (_down.lengthSq() > 1e-4) {
        _down.normalize();
        _sat.copy(point).addScaledVector(_down, main * 0.72);
        if (cling(_sat, normal)) {
          orient(_clingN, _down);
          _sat.copy(_clingP).addScaledVector(_clingN, 0.01);
          _color.copy(color).offsetHSL(0, 0.02, -0.06);
          writeSplat(_sat.x, _sat.y, _sat.z, _quat, main * 0.28, main * 0.95, _color, paintAnchor(clingObject));
        }
      }
    }

    lastNormal.copy(normal);
    lastPoint.copy(point);
  }

  function syncView() {
    camera.updateMatrixWorld(true);
    viewAnchor.matrix.copy(camera.matrixWorld);
    viewAnchor.updateMatrixWorld(true);
  }

  function play(freq, q, gain, dur) {
    if (!audioCtx || !noiseBuf) return;
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = q;
    const amp = audioCtx.createGain();
    const t = audioCtx.currentTime;
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(audioCtx.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function ensureAudio() {
    if (audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    noiseBuf = makeNoise(audioCtx);
  }

  function setPrompt(text) {
    if (!prompt || text === promptText) return;
    promptText = text;
    prompt.textContent = text;
    prompt.hidden = !text;
  }

  function refreshHud() {
    let text = "";
    if (!armed && near) text = coarse ? "" : "E · Aufheben";
    else if (armed && !locked && !coarse) text = "Klicken zum Zielen";
    else if (armed && locked && aimHint > 0) text = "Halten zum Sprühen";
    setPrompt(text);
    if (pickup) pickup.hidden = !(coarse && near && !armed);
    if (spray) spray.hidden = !(coarse && armed);
    if (crosshair) crosshair.hidden = !armed;
    document.body.classList.toggle("armed", armed);
    document.body.classList.toggle("spraying", firing);
  }

  function showQuip() {
    if (!quip) return;
    quip.textContent = "Es schießt nur Farbe.";
    quip.classList.add("show");
    quipTimer = 3.4;
    if (live) live.textContent = quip.textContent;
  }

  function tryPickup() {
    if (armed || !near) return false;
    armed = true;
    prop.visible = false;
    practical.visible = false;
    viewAnchor.visible = true;
    draw = 0;
    ensureAudio();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    play(520, 0.8, 0.03, 0.06);
    showQuip();
    refreshHud();
    return true;
  }

  function spawnShot(spread) {
    syncView();
    scene.updateMatrixWorld(true);
    camera.getWorldDirection(_forward);
    // Sight ray first, then the muzzle aims at that point. A fixed far point
    // left the ball low and to the right of the crosshair, off the mark.
    const aimed = raycast(camera.position, _forward, 80);
    const aimDistance = aimed ? _hitPoint.distanceTo(camera.position) : Infinity;
    if (aimed) _aimPoint.copy(_hitPoint);
    else _aimPoint.copy(camera.position).addScaledVector(_forward, 40);
    const muzzle = held.getObjectByName("muzzle");
    muzzle.getWorldPosition(_muzzlePos);
    _shot.set(PAINT[(Math.random() * PAINT.length) | 0]);
    if (aimed && aimDistance <= 1.35) {
      _dir.copy(_hitPoint).sub(_muzzlePos);
      if (_dir.lengthSq() < 1e-8) _dir.copy(_forward);
      else _dir.normalize();
      stamp(_hitPoint, _normal, _forward, _shot, 0.42, paintAnchor(hitObject));
      burst();
      return { immediate: true, vel: _dir.clone() };
    }
    if (spread > 0) {
      _ortho.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      _ortho.cross(_forward);
      if (_ortho.lengthSq() < 1e-8) _ortho.set(1, 0, 0).cross(_forward);
      _ortho.normalize();
      const dist = Math.max(1, camera.position.distanceTo(_aimPoint));
      _aimPoint.addScaledVector(_ortho, (Math.random() - 0.5) * 2 * spread * dist);
    }
    _dir.copy(_aimPoint).sub(_muzzlePos);
    if (_dir.lengthSq() < 1e-8) _dir.copy(_forward);
    else _dir.normalize();

    let slot = pool.find((ball) => !ball.alive);
    if (!slot) slot = pool.reduce((a, b) => (a.age > b.age ? a : b));
    slot.alive = true;
    slot.age = 0;
    slot.noGrav = aimed;
    slot.r = BALL_R * (0.85 + Math.random() * 0.3);
    slot.color.copy(_shot);
    slot.pos.copy(_muzzlePos).addScaledVector(_dir, 0.06);
    slot.vel.copy(_dir).multiplyScalar(SPEED);
    burst();
    return { immediate: false, vel: slot.vel.clone() };
  }

  function burst() {
    kickAmt = Math.min(1, kickAmt + 0.62);
    recoil = Math.min(reduced ? 0 : 0.05, recoil + (reduced ? 0 : 0.011));
    flash.visible = true;
    flash.scale.setScalar(0.7 + Math.random() * 0.6);
    flash.material.color.set(PAINT[(Math.random() * PAINT.length) | 0]);
    flashLife = 0.045;
    play(980, 0.7, 0.04, 0.045);
  }

  function stepBalls(dt) {
    let hit = null;
    for (const ball of pool) {
      if (!ball.alive) continue;
      ball.age += dt;
      const before = _delta.copy(ball.pos);
      if (!ball.noGrav) ball.vel.y += GRAVITY * dt;
      ball.pos.addScaledVector(ball.vel, dt);
      _dir.copy(ball.pos).sub(before);
      const dist = _dir.length();
      let struck = false;
      if (dist > 1e-5) {
        _dir.multiplyScalar(1 / dist);
        if (raycast(before, _dir, dist)) {
          stamp(_hitPoint, _normal, ball.vel, ball.color, 0.46 + Math.random() * 0.22, paintAnchor(hitObject));
          ball.alive = false;
          struck = true;
          hit = { normal: lastNormal.clone(), point: lastPoint.clone() };
          const now = performance.now();
          if (now >= nextSplatSound) {
            play(240 + Math.random() * 80, 0.6, 0.055, 0.08);
            nextSplatSound = now + 90;
          }
        }
      }
      if (!struck && (ball.pos.y < -1 || ball.age > 2.4 || ball.pos.length() > 80)) ball.alive = false;
    }
    for (let i = 0; i < BALLS; i++) {
      const ball = pool[i];
      if (!ball.alive) {
        ballMesh.setMatrixAt(i, hide);
        continue;
      }
      _dummy.position.copy(ball.pos);
      _dummy.quaternion.identity();
      _dummy.scale.setScalar(ball.r);
      _dummy.updateMatrix();
      ballMesh.setMatrixAt(i, _dummy.matrix);
      ballMesh.setColorAt(i, ball.color);
    }
    ballMesh.instanceMatrix.needsUpdate = true;
    if (ballMesh.instanceColor) ballMesh.instanceColor.needsUpdate = true;
    return hit;
  }

  function update(dt, player) {
    syncView();
    scene.updateMatrixWorld(true);
    const playable = !player || player.playable !== false;
    if (playable) {
      const d = Math.hypot(player.x - anchor.x, player.z - anchor.z);
      const sameLevel = Math.abs(camera.position.y - HALL.eye - anchor.foot) < 0.55;
      if (!sameLevel) near = false;
      else if (near) near = d < REACH_OUT;
      else near = d < REACH_IN;
    } else {
      near = false;
    }

    if (quipTimer > 0) {
      quipTimer -= dt;
      if (quipTimer <= 0 && quip) quip.classList.remove("show");
    }
    if (aimHint > 0) aimHint -= dt;

    if (armed) draw = Math.min(1, draw + dt / 0.42);
    const ease = draw * draw * (3 - 2 * draw);
    kickAmt *= Math.exp(-dt * 14);
    recoil *= Math.exp(-dt * 9);
    heat = firing ? Math.min(1, heat + dt * 0.85) : Math.max(0, heat - dt * 1.3);

    if (playable && firing && armed) {
      cooldown -= dt;
      const spread = 0.012 + heat * 0.05;
      while (cooldown <= 0) {
        spawnShot(spread);
        cooldown += FIRE_INTERVAL;
      }
    } else {
      cooldown = 0;
    }

    stepBalls(dt);

    if (flashLife > 0) {
      flashLife -= dt;
      if (flashLife <= 0) flash.visible = false;
    }

    syncView();
    const dx = camera.position.x - prevXZ.x;
    const dz = camera.position.z - prevXZ.y;
    const moving = havePrev && dx * dx + dz * dz > 0.000004;
    prevXZ.set(camera.position.x, camera.position.z);
    havePrev = true;
    if (!reduced && moving && armed) bob += dt * 8.5;
    else bob += dt * 1.4;

    kick.position.set(basePos.x, basePos.y - (1 - ease) * 0.48, basePos.z);
    if (!reduced) {
      kick.position.x += Math.sin(bob * 0.5) * (moving ? 0.008 : 0.0015);
      kick.position.y += Math.sin(bob) * (moving ? 0.007 : 0.0012);
    }
    kick.position.z += kickAmt * 0.07;
    kick.rotation.x = kickAmt * 0.42;
    kick.rotation.z = -kickAmt * 0.06;

    refreshHud();
    return reduced ? 0 : recoil;
  }

  function selfTest() {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const shot = spawnShot(0);
    const travel = shot.vel.clone().normalize();
    let landed = shot.immediate ? { normal: lastNormal.clone(), point: lastPoint.clone() } : null;
    for (let i = 0; i < 180 && !landed; i++) landed = stepBalls(1 / 60);
    return {
      aimDot: travel.dot(forward),
      landed: !!landed,
      normal: landed ? [landed.normal.x, landed.normal.y, landed.normal.z] : null,
      point: landed ? [landed.point.x, landed.point.y, landed.point.z] : null,
      splats: splatsLanded,
    };
  }

  refreshHud();

  return {
    get armed() {
      return armed;
    },
    get anchor() {
      return anchor;
    },
    get near() {
      return near;
    },
    tryPickup,
    setFiring(next) {
      firing = !!next && armed;
      if (firing) ensureAudio();
      refreshHud();
    },
    setLocked(next) {
      const was = locked;
      locked = !!next;
      if (!locked) firing = false;
      if (locked && !was) aimHint = 3.2;
      refreshHud();
    },
    update,
    blocker() {
      if (armed) return null;
      return { x: anchor.x, z: anchor.z, foot: anchor.foot, radius: 0.46 };
    },
    layout,
    selfTest,
  };
}
