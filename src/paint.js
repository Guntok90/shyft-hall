import * as THREE from "three";

// A Thompson leans in the back-left corner. Picking it up shows the hopper:
// it only shoots paint. The barrel is local −Z. Splats are planes whose +Z
// matches the surface normal, so a floor hit lies flat and a wall hit stands up.

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

function metal(color, roughness, metalness) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    envMapIntensity: 0.35,
  });
}

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

function cylZ(radius, length, segments = 14) {
  const geo = new THREE.CylinderGeometry(radius, radius, length, segments);
  geo.rotateX(Math.PI / 2);
  return geo;
}

function buildTommy(withHopper) {
  const group = new THREE.Group();
  group.name = "tommy";
  const wood = metal(0x513e30, 0.72, 0.04);
  const woodDark = metal(0x3a2b22, 0.78, 0.03);
  const steel = metal(0x3c3a36, 0.36, 0.72);
  const steelDark = metal(0x1a1917, 0.46, 0.55);
  const beadMat = new THREE.MeshStandardMaterial({
    color: 0xe8cbb0,
    emissive: 0xe8cbb0,
    emissiveIntensity: 0.9,
    roughness: 0.32,
  });

  const part = (geo, mat, x, y, z, rx = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  part(new THREE.BoxGeometry(0.085, 0.2, 0.1), woodDark, 0, -0.01, 0.5);
  part(new THREE.BoxGeometry(0.062, 0.08, 0.32), wood, 0, 0.04, 0.32);
  part(new THREE.BoxGeometry(0.078, 0.092, 0.3), steel, 0, 0.055, 0.05);
  part(new THREE.BoxGeometry(0.05, 0.018, 0.2), steelDark, 0, 0.108, 0.04);
  part(new THREE.BoxGeometry(0.05, 0.13, 0.055), wood, 0, -0.055, 0.15, -0.28);
  part(new THREE.BoxGeometry(0.046, 0.125, 0.05), wood, 0, -0.05, -0.15);
  part(new THREE.BoxGeometry(0.058, 0.042, 0.2), woodDark, 0, 0.028, -0.2);

  const drumGeo = new THREE.CylinderGeometry(0.105, 0.105, 0.078, 28);
  drumGeo.rotateZ(Math.PI / 2);
  part(drumGeo, steel, 0, -0.035, 0.02);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.092, 28), metal(0x6a655c, 0.42, 0.48));
  face.position.set(0.041, -0.035, 0.02);
  face.rotation.y = Math.PI / 2;
  face.castShadow = true;
  group.add(face);
  const rimGeo = new THREE.TorusGeometry(0.105, 0.012, 8, 24);
  rimGeo.rotateY(Math.PI / 2);
  part(rimGeo, steelDark, 0.04, -0.035, 0.02);

  part(cylZ(0.016, 0.46, 12), steelDark, 0, 0.072, -0.44);
  for (let i = 0; i < 8; i++) {
    part(cylZ(0.03, 0.012, 12), steel, 0, 0.072, -0.28 - i * 0.042);
  }
  part(cylZ(0.024, 0.07, 12), steel, 0, 0.072, -0.7);
  part(new THREE.BoxGeometry(0.012, 0.045, 0.012), steel, 0, 0.12, 0.14);
  part(new THREE.SphereGeometry(0.012, 8, 6), beadMat, 0, 0.1, -0.66);

  const muzzle = new THREE.Object3D();
  muzzle.name = "muzzle";
  muzzle.position.set(0, 0.072, -0.75);
  group.add(muzzle);

  if (withHopper) addHopper(group);
  return group;
}

function addHopper(group) {
  const shellMat = metal(0x242220, 0.48, 0.12);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.1, 16, 1, true), shellMat);
  shell.material.side = THREE.DoubleSide;
  shell.position.set(0, 0.15, 0.04);
  shell.castShadow = true;
  group.add(shell);
  const ballGeo = new THREE.SphereGeometry(0.026, 10, 8);
  PAINT.slice(0, 6).forEach((hex, i) => {
    const ball = new THREE.Mesh(
      ballGeo,
      new THREE.MeshBasicMaterial({ color: hex, toneMapped: false }),
    );
    const a = (i / 6) * Math.PI * 2;
    ball.position.set(Math.cos(a) * 0.02, 0.175 + (i % 3) * 0.028, 0.04 + Math.sin(a) * 0.02);
    group.add(ball);
  });
}

