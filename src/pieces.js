import * as THREE from "three";

// Three objects on the floor around the plinth. The step's outer radius is 5.35
// and the walk keep-out is 5.45, so these sit further out, where you can walk up.
// A sentence lies just outside each one and fades in when you are near.
// Floor type points inward. For an object on +Z, texture-up is world -Z,
// so a reader standing further out reads it while looking toward the mark.

const REACH = 3.15;
const SHOW = 2.15;
const BODY = 0.28;

const SWATCH = {
  teal: 0x2c4c57,
  cream: 0xe8cbb0,
  olive: 0x847e64,
  terracotta: 0xae593c,
  umber: 0x513e30,
};

const LAYOUT = [
  { id: "key", line: "For hotels and tourism.", angle: 0.85, yaw: 0.55 },
  { id: "letter", line: "Start with a fifteen-minute look.", angle: -0.85, yaw: -0.4 },
  { id: "ledger", line: "AI systems for the work behind a stay.", angle: Math.PI, yaw: 0.35 },
];

const RING = 8.6;
const SCALE = 2.15;

function stone(color, roughness, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    envMapIntensity: 0.3,
  });
}

function add(group, geo, material, position, rotation) {
  const mesh = new THREE.Mesh(geo, material);
  if (position) mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function buildKey(mat) {
  const group = new THREE.Group();
  const bow = new THREE.TorusGeometry(0.09, 0.016, 10, 28);
  bow.rotateX(Math.PI / 2);
  add(group, bow, mat.umber, [0, 0.02, 0]);
  add(group, new THREE.BoxGeometry(0.36, 0.014, 0.03), mat.cream, [0.25, 0.02, 0]);
  add(group, new THREE.BoxGeometry(0.055, 0.014, 0.02), mat.teal, [0.4, 0.02, -0.02]);
  add(group, new THREE.BoxGeometry(0.034, 0.014, 0.016), mat.teal, [0.34, 0.02, -0.02]);
  return group;
}

function buildLedger(mat) {
  const group = new THREE.Group();
  add(group, new THREE.BoxGeometry(0.52, 0.028, 0.36), mat.umber, [0, 0.018, 0]);
  add(group, new THREE.BoxGeometry(0.44, 0.032, 0.29), mat.cream, [0.02, 0.042, 0]);
  add(group, new THREE.BoxGeometry(0.03, 0.072, 0.36), mat.teal, [-0.245, 0.038, 0]);
  add(group, new THREE.BoxGeometry(0.018, 0.01, 0.11), mat.terracotta, [0.05, 0.016, 0.23]);
  return group;
}

function buildLetter(mat) {
  const group = new THREE.Group();
  add(group, new THREE.BoxGeometry(0.44, 0.008, 0.3), mat.cream, [0, 0.008, 0]);
  add(group, new THREE.BoxGeometry(0.44, 0.004, 0.012), mat.olive, [0, 0.014, 0.12]);
  const flapGeo = new THREE.BoxGeometry(0.44, 0.008, 0.14);
  flapGeo.translate(0, 0, -0.07);
  const flap = add(group, flapGeo, mat.cream, [0, 0.014, 0.02], [0.48, 0, 0]);
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.01, 18), mat.terracotta);
  seal.position.set(0.05, 0.01, -0.07);
  seal.castShadow = true;
  flap.add(seal);
  return group;
}

const BUILD = { key: buildKey, letter: buildLetter, ledger: buildLedger };

function lineTexture(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#F3E6D4";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const fitted = (size) => {
    g.font = `500 ${size}px "Space Grotesk", sans-serif`;
    return g.measureText(text).width;
  };
  let size = 132;
  const width = fitted(size);
  if (width > canvas.width - 96) size = Math.floor(size * ((canvas.width - 96) / width));
  fitted(size);
  g.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function seat(group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y += 0.012 - box.min.y;
  const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
  return Math.max(size.x, size.z) * 0.5;
}

function placeCaption(piece, scene) {
  const outX = Math.sin(piece.angle);
  const outZ = Math.cos(piece.angle);
  const holder = new THREE.Group();
  const radius = RING + piece.solid + 0.28;
  holder.position.set(outX * radius, 0, outZ * radius);
  // Yaw first, then the child lies flat, so the line's top points at the mark.
  holder.rotation.y = Math.atan2(outX, outZ);
  const caption = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.28),
    new THREE.MeshBasicMaterial({
      map: lineTexture(piece.line),
      transparent: true,
      depthWrite: false,
      opacity: 0,
      toneMapped: true,
    }),
  );
  caption.name = `${piece.id}-line`;
  caption.rotation.x = -Math.PI / 2;
  caption.position.y = 0.06;
  holder.add(caption);
  scene.add(holder);
  return caption;
}

export function buildPieces(scene, { reduced = false, live = null } = {}) {
  const mat = {
    teal: stone(SWATCH.teal, 0.46),
    cream: stone(SWATCH.cream, 0.55),
    olive: stone(SWATCH.olive, 0.5),
    terracotta: stone(SWATCH.terracotta, 0.52),
    umber: stone(SWATCH.umber, 0.48, 0.08),
  };

  const pieces = LAYOUT.map((spec) => {
    const group = BUILD[spec.id](mat);
    group.name = spec.id;
    group.scale.setScalar(SCALE);
    group.position.set(Math.sin(spec.angle) * RING, 0, Math.cos(spec.angle) * RING);
    group.rotation.y = spec.yaw;
    scene.add(group);
    const solid = seat(group);
    const piece = { ...spec, group, solid, x: group.position.x, z: group.position.z };
    piece.caption = placeCaption(piece, scene);
    return piece;
  });

  let speaking = null;

  return {
    pieces,
    solids: pieces.map((piece) => ({
      x: piece.x,
      z: piece.z,
      radius: piece.solid + BODY,
    })),
    update(dt, player) {
      let best = null;
      let bestD = Infinity;
      for (const piece of pieces) {
        const d = Math.hypot(player.x - piece.x, player.z - piece.z);
        if (d < bestD) {
          best = piece;
          bestD = d;
        }
      }
      const near = best && bestD < REACH ? best : null;
      const step = reduced ? 1 : 1 - Math.exp(-dt * 6);
      for (const piece of pieces) {
        const target = piece === near ? 1 - THREE.MathUtils.smoothstep(bestD, SHOW, REACH) : 0;
        const material = piece.caption.material;
        material.opacity += (target - material.opacity) * step;
      }
      const next = near && bestD < SHOW + 0.85 ? near : null;
      if (next !== speaking) {
        speaking = next;
        if (live) live.textContent = next ? next.line : "";
      }
    },
  };
}
