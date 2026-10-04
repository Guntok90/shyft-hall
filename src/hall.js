import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { addShell } from "./shell.js";

// Walk limits are inside the glass, minus a body radius.
export const HALL = {
  minX: -11.05,
  maxX: 11.05,
  minZ: -26.2,
  maxZ: 32.2,
  plinthR: 5.45,
  eye: 1.64,
};

const Z0 = -28.4;
const Z1 = 34.2;
const PLINTH_H = 0.22;

const SWATCH = [
  { name: "teal", color: 0x2c4c57, rough: 0.44 },
  { name: "cream", color: 0xe8cbb0, rough: 0.58 },
  { name: "olive", color: 0x847e64, rough: 0.5 },
  { name: "terracotta", color: 0xae593c, rough: 0.52 },
  { name: "umber", color: 0x513e30, rough: 0.42 },
];

function stone(color, roughness, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: 0.45 });
}

export function buildHall(scene) {
  scene.background = new THREE.Color(0xd7e3f0);
  scene.fog = null;
  scene.add(skyDome());

  const length = Z1 - Z0;
  const midZ = (Z0 + Z1) / 2;
  const aluminum = stone(0xcfd3d6, 0.22, 0.86);
  aluminum.envMapIntensity = 0.9;
  const oak = stone(0xd9c4a4, 0.62, 0.02);
  const plaster = stone(0xf5f3ef, 0.78, 0.01);

  // One floor. A second plane, even a centimeter above, z-fights and strobes.
  // rotateX(-π/2) lays the plane's height axis on world Z, so width is X and height is the nave.
  // Pale stone, with the room still visible in it. Reflector stays 1024.
  const floor = new Reflector(new THREE.PlaneGeometry(28.4, length + 0.8), {
    clipBias: 0.02,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0xd4cfc6,
  });
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, midZ);
  floor.material.fragmentShader = floor.material.fragmentShader.replace(
    "gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );",
    "gl_FragColor = vec4( mix( color, base.rgb, 0.42 ), 1.0 );",
  );
  floor.material.needsUpdate = true;
  scene.add(floor);

  addPlinth(scene);
  addShell(scene, { aluminum, oak, plaster });
  addDaylight(scene);
  return { floor };
}

function skyDome() {
  const radius = 360;
  const geo = new THREE.SphereGeometry(radius, 32, 18);
  const pos = geo.attributes.position;
  const top = new THREE.Color(0x8eb6dc);
  const horizon = new THREE.Color(0xf3f1eb);
  const earth = new THREE.Color(0xd5ddd0);
  const tmp = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / radius;
    if (y > 0) tmp.copy(horizon).lerp(top, Math.min(1, y / 0.5));
    else tmp.copy(horizon).lerp(earth, Math.min(1, -y / 0.25));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false });
  material.toneMapped = false;
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  return mesh;
}

function addPlinth(scene) {
  const step = new THREE.Mesh(new THREE.CylinderGeometry(5.15, 5.35, 0.08, 72), stone(0xe4dfd8, 0.46, 0.04));
  step.position.y = 0.04;
  step.receiveShadow = true;
  scene.add(step);

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.28, 4.5, PLINTH_H, 72), stone(0xf3f1ec, 0.34, 0.05));
  plinth.position.y = 0.08 + PLINTH_H / 2;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  scene.add(plinth);

  const arcGeo = new THREE.TorusGeometry(4.08, 0.035, 8, 28, (Math.PI * 2) / 5 - 0.1);
  arcGeo.rotateX(Math.PI / 2);
  SWATCH.forEach((swatch, i) => {
    const arc = new THREE.Mesh(
      arcGeo,
      new THREE.MeshStandardMaterial({
        color: swatch.color,
        roughness: 0.42,
        metalness: 0.04,
        emissive: swatch.color,
        emissiveIntensity: 0.02,
      }),
    );
    arc.rotation.y = (i / 5) * Math.PI * 2 + 0.15;
    arc.position.y = 0.08 + PLINTH_H + 0.02;
    scene.add(arc);
  });
}

function addDaylight(scene) {
  const hemi = new THREE.HemisphereLight(0xe7eef6, 0xe4ddd2, 0.62);
  scene.add(hemi);

  // One shadow-casting sun. Map stays 2048, PCF soft. The box covers the nave and the host.
  const sun = new THREE.DirectionalLight(0xfff6ec, 2.05);
  sun.position.set(-16, 28, 20);
  sun.target.position.set(0, 1.2, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 3.5;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.05;
  const cam = sun.shadow.camera;
  cam.near = 1;
  cam.far = 80;
  cam.left = -28;
  cam.right = 28;
  cam.top = 36;
  cam.bottom = -36;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0xd5e2f0, 0.38);
  fill.position.set(18, 12, -10);
  fill.target.position.set(0, 2, -4);
  scene.add(fill, fill.target);
}


export async function loadMark(scene) {
  const gltf = await new GLTFLoader().loadAsync("/models/logo.glb");
  const root = gltf.scene;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (/floor/i.test(obj.name)) {
      obj.visible = false;
      return;
    }
    const swatch = SWATCH.find((entry) => obj.name.toLowerCase().includes(entry.name));
    obj.castShadow = true;
    obj.receiveShadow = true;
    if (!swatch) return;
    obj.material = new THREE.MeshStandardMaterial({
      color: swatch.color,
      roughness: swatch.rough,
      metalness: 0,
      envMapIntensity: 0.22,
    });
  });

  // Blender front is -Y. The glTF exporter maps that to +Z.
  const fitted = fitUpright(root, 7.05, PLINTH_H + 0.08);
  const turn = new THREE.Group();
  turn.add(fitted);
  turn.rotation.y = 0.58;
  // Paint on this group is stored in its local space so it spins with the mark.
  turn.userData.stickPaint = true;
  scene.add(turn);
  return turn;
}

function fitUpright(root, targetHeight, floorY) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  root.scale.setScalar(targetHeight / size.y);
  const fitted = new THREE.Box3().setFromObject(root);
  const center = fitted.getCenter(new THREE.Vector3());
  root.position.sub(center);
  const seated = new THREE.Box3().setFromObject(root);
  root.position.y += floorY - seated.min.y;
  return root;
}