function makeNoise(ctx) {
  const len = Math.floor(ctx.sampleRate * 0.25);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function buildPaint(scene, camera, opts) {
  const { reduced = false, coarse = false, live = null, prompt, quip, pickup, spray, crosshair } = opts;

  const targets = [];
  const world = buildTommy(false);
  const held = buildTommy(true);

  // Yaw 3π/4 lays the barrel along the left wall. Someone walking in from the
  // nave looks along the drum's axis, so the round magazine faces them.
  const prop = new THREE.Group();
  prop.name = "tommy-prop";
  const tilt = new THREE.Group();
  tilt.rotation.x = 1.04;
  tilt.add(world);
  prop.add(tilt);
  prop.rotation.y = Math.PI * 0.75;
  prop.position.set(-10.85, 0, -24.95);
  scene.add(prop);
  prop.updateMatrixWorld(true);
  const raised = new THREE.Box3().setFromObject(prop);
  prop.position.y += 0.02 - raised.min.y;
  prop.updateMatrixWorld(true);
  let seated = new THREE.Box3().setFromObject(prop);
  if (seated.min.x < -12.55) prop.position.x += -12.55 - seated.min.x;
  if (seated.min.z < -27.55) prop.position.z += -27.55 - seated.min.z;
  prop.updateMatrixWorld(true);
  seated = new THREE.Box3().setFromObject(prop);
  const seatCenter = seated.getCenter(new THREE.Vector3());
  const anchor = { x: seatCenter.x, z: seatCenter.z };

  world.traverse((obj) => {
    obj.userData.noHit = true;
  });

  const practical = new THREE.PointLight(0xe4d3c0, 36, 6.5, 2);
  practical.position.set(anchor.x + 0.85, 1.7, anchor.z + 0.7);
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
    new THREE.PlaneGeometry(0.12, 0.12),
    new THREE.MeshBasicMaterial({
      color: 0xfff1c9,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  flash.visible = false;
  flash.position.set(0, 0.072, -0.8);
  held.add(flash);

  viewAnchor.traverse((obj) => {
    obj.userData.noHit = true;
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.layers.set(1);
    obj.frustumCulled = false;
  });
  camera.layers.enable(1);
  viewAnchor.visible = false;

  const basePos = new THREE.Vector3(0.26, -0.21, -0.54);
  function layout() {
    const narrow = window.innerWidth < 720;
    // Narrow lens (38°). Keep the gun out along −Z or the muzzle fills the frame.
    basePos.set(narrow ? 0.16 : 0.28, narrow ? -0.13 : -0.15, narrow ? -0.72 : -0.92);
    held.scale.setScalar(narrow ? 0.4 : 0.52);
    _aimPoint.set(-0.16, 0.05, -6).normalize();
    aim.quaternion.setFromUnitVectors(_barrel, _aimPoint);
    aim.rotateZ(narrow ? 0.38 : 0.45);
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
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    color: new THREE.Color(),
    age: 0,
    r: BALL_R,
  }));

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

  function raycast(origin, dir, far) {
    _ray.set(origin, dir);
    _ray.near = 0.02;
    _ray.far = far;
    const hits = _ray.intersectObjects(targets, false);
    for (const hit of hits) {
      _normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      if (_normal.dot(dir) < -0.05) {
        _hitPoint.copy(hit.point);
        return true;
      }
    }
    return false;
  }

  function writeSplat(px, py, pz, quat, sx, sy, color) {
    const i = splatCursor;
    splatCursor = (splatCursor + 1) % SPLATS;
    _dummy.position.set(px, py, pz);
    _dummy.quaternion.copy(quat);
    _dummy.scale.set(sx, sy, 1);
    _dummy.updateMatrix();
    splatMesh.setMatrixAt(i, _dummy.matrix);
    splatMesh.setColorAt(i, color);
    splatsLanded += 1;
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

  function stamp(point, normal, incoming, color, scale) {
    _pos.copy(point).addScaledVector(normal, 0.012 + (splatCursor % 5) * 0.0016);
    _streak.copy(incoming).addScaledVector(normal, -incoming.dot(normal));
    if (_streak.lengthSq() < 1e-6) _streak.copy(Math.abs(normal.y) > 0.85 ? _xAxis : _up);
    _streak.normalize();
    orient(normal, _streak);
    _side.copy(_bitangent);
    const main = scale * (0.85 + Math.random() * 0.45);
    writeSplat(_pos.x, _pos.y, _pos.z, _quat, main * 0.78, main * 1.28, color);

    _color.copy(color).offsetHSL(0, -0.02, 0.03);
    _sat.copy(_pos).addScaledVector(normal, 0.004);
    writeSplat(_sat.x, _sat.y, _sat.z, _quat, main * 0.34, main * 0.42, _color);

    const satellites = reduced ? 3 : 5;
    for (let s = 0; s < satellites; s++) {
      const along = (Math.random() - 0.15) * main * 0.95;
      const side = (Math.random() - 0.5) * main * 0.85;
      _sat.copy(_pos).addScaledVector(_streak, along).addScaledVector(_side, side);
      _sat.addScaledVector(normal, 0.002);
      _color.copy(color).offsetHSL((Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.12);
      _tmp.copy(_streak).applyAxisAngle(normal, Math.random() * Math.PI * 2);
      orient(normal, _tmp);
      const blob = main * (0.18 + Math.random() * 0.28);
      writeSplat(_sat.x, _sat.y, _sat.z, _quat, blob, blob * (0.8 + Math.random() * 0.5), _color);
    }

    if (!reduced && Math.abs(normal.y) < 0.55 && Math.random() < 0.55) {
      _down.set(0, -1, 0).addScaledVector(normal, normal.y);
      if (_down.lengthSq() > 1e-4) {
        _down.normalize();
        _sat.copy(point).addScaledVector(_down, main * 0.72).addScaledVector(normal, 0.014);
        orient(normal, _down);
        _color.copy(color).offsetHSL(0, 0.02, -0.06);
        writeSplat(_sat.x, _sat.y, _sat.z, _quat, main * 0.28, main * 0.95, _color);
      }
    }

    splatMesh.instanceMatrix.needsUpdate = true;
    if (splatMesh.instanceColor) splatMesh.instanceColor.needsUpdate = true;
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
    camera.getWorldDirection(_forward);
    _aimPoint.copy(camera.position).addScaledVector(_forward, 26);
    if (spread > 0) {
      _ortho.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      _ortho.cross(_forward);
      if (_ortho.lengthSq() < 1e-8) _ortho.set(1, 0, 0).cross(_forward);
      _ortho.normalize();
      _aimPoint.addScaledVector(_ortho, (Math.random() - 0.5) * 2 * spread * 26);
    }
    const muzzle = held.getObjectByName("muzzle");
    muzzle.getWorldPosition(_muzzlePos);
    _dir.copy(_aimPoint).sub(_muzzlePos).normalize();

    _shot.set(PAINT[(Math.random() * PAINT.length) | 0]);
    if (raycast(camera.position, _forward, 1.35)) {
      stamp(_hitPoint, _normal, _forward, _shot, 0.42);
      burst();
      return { immediate: true, vel: _dir.clone() };
    }

    let slot = pool.find((ball) => !ball.alive);
    if (!slot) slot = pool.reduce((a, b) => (a.age > b.age ? a : b));
    slot.alive = true;
    slot.age = 0;
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
      ball.vel.y += GRAVITY * dt;
      ball.pos.addScaledVector(ball.vel, dt);
      _dir.copy(ball.pos).sub(before);
      const dist = _dir.length();
      let struck = false;
      if (dist > 1e-5) {
        _dir.multiplyScalar(1 / dist);
        if (raycast(before, _dir, dist)) {
          stamp(_hitPoint, _normal, ball.vel, ball.color, 0.46 + Math.random() * 0.22);
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
    const playable = !player || player.playable !== false;
    if (playable) {
      const d = Math.hypot(player.x - anchor.x, player.z - anchor.z);
      if (near) near = d < REACH_OUT;
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
      return { x: anchor.x, z: anchor.z, radius: 0.7 };
    },
    layout,
    selfTest,
  };
}
