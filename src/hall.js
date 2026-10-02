import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Walk limits are the inside of the piers and end walls, minus a body radius.
export const HALL = {
  minX: -11.05,
  maxX: 11.05,
  minZ: -26.2,
  maxZ: 32.2,
  plinthR: 5.45,
  eye: 1.64,
};

const WALL_X = 13.15;
const Z0 = -28.4;
const Z1 = 34.2;
const HEIGHT = 14.6;
const PLINTH_H = 0.22;

const SWATCH = [
  { name: "teal", color: 0x2c4c57, rough: 0.44 },
  { name: "cream", color: 0xe8cbb0, rough: 0.58 },
  { name: "olive", color: 0x847e64, rough: 0.5 },
  { name: "terracotta", color: 0xae593c, rough: 0.52 },
  { name: "umber", color: 0x513e30, rough: 0.42 },
];

const NIGHT = 0x0b0a09;

function stone(color, roughness, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function etch(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 320;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#F3E6D4";
  g.font = '500 168px "Space Grotesk", sans-serif';
  g.textBaseline = "middle";
  const chars = [...text];
  const gap = 28;
  const widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let x = (canvas.width - total) / 2;
  const y = canvas.height / 2 + 8;
  for (let i = 0; i < chars.length; i++) {
    g.fillText(chars[i], x, y);
    x += widths[i] + gap;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildHall(scene) {
  scene.background = new THREE.Color(NIGHT);
  scene.fog = new THREE.FogExp2(NIGHT, 0.0048);

  const wallMat = stone(0x2c2722, 0.86, 0.04);
  const pierMat = stone(0x4a433c, 0.4, 0.34);
  const recessMat = stone(0x161310, 0.94, 0);
  const metalMat = stone(0x3d3832, 0.42, 0.4);

  const length = Z1 - Z0;
  const midZ = (Z0 + Z1) / 2;

  const shell = [];
  const sideGeo = new THREE.BoxGeometry(0.55, HEIGHT, length);
  for (const x of [-1, 1]) {
    const wall = new THREE.Mesh(sideGeo, wallMat);
    wall.position.set(x * WALL_X, HEIGHT / 2, midZ);
    shell.push(wall);
  }
  const endGeo = new THREE.BoxGeometry(WALL_X * 2 + 0.55, HEIGHT, 0.55);
  for (const z of [Z0, Z1]) {
    const wall = new THREE.Mesh(endGeo, wallMat);
    wall.position.set(0, HEIGHT / 2, z);
    shell.push(wall);
  }
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(WALL_X * 2 + 0.6, 0.45, length), wallMat);
  ceiling.position.set(0, HEIGHT + 0.2, midZ);
  shell.push(ceiling);
  for (const mesh of shell) {
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // One opaque floor. A second plane, even a centimeter above, z-fights and strobes as the camera moves.
  // rotateX(-π/2) lays the plane's height axis on world Z, so width is X and height is the nave.
  const floor = new Reflector(new THREE.PlaneGeometry(WALL_X * 2 + 8, length + 10), {
    clipBias: 0.02,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0x1a1613,
  });
  floor.rotation.x = -Math.PI / 2;
  floor.material.fragmentShader = floor.material.fragmentShader.replace(
    "gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );",
    "gl_FragColor = vec4( mix( color, base.rgb, 0.22 ), 1.0 );",
  );
  floor.material.needsUpdate = true;
  scene.add(floor);

  const step = new THREE.Mesh(
    new THREE.CylinderGeometry(5.15, 5.35, 0.08, 72),
    stone(0x0e0c0b, 0.55, 0.06),
  );
  step.position.y = 0.04;
  step.receiveShadow = true;
  scene.add(step);

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(4.28, 4.5, PLINTH_H, 72),
    stone(0x161310, 0.36, 0.12),
  );
  plinth.position.y = 0.08 + PLINTH_H / 2;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  scene.add(plinth);

  const arcGeo = new THREE.TorusGeometry(4.08, 0.042, 8, 28, (Math.PI * 2) / 5 - 0.1);
  arcGeo.rotateX(Math.PI / 2);
  SWATCH.forEach((swatch, i) => {
    const arc = new THREE.Mesh(
      arcGeo,
      new THREE.MeshStandardMaterial({
        color: swatch.color,
        roughness: 0.4,
        metalness: 0.05,
        emissive: swatch.color,
        emissiveIntensity: 0.06,
      }),
    );
    arc.rotation.y = (i / 5) * Math.PI * 2 + 0.15;
    arc.position.y = 0.08 + PLINTH_H + 0.02;
    scene.add(arc);
  });

  const pierGeo = new THREE.BoxGeometry(1.12, HEIGHT - 1.15, 0.72);
  const recessGeo = new THREE.PlaneGeometry(4.7, 7.4);
  const slitGeo = new THREE.BoxGeometry(3.15, 0.035, 0.04);
  const pierZs = [];
  for (let z = -22; z <= 28.2; z += 6.25) pierZs.push(z);

  for (const z of pierZs) {
    for (const side of [-1, 1]) {
      const pier = new THREE.Mesh(pierGeo, pierMat);
      pier.position.set(side * (WALL_X - 0.78), (HEIGHT - 1.15) / 2, z);
      pier.castShadow = true;
      pier.receiveShadow = true;
      scene.add(pier);
    }
  }
  for (let i = 0; i < pierZs.length - 1; i++) {
    const z = (pierZs[i] + pierZs[i + 1]) / 2;
    for (const side of [-1, 1]) {
      const recess = new THREE.Mesh(recessGeo, recessMat);
      recess.position.set(side * (WALL_X - 0.34), 4.55, z);
      recess.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
      scene.add(recess);

      const slit = new THREE.Mesh(
        slitGeo,
        new THREE.MeshStandardMaterial({
          color: 0xcbb89a,
          emissive: 0xcbb89a,
          emissiveIntensity: 0.85,
          roughness: 0.35,
        }),
      );
      slit.position.set(side * (WALL_X - 0.62), 7.35, z);
      scene.add(slit);
    }
  }

  const beamGeo = new THREE.BoxGeometry(0.16, 0.42, length - 1.2);
  for (const x of [-6.4, 6.4]) {
    const beam = new THREE.Mesh(beamGeo, metalMat);
    beam.position.set(x, HEIGHT - 0.28, midZ);
    scene.add(beam);
  }
  const crossGeo = new THREE.BoxGeometry(WALL_X * 2 - 1.4, 0.2, 0.14);
  for (const z of pierZs) {
    if (Math.abs(z) < 6.2) continue;
    const cross = new THREE.Mesh(crossGeo, metalMat);
    cross.position.set(0, HEIGHT - 0.34, z);
    scene.add(cross);
  }

  const ringGeo = new THREE.TorusGeometry(5.35, 0.04, 12, 96);
  ringGeo.rotateX(Math.PI / 2);
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshStandardMaterial({
      color: 0xe8cbb0,
      emissive: 0xe8cbb0,
      emissiveIntensity: 1.15,
      roughness: 0.32,
    }),
  );
  ring.position.y = HEIGHT - 0.18;
  scene.add(ring);

  const soffit = new THREE.Mesh(new THREE.CircleGeometry(5.05, 64), stone(0x070605, 0.94));
  soffit.rotation.x = Math.PI / 2;
  soffit.position.y = HEIGHT - 0.05;
  scene.add(soffit);

  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.07, length - 6),
      new THREE.MeshStandardMaterial({
        color: side < 0 ? 0x2c4c57 : 0xe8cbb0,
        emissive: side < 0 ? 0x6d909c : 0xe8cbb0,
        emissiveIntensity: side < 0 ? 0.55 : 0.4,
        roughness: 0.4,
      }),
    );
    strip.position.set(side * (WALL_X - 0.42), HEIGHT - 1.55, midZ);
    scene.add(strip);
  }

  // PlaneGeometry faces +Z. rotation.y of +π/2 turns that normal to +X.
  const labelMat = (text) =>
    new THREE.MeshBasicMaterial({
      map: etch(text),
      transparent: true,
      depthWrite: false,
      toneMapped: true,
    });
  const leftLabel = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.75), labelMat("ARBEITSABLÄUFE"));
  leftLabel.position.set(-(WALL_X - 0.7), 6.15, 7.4);
  leftLabel.rotation.y = Math.PI / 2;
  const rightLabel = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.75), labelMat("VERMARKTUNG"));
  rightLabel.position.set(WALL_X - 0.7, 6.15, 7.4);
  rightLabel.rotation.y = -Math.PI / 2;
  scene.add(leftLabel, rightLabel);

  addDoor(scene, metalMat);

  const hemi = new THREE.HemisphereLight(0x243036, 0x1a120e, 0.22);
  scene.add(hemi);

  const key = new THREE.SpotLight(0xfff3e4, 2400, 32, 0.62, 0.7, 2);
  key.position.set(1.2, 11.4, 7.2);
  key.target.position.set(0, 3.3, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00018;
  key.shadow.normalBias = 0.035;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 26;
  key.shadow.radius = 3;
  scene.add(key, key.target);

  const fill = new THREE.SpotLight(0xb7c6cc, 520, 40, 1.1, 0.85, 2);
  fill.position.set(-7.2, 5.4, 9.5);
  fill.target.position.set(0, 3.2, 0);
  scene.add(fill, fill.target);

  const rim = new THREE.SpotLight(0xd48468, 420, 26, 0.78, 0.6, 2);
  rim.position.set(3.8, 4.6, -8.5);
  rim.target.position.set(0, 3.0, 0);
  scene.add(rim, rim.target);

  const rake = new THREE.SpotLight(0xe6d5c0, 680, 70, 0.7, 0.5, 2);
  rake.position.set(-2.4, 10.2, 26);
  rake.target.position.set(-8, 4.5, 2);
  scene.add(rake, rake.target);

  const leftGraze = new THREE.SpotLight(0xe4d9cb, 5200, 42, 0.38, 0.55, 2);
  leftGraze.position.set(-9.2, 7.2, 18);
  leftGraze.target.position.set(-12.4, 3.2, -8);
  scene.add(leftGraze, leftGraze.target);

  const rightGraze = new THREE.SpotLight(0xe4d9cb, 4600, 42, 0.38, 0.55, 2);
  rightGraze.position.set(9.4, 7.2, 16);
  rightGraze.target.position.set(12.4, 3.2, -10);
  scene.add(rightGraze, rightGraze.target);

  const farWall = new THREE.SpotLight(0xd5cbbd, 1600, 48, 0.5, 0.5, 2);
  farWall.position.set(0, 8.5, -6);
  farWall.target.position.set(0, 5, -28);
  scene.add(farWall, farWall.target);

  return { floor };
}

function addDoor(scene, metalMat) {
  const z = Z1 - 0.55;
  const jamb = new THREE.BoxGeometry(0.28, 4.7, 0.36);
  for (const x of [-1.85, 1.85]) {
    const mesh = new THREE.Mesh(jamb, metalMat);
    mesh.position.set(x, 2.35, z);
    scene.add(mesh);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.28, 0.36), metalMat);
  lintel.position.set(0, 4.75, z);
  scene.add(lintel);
  const threshold = new THREE.Mesh(
    new THREE.BoxGeometry(3.3, 0.025, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xe8cbb0,
      emissive: 0xe8cbb0,
      emissiveIntensity: 0.45,
      roughness: 0.4,
    }),
  );
  threshold.position.set(0, 0.04, z - 0.15);
  scene.add(threshold);
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
