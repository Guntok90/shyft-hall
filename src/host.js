import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// On the centerline, just outside the plinth, so she stands at the foot of the mark.
// The model faces +Z, toward the door, and a visitor walking in meets the face.
export const HOST = {
  x: 0,
  z: 6.05,
  radius: 0.55,
  front: 1.05,
  half: 1.2,
};

const LINE = "Talk to me about the work.";
const REACH = 3.4;
const SHOW = 2.2;

let voice = null;
let near = false;

// Called with a function when voice chat is ready. T works up close. A click
// on her passes { id: "host", stay, clicked }. stay keeps the line open from
// across the hall until the visitor walks into reach.
export function connectVoice(handler) {
  voice = typeof handler === "function" ? handler : null;
}

export function blockHost(position) {
  const ax = position.x - HOST.x;
  const az = position.z - HOST.z;
  if (ax * ax + az * az < HOST.radius * HOST.radius) {
    const d = Math.hypot(ax, az) || 0.0001;
    position.x = HOST.x + (ax / d) * HOST.radius;
    position.z = HOST.z + (az / d) * HOST.radius;
  }
  // Only her body. Leaving this open toward the back wall throws a visitor
  // standing anywhere on the centerline to the front of this slab.
  const minX = HOST.x - HOST.half;
  const maxX = HOST.x + HOST.half;
  const minZ = HOST.z - HOST.radius;
  const maxZ = HOST.z + HOST.front;
  if (position.x <= minX || position.x >= maxX || position.z <= minZ || position.z >= maxZ) return;
  const penLeft = position.x - minX;
  const penRight = maxX - position.x;
  const penBack = position.z - minZ;
  const penFront = maxZ - position.z;
  const least = Math.min(penLeft, penRight, penBack, penFront);
  if (least === penLeft) position.x = minX;
  else if (least === penRight) position.x = maxX;
  else if (least === penBack) position.z = minZ;
  else position.z = maxZ;
}

function lineTexture(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#F3E6D4";
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = 118;
  g.font = `500 ${size}px "Space Grotesk", sans-serif`;
  const width = g.measureText(text).width;
  if (width > canvas.width - 96) size = Math.floor(size * ((canvas.width - 96) / width));
  g.font = `500 ${size}px "Space Grotesk", sans-serif`;
  g.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function plant(root) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
}

export async function loadHost(scene, { reduced = false, live = null } = {}) {
  const gltf = await new GLTFLoader().loadAsync("/models/attendant.glb");
  const root = gltf.scene;
  let head = null;
  root.traverse((obj) => {
    if (obj.name === "head") head = obj;
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (material && "envMapIntensity" in material) material.envMapIntensity = 0.28;
    }
  });
  root.updateMatrixWorld(true);
  plant(root);
  const rest = head ? head.rotation.clone() : null;

  const group = new THREE.Group();
  group.name = "host";
  group.position.set(HOST.x, 0, HOST.z);
  group.add(root);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.46, 28),
    new THREE.MeshBasicMaterial({ color: 0x070605, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  shadow.userData.noHit = true;
  group.add(shadow);

  const caption = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 0.3),
    new THREE.MeshBasicMaterial({
      map: lineTexture(LINE),
      transparent: true,
      depthWrite: false,
      opacity: 0,
      toneMapped: true,
    }),
  );
  caption.rotation.x = -Math.PI / 2;
  caption.position.set(0, 0.045, 1.45);
  caption.userData.noHit = true;
  group.add(caption);
  scene.add(group);

  const lamp = new THREE.SpotLight(0xfff6ee, 280, 16, 0.9, 0.7, 2);
  lamp.position.set(0.4, 5.6, HOST.z + 4.6);
  lamp.target.position.set(HOST.x, 1.4, HOST.z);
  scene.add(lamp, lamp.target);

  let time = 0;

  return {
    group,
    get near() {
      return near;
    },
    talk() {
      if (!near || !voice) return false;
      voice({ id: "host" });
      return true;
    },
    speak() {
      if (!voice) return false;
      voice({ id: "host", stay: !near, clicked: true });
      return true;
    },
    update(dt, player) {
      time += dt;
      const distance = Math.hypot(player.x - HOST.x, player.z - HOST.z);
      const next = distance < REACH;
      const step = reduced ? 1 : 1 - Math.exp(-dt * 6);
      const shown = next ? 1 - THREE.MathUtils.smoothstep(distance, SHOW, REACH) : 0;
      caption.material.opacity += (shown - caption.material.opacity) * step;
      if (live && next !== near) live.textContent = next ? LINE : "";
      near = next;

      if (!head || reduced) return;
      const dx = player.x - HOST.x;
      const dz = player.z - HOST.z;
      const aim = dz > 0.5 ? THREE.MathUtils.clamp(Math.atan2(dx, dz), -0.4, 0.4) : 0;
      head.rotation.y = THREE.MathUtils.damp(head.rotation.y, rest.y + aim, 3, dt);
      const talking = document.body.classList.contains("talking");
      const rate = talking ? 6.5 : 0.9;
      const nod = talking ? 0.045 : 0.018;
      head.rotation.x = rest.x + Math.sin(time * rate) * nod;
      head.rotation.z = rest.z;
    },
  };
}
