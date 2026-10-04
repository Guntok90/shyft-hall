import * as THREE from "three";

// Left gangway deck from shell.js: oak slab centered at (-9.72, 4.58, 4),
// size 4.55 × 0.1 × 44. Top is y 4.63. Inner rail sits at x -7.5.
// The flight occupies the back-left corner and lands on that deck at z -18.
// Walk surfaces below are the same numbers as these meshes.

const DECK_TOP = 4.63;
const RISERS = 26;
const TREADS = 25;
const RISE = DECK_TOP / RISERS;
const TREAD_D = 0.3;
const TOP_Z = -18;
const BOTTOM_Z = TOP_Z - TREADS * TREAD_D;
const STAIR_X0 = -11.02;
const STAIR_X1 = -9.22;
const DECK_X0 = -11.05;
const DECK_X1 = -7.72;
const DECK_Z1 = 25.72;
const STEP = 0.24;

// Seat for the paint siphon. The name stayed so the gangway code did not move.
export const GUN_SPOT = { x: -9.62, z: -14.55, y: DECK_TOP };
export const SIGN_SPOT = { x: -8.42, z: -14.55, y: DECK_TOP };

function onDeck(x, z) {
  if (x < DECK_X0 || x > DECK_X1 || z > DECK_Z1) return false;
  if (x <= STAIR_X1) return z >= TOP_Z;
  return z >= TOP_Z + 0.18;
}

function treadAt(x, z) {
  if (x < STAIR_X0 || x > STAIR_X1 || z < BOTTOM_Z || z >= TOP_Z) return null;
  const i = Math.floor((z - BOTTOM_Z) / TREAD_D) + 1;
  if (i < 1 || i > TREADS) return null;
  return i * RISE;
}

// Highest surface the feet can reach in one step. Null means the move is blocked.
// The flight is solid: a high tread cannot be walked under.
export function footAt(x, z, foot) {
  const tread = treadAt(x, z);
  if (tread !== null) {
    if (tread > foot + STEP || foot - tread > STEP) return null;
    return tread;
  }
  let best = null;
  const heights = onDeck(x, z) ? [0, DECK_TOP] : [0];
  for (const h of heights) {
    if (h > foot + STEP || foot - h > STEP) continue;
    if (best === null || h > best) best = h;
  }
  return best;
}

// Surface to stand on directly. The deck wins over the floor beneath it.
export function standAt(x, z) {
  const tread = treadAt(x, z);
  if (tread !== null) return tread;
  if (onDeck(x, z)) return DECK_TOP;
  return 0;
}

export function levelSolids() {
  return [{ x: SIGN_SPOT.x, z: SIGN_SPOT.z, foot: DECK_TOP, radius: 0.42 }];
}

function signTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 640;
  const g = canvas.getContext("2d");
  g.fillStyle = "#f4efe6";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#1c1612";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = '500 78px "Space Grotesk", sans-serif';
  g.fillText("With great power", 512, 200);
  g.fillText("comes great responsibility.", 512, 310);
  g.font = '400 52px "DM Sans", sans-serif';
  g.fillText("Use wisely.", 512, 455);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function addSlope(scene, geo, material, x) {
  const run = TOP_Z - BOTTOM_Z;
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, DECK_TOP / 2, (BOTTOM_Z + TOP_Z) / 2);
  // Negative pitch lifts the +Z end, which is the top of the flight.
  mesh.rotation.x = -Math.atan2(DECK_TOP, run);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export function addStairs(scene, mats) {
  const { aluminum, oak } = mats;
  const width = STAIR_X1 - STAIR_X0;
  const midX = (STAIR_X0 + STAIR_X1) / 2;
  const treadGeo = new THREE.BoxGeometry(width, 0.05, TREAD_D);
  const treads = new THREE.InstancedMesh(treadGeo, oak, TREADS);
  const dummy = new THREE.Object3D();
  for (let i = 1; i <= TREADS; i++) {
    const z0 = BOTTOM_Z + (i - 1) * TREAD_D;
    dummy.position.set(midX, i * RISE - 0.025, z0 + TREAD_D / 2);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    treads.setMatrixAt(i - 1, dummy.matrix);
  }
  treads.castShadow = true;
  treads.receiveShadow = true;
  treads.name = "stairs";
  scene.add(treads);

  const run = TOP_Z - BOTTOM_Z;
  const slopeLen = Math.hypot(run, DECK_TOP);
  for (const x of [STAIR_X0, STAIR_X1]) {
    addSlope(scene, new THREE.BoxGeometry(0.04, 0.14, slopeLen), aluminum, x);
    const rail = addSlope(scene, new THREE.BoxGeometry(0.028, 0.02, slopeLen + 0.2), aluminum, x);
    rail.position.y += 0.94;
  }

  const postGeo = new THREE.BoxGeometry(0.028, 0.9, 0.028);
  for (let i = 1; i <= TREADS; i += 4) {
    const z0 = BOTTOM_Z + (i - 1) * TREAD_D;
    const z = z0 + TREAD_D / 2;
    const y = i * RISE + 0.45;
    for (const x of [STAIR_X0, STAIR_X1]) {
      const post = new THREE.Mesh(postGeo, aluminum);
      post.position.set(x, y, z);
      post.castShadow = true;
      scene.add(post);
    }
  }

  const glass = new THREE.MeshStandardMaterial({
    color: 0xe9f2f8,
    roughness: 0.04,
    metalness: 0.02,
    transparent: true,
    opacity: 0.14,
    envMapIntensity: 1.8,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const returnWidth = -7.5 - STAIR_X1;
  const returnRail = new THREE.Mesh(new THREE.PlaneGeometry(returnWidth, 0.86), glass);
  returnRail.position.set((STAIR_X1 + -7.5) / 2, DECK_TOP + 0.5, TOP_Z + 0.08);
  returnRail.renderOrder = 2;
  scene.add(returnRail);
  const returnHand = new THREE.Mesh(new THREE.BoxGeometry(returnWidth, 0.022, 0.03), aluminum);
  returnHand.position.set(returnRail.position.x, DECK_TOP + 0.93, TOP_Z + 0.08);
  scene.add(returnHand);

  const endWidth = DECK_X1 - DECK_X0;
  const endRail = new THREE.Mesh(new THREE.PlaneGeometry(endWidth, 0.86), glass);
  endRail.position.set((DECK_X0 + DECK_X1) / 2, DECK_TOP + 0.5, 25.94);
  endRail.renderOrder = 2;
  scene.add(endRail);
  const endHand = new THREE.Mesh(new THREE.BoxGeometry(endWidth, 0.022, 0.03), aluminum);
  endHand.position.set(endRail.position.x, DECK_TOP + 0.93, 25.94);
  scene.add(endHand);

  const sign = new THREE.Group();
  sign.name = "power-sign";
  sign.position.set(SIGN_SPOT.x, DECK_TOP, SIGN_SPOT.z);
  // Plane faces local +Z. Yaw π turns that face toward world −Z, the stair.
  sign.rotation.y = Math.PI;

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.82, 12), aluminum);
  post.position.y = 0.41;
  post.castShadow = true;
  sign.add(post);

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.48, 0.016), aluminum);
  plate.position.set(0, 1.02, 0);
  plate.castShadow = true;
  plate.receiveShadow = true;
  sign.add(plate);

  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.42),
    new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.72, metalness: 0 }),
  );
  card.position.set(0, 1.02, 0.01);
  sign.add(card);
  scene.add(sign);
}
