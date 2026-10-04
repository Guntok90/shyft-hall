import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// World XZ, Y up. The hall sits on a flat pad. Animal noses point local +Z,
// so Object3D.lookAt faces them along their travel (lookAt aims +Z).

const LAKE = { x: 36, z: 6, rx: 13, rz: 9 };
const WATER_Y = -0.22;
const GROUND = 320;
const STREAM = [
  [27, 20],
  [31, 14],
  [35, 9],
];

const wind = { value: 0 };
const grazers = [];
const ducks = [];
const birds = [];
const clouds = [];
let waterMat = null;
let ready = false;
let treeCount = 0;

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth(edge0, edge1, value) {
  return THREE.MathUtils.smoothstep(value, edge0, edge1);
}

function padMask(x, z) {
  const ax = Math.abs(x);
  const hall = (1 - smooth(16, 32, ax)) * (1 - smooth(36, 62, Math.abs(z - 3)));
  const approach = (1 - smooth(5.5, 12, ax)) * (1 - smooth(6, 26, Math.abs(z - 64)));
  return Math.max(hall, approach);
}

function ellipse(x, z, spot) {
  return Math.hypot((x - spot.x) / spot.rx, (z - spot.z) / spot.rz);
}

function lakeMask(x, z) {
  return 1 - smooth(0.55, 1.08, ellipse(x, z, LAKE));
}

function distToSeg(x, z, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = dx * dx + dz * dz || 1;
  const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / len, 0, 1);
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

function streamMask(x, z) {
  let best = Infinity;
  for (let i = 0; i < STREAM.length - 1; i++) best = Math.min(best, distToSeg(x, z, STREAM[i], STREAM[i + 1]));
  return 1 - smooth(0.35, 2.1, best);
}

function shaped(x, z) {
  let h = Math.sin(x * 0.031 + 1.2) * Math.cos(z * 0.027) * 1.05;
  h += Math.sin(x * 0.012 - z * 0.015) * 2.1;
  const rim = Math.hypot(x * 0.82, (z - 6) * 0.68);
  h += smooth(52, 140, rim) * 8;
  return -0.05 + h;
}

function terrainHeight(x, z, cut = true) {
  let h = THREE.MathUtils.lerp(shaped(x, z), -0.05, padMask(x, z));
  if (!cut) return h;
  h -= lakeMask(x, z) * 1.25;
  h -= streamMask(x, z) * 0.34;
  return h;
}

function blocked(x, z) {
  if (Math.abs(x) < 16.8 && z > -33 && z < 44) return true;
  if (Math.abs(x) < 8.5 && z > 36 && z < 86) return true;
  if (ellipse(x, z, LAKE) < 1.02) return true;
  if (streamMask(x, z) > 0.45) return true;
  return false;
}

function paintGeometry(geo, color) {
  const c = new THREE.Color(color);
  const colors = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < geo.attributes.position.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

function cone(radius, height, color, x, y, z) {
  const geo = new THREE.ConeGeometry(radius, height, 7);
  geo.translate(x, y + height / 2, z);
  return paintGeometry(geo, color);
}

function trunk(top, bottom, height, color, x, y, z) {
  const geo = new THREE.CylinderGeometry(top, bottom, height, 6);
  geo.translate(x, y + height / 2, z);
  return paintGeometry(geo, color);
}

function blob(radius, color, x, y, z, sx = 1, sy = 1, sz = 1) {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  geo.scale(sx, sy, sz);
  geo.translate(x, y, z);
  return paintGeometry(geo, color);
}

function merge(parts) {
  const triangles = parts.map((geo) => (geo.index ? geo.toNonIndexed() : geo));
  const geo = mergeGeometries(triangles, false);
  if (!geo) throw new Error("tree parts could not be merged");
  geo.computeVertexNormals();
  return geo;
}

function spruceGeo(spread) {
  const parts = [trunk(0.1, 0.18, 1.7, 0x6a5344, 0, 0, 0)];
  for (let i = 0; i < 6; i++) {
    const y = 0.7 + i * 1.05;
    const radius = spread * (1.15 - i * 0.15);
    parts.push(cone(radius, 1.65, i % 2 ? 0x1d4632 : 0x2c5a3e, 0, y, 0));
    parts.push(cone(radius * 0.62, 1.15, 0x3d6b48, spread * 0.12, y + 0.35, 0.08));
  }
  return merge(parts);
}

function larchGeo() {
  const parts = [trunk(0.07, 0.13, 2.4, 0x7a624c, 0, 0, 0)];
  for (let i = 0; i < 7; i++) {
    const y = 1.3 + i * 0.85;
    const radius = 0.95 - i * 0.1;
    parts.push(cone(radius, 1.15, i % 2 ? 0xa3a24a : 0xc4ae5c, 0, y, 0));
  }
  parts.push(cone(0.18, 0.7, 0xd7c56a, 0, 7.1, 0));
  return merge(parts);
}

function beechGeo() {
  const parts = [
    trunk(0.14, 0.24, 2.2, 0x6e5846, 0, 0, 0),
    trunk(0.08, 0.12, 1.4, 0x75604c, 0.28, 1.7, 0.1),
    trunk(0.07, 0.1, 1.2, 0x75604c, -0.22, 1.6, -0.12),
  ];
  const crowns = [
    [0, 3.5, 0, 1.55, 0.9],
    [0.9, 3.15, 0.35, 1.15, 0.8],
    [-0.85, 3.05, -0.2, 1.05, 0.75],
    [0.2, 3.7, -0.7, 0.95, 0.7],
    [-0.15, 2.7, 0.75, 0.9, 0.65],
  ];
  for (const [x, y, z, r, sy] of crowns) {
    parts.push(blob(r, 0x4f7d3e, x, y, z, 1, sy, 1));
    parts.push(blob(r * 0.55, 0x6e9a52, x, y + 0.35, z, 1, 0.7, 1));
  }
  return merge(parts);
}

function birchGeo() {
  const bark = new THREE.CylinderGeometry(0.08, 0.13, 3.3, 7, 12);
  bark.translate(0, 1.65, 0);
  const pos = bark.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const light = new THREE.Color(0xf2efe8);
  const mark = new THREE.Color(0x2a2622);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const band = Math.sin(pos.getY(i) * 10.5) > 0.78 ? 0.9 : 0;
    tmp.copy(light).lerp(mark, band);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  bark.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const parts = [bark];
  const crowns = [
    [0.15, 4.15, 0, 1.05],
    [-0.55, 3.7, 0.2, 0.8],
    [0.6, 3.55, -0.15, 0.75],
    [0, 4.55, 0.1, 0.62],
  ];
  for (const [x, y, z, r] of crowns) parts.push(blob(r, 0x8fb56a, x, y, z, 1, 0.72, 1));
  return merge(parts);
}

function windMaterial(opts) {
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xffffff,
    vertexColors: !!opts.vertexColors,
    roughness: opts.roughness ?? 0.86,
    metalness: 0,
    side: opts.side ?? THREE.FrontSide,
  });
  const lift0 = (opts.lift0 ?? 0.4).toFixed(3);
  const lift1 = (opts.lift1 ?? 3.4).toFixed(3);
  const amp = (opts.amp ?? 0.12).toFixed(3);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float phase = instanceMatrix[3].x * 0.17 + instanceMatrix[3].z * 0.11;
        #else
          float phase = 0.0;
        #endif
        float lift = smoothstep(${lift0}, ${lift1}, transformed.y);
        float gust = sin(uWind * 1.2 + phase) * 0.7 + sin(uWind * 0.46 + phase * 1.7) * 0.3;
        transformed.x += gust * ${amp} * lift;
        transformed.z += gust * ${amp} * 0.62 * lift;`,
      );
  };
  return mat;
}

function instances(geo, material, items) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geo, material, items.length);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  items.forEach((item, i) => {
    dummy.position.set(item.x, terrainHeight(item.x, item.z), item.z);
    dummy.rotation.set(item.lean || 0, item.rot || 0, item.tilt || 0);
    dummy.scale.setScalar(item.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    tint.setRGB(item.tint, item.tint, item.tint);
    mesh.setColorAt(i, tint);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}

function collectTrees() {
  const rand = mulberry32(19);
  const trees = {
    spruce: [],
    spruceWide: [],
    larch: [],
    beech: [],
    birch: [],
  };
  const heroes = [
    ["beech", -20.5, -10, 1.35],
    ["birch", -18.6, 3.5, 1.2],
    ["beech", -22.4, 16, 1.25],
    ["spruce", -34, -18, 1.3],
    ["birch", -37, 15, 1.1],
    ["larch", -44, -2, 1.25],
    ["spruceWide", -41, 24, 1.35],
    ["beech", -29, 28, 1.15],
    ["birch", 23.5, -4, 1.15],
    ["beech", 22.2, 18, 1.3],
    ["larch", 27, 24, 1.2],
    ["spruce", 52, 16, 1.45],
    ["spruceWide", 54, -10, 1.35],
    ["birch", 21.6, 8, 1.05],
    ["larch", -18.8, -22, 1.15],
    ["spruce", 20.5, -20, 1.2],
  ];
  for (const [kind, x, z, scale] of heroes) {
    if (blocked(x, z)) continue;
    trees[kind].push({ x, z, scale, rot: rand() * 6.28, lean: (rand() - 0.5) * 0.06, tint: 0.9 + rand() * 0.18 });
  }
  const placed = Object.values(trees).flat();
  for (let i = 0; i < 92; i++) {
    const x = (rand() * 2 - 1) * 108;
    const z = -95 + rand() * 200;
    if (blocked(x, z)) continue;
    if (Math.hypot(x, z - 4) < 20) continue;
    let crowded = false;
    for (const tree of placed) {
      const gap = 5.2 * Math.max(0.8, tree.scale);
      if (Math.hypot(tree.x - x, tree.z - z) < gap) {
        crowded = true;
        break;
      }
    }
    if (crowded) continue;
    const far = Math.hypot(x, z) > 58;
    const roll = rand();
    let kind = "spruce";
    if (far) kind = roll > 0.72 ? "larch" : roll > 0.4 ? "spruceWide" : "spruce";
    else if (x > 18) kind = roll > 0.55 ? "birch" : roll > 0.3 ? "larch" : "spruce";
    else kind = roll > 0.62 ? "beech" : roll > 0.34 ? "birch" : "spruce";
    const item = {
      x,
      z,
      scale: (far ? 1.15 : 0.9) + rand() * 0.55,
      rot: rand() * 6.28,
      lean: (rand() - 0.5) * 0.08,
      tint: 0.86 + rand() * 0.22,
    };
    trees[kind].push(item);
    placed.push(item);
  }
  return trees;
}

function addTrees(parent) {
  const trees = collectTrees();
  const leaf = windMaterial({ vertexColors: true, roughness: 0.84, amp: 0.14 });
  const specs = [
    [spruceGeo(1.15), trees.spruce],
    [spruceGeo(1.55), trees.spruceWide],
    [larchGeo(), trees.larch],
    [beechGeo(), trees.beech],
    [birchGeo(), trees.birch],
  ];
  for (const [geo, items] of specs) {
    treeCount += items.length;
    const mesh = instances(geo, leaf, items);
    if (mesh) parent.add(mesh);
  }
}

function addMeadow(parent) {
  const rand = mulberry32(41);
  const grass = [];
  const flowers = { cream: [], gold: [], clay: [], white: [] };
  const keys = Object.keys(flowers);
  for (let i = 0; i < 680; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const x = side * (17.2 + rand() * 28);
    const z = -34 + rand() * 78;
    if (blocked(x, z)) continue;
    if (padMask(x, z) > 0.92 && Math.abs(x) < 14) continue;
    grass.push({
      x,
      z,
      scale: 0.7 + rand() * 0.8,
      rot: rand() * 6.28,
      tint: 0.92 + rand() * 0.16,
    });
    if (rand() > 0.72) {
      flowers[keys[i % 4]].push({
        x: x + (rand() - 0.5) * 0.8,
        z: z + (rand() - 0.5) * 0.8,
        scale: 0.7 + rand() * 0.5,
        rot: rand() * 6,
        tint: 1,
      });
    }
  }
  const blade = new THREE.PlaneGeometry(0.16, 0.52);
  blade.translate(0, 0.26, 0);
  const blades = [blade];
  for (let i = 1; i < 3; i++) {
    const copy = blade.clone();
    copy.rotateY((i / 3) * Math.PI);
    blades.push(copy);
  }
  const tuft = merge(blades.map((geo) => iTone(geo)));
  parent.add(instances(tuft, windMaterial({
    vertexColors: true,
    roughness: 0.9,
    side: THREE.DoubleSide,
    lift0: 0.02,
    lift1: 0.45,
    amp: 0.08,
  }), grass));

  const flowerGeo = {
    cream: flower(0xf0e2cf),
    gold: flower(0xe2c15a),
    clay: flower(0xc46a45),
    white: flower(0xf7f4ee),
  };
  const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
  for (const key of keys) {
    const mesh = instances(flowerGeo[key], flowerMat, flowers[key]);
    if (mesh) parent.add(mesh);
  }
}

function iTone(geo) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const low = new THREE.Color(0x3d6834);
  const high = new THREE.Color(0xa4c46e);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    tmp.copy(low).lerp(high, THREE.MathUtils.clamp(pos.getY(i) / 0.52, 0, 1));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

function flower(color) {
  return merge([
    trunk(0.012, 0.016, 0.28, 0x4d7338, 0, 0, 0),
    blob(0.07, color, 0, 0.32, 0, 1, 0.7, 1),
  ]);
}

function addShore(parent) {
  const rand = mulberry32(73);
  const reeds = [];
  const rocks = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2 + rand() * 0.2;
    const e = 0.96 + rand() * 0.12;
    const x = LAKE.x + Math.cos(a) * LAKE.rx * e;
    const z = LAKE.z + Math.sin(a) * LAKE.rz * e;
    if (Math.abs(x) < 18) continue;
    reeds.push({ x, z, scale: 0.8 + rand() * 0.7, rot: rand() * 6, tint: 0.9 + rand() * 0.15 });
    if (i % 3 === 0) rocks.push({ x, z: z + 0.4, scale: 0.28 + rand() * 0.35, rot: rand() * 4, tilt: rand(), lean: rand(), tint: 0.85 + rand() * 0.2 });
  }
  const reed = new THREE.ConeGeometry(0.07, 0.95, 4);
  reed.translate(0, 0.48, 0);
  paintGeometry(reed, 0x3f6a38);
  parent.add(instances(reed, windMaterial({ vertexColors: true, lift0: 0.05, lift1: 0.8, amp: 0.06 }), reeds));
  const rock = new THREE.DodecahedronGeometry(1, 0);
  paintGeometry(rock, 0x8a847c);
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.04 });
  parent.add(instances(rock, rockMat, rocks));

  const padMat = new THREE.MeshStandardMaterial({ color: 0x3e7a48, roughness: 0.7, metalness: 0 });
  const pad = new THREE.CircleGeometry(0.55, 8);
  pad.rotateX(-Math.PI / 2);
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2;
    const mesh = new THREE.Mesh(pad, padMat);
    mesh.position.set(LAKE.x + Math.cos(a) * 4.5, WATER_Y + 0.035, LAKE.z + Math.sin(a) * 3);
    mesh.scale.setScalar(0.7 + rand() * 0.6);
    parent.add(mesh);
  }
}

function addTerrain(parent) {
  const geo = new THREE.PlaneGeometry(GROUND, GROUND, 120, 120);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x8eae78);
  const deep = new THREE.Color(0x5d8648);
  const dry = new THREE.Color(0xc5c4a4);
  const stone = new THREE.Color(0x8d877e);
  const pine = new THREE.Color(0x35563a);
  const sand = new THREE.Color(0xd9d0b8);
  const bed = new THREE.Color(0x1a4e52);
  const path = new THREE.Color(0xe4dfd6);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = terrainHeight(x, z);
    pos.setY(i, y);
    const dapple = 0.5 + 0.5 * Math.sin(x * 0.17) * Math.cos(z * 0.13);
    tmp.copy(grass).lerp(deep, dapple * 0.45);
    const high = smooth(2.2, 7.5, y);
    tmp.lerp(pine, smooth(1.2, 3.4, y) * 0.55);
    tmp.lerp(stone, high);
    if (Math.abs(x) < 7 && z > 34) tmp.lerp(path, (1 - smooth(4, 9, Math.abs(x))) * smooth(36, 48, z));
    const shore = lakeMask(x, z);
    if (shore > 0.05 && shore < 0.65) tmp.lerp(sand, 0.55);
    if (shore > 0.7) tmp.lerp(bed, 0.8);
    if (streamMask(x, z) > 0.4) tmp.lerp(sand, 0.45);
    if (y > 5) tmp.lerp(dry, 0.25);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
  }));
  mesh.receiveShadow = false;
  mesh.name = "valley";
  parent.add(mesh);
}

function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x0e4c56) },
      uShallow: { value: new THREE.Color(0x3e9aa4) },
      uSky: { value: new THREE.Color(0xd5e6f4) },
    },
    transparent: true,
    depthWrite: true,
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec3 p = position;
        float w = sin(p.x * 0.45 + uTime * 0.9) * cos(p.z * 0.38 - uTime * 0.7);
        p.y += w * 0.045;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * vec3(-w * 0.04, 1.0, w * 0.03));
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSky;
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.4);
        float spark = 0.5 + 0.5 * sin(vWorld.x * 1.4 + vWorld.z * 1.1 + uTime * 1.3);
        vec3 col = mix(uDeep, uShallow, 0.25 + spark * 0.28);
        col = mix(col, uSky, fres * 0.42);
        gl_FragColor = vec4(col, 0.94);
      }
    `,
  });
}

function addWater(parent) {
  waterMat = makeWaterMaterial();
  const lake = new THREE.CircleGeometry(1, 56);
  lake.rotateX(-Math.PI / 2);
  lake.scale(LAKE.rx * 0.98, 1, LAKE.rz * 0.98);
  const surface = new THREE.Mesh(lake, waterMat);
  surface.position.set(LAKE.x, WATER_Y, LAKE.z);
  surface.renderOrder = 1;
  surface.name = "tarn";
  parent.add(surface);

  const ribbon = [];
  const width = 1.35;
  for (let i = 0; i < STREAM.length - 1; i++) {
    const a = STREAM[i];
    const b = STREAM[i + 1];
    const steps = 8;
    for (let s = 0; s <= steps; s++) {
      if (i > 0 && s === 0) continue;
      const t = s / steps;
      const x = THREE.MathUtils.lerp(a[0], b[0], t);
      const z = THREE.MathUtils.lerp(a[1], b[1], t);
      if (ellipse(x, z, LAKE) < 0.92) continue;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len;
      const pz = dx / len;
      const y = terrainHeight(x, z, false) - 0.16;
      ribbon.push(x + px * width, y, z + pz * width, x - px * width, y, z - pz * width);
    }
  }
  if (ribbon.length >= 12) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(ribbon, 3));
    const count = ribbon.length / 6;
    const index = [];
    for (let i = 0; i < count - 1; i++) {
      const o = i * 2;
      index.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
    geo.setIndex(index);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, waterMat);
    mesh.renderOrder = 1;
    parent.add(mesh);
  }
}

function alpGeometry(length, depth, peak, seed) {
  const rand = mulberry32(seed);
  const segments = 72;
  const rows = 20;
  const ridge = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const envelope = Math.sin(t * Math.PI);
    const n = Math.abs(Math.sin(i * 0.53 + seed) + 0.55 * Math.sin(i * 1.31 + seed * 1.7));
    ridge.push(Math.pow(n, 1.05) * (0.62 + rand() * 0.7) * envelope);
  }
  const geo = new THREE.PlaneGeometry(length, depth, segments, rows);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const snow = new THREE.Color(0xf4f7fb);
  const rock = new THREE.Color(0x7e7872);
  const pine = new THREE.Color(0x2a4632);
  const shade = new THREE.Color(0x5c5854);
  const tmp = new THREE.Color();
  let maxH = 0;
  for (let i = 0; i <= segments; i++) maxH = Math.max(maxH, ridge[i]);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const u = THREE.MathUtils.clamp(x / length + 0.5, 0, 1);
    const v = z / depth + 0.5;
    const sample = ridge[Math.round(u * segments)] / (maxH || 1);
    const across = Math.pow(Math.max(0, Math.cos((v - 0.5) * Math.PI)), 1.25);
    const h = across * sample * peak;
    pos.setY(i, h);
    const snowLine = peak * 0.6;
    if (h > snowLine) tmp.copy(rock).lerp(snow, (h - snowLine) / (peak * 0.4));
    else if (h > peak * 0.22) tmp.copy(pine).lerp(rock, (h - peak * 0.22) / (peak * 0.38));
    else tmp.copy(pine);
    if (v > 0.55) tmp.lerp(shade, 0.28);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function addMountains(parent) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.02 });
  const ridges = [
    { geo: alpGeometry(210, 78, 54, 3), x: 0, z: -112, rot: 0.18 },
    { geo: alpGeometry(230, 70, 42, 8), x: 118, z: 8, rot: Math.PI / 2 },
    { geo: alpGeometry(220, 66, 46, 13), x: -122, z: -6, rot: -Math.PI / 2 },
    { geo: alpGeometry(80, 40, 38, 21), x: 52, z: 96, rot: 0.2 },
    { geo: alpGeometry(76, 38, 36, 29), x: -54, z: 94, rot: -0.15 },
  ];
  for (const ridge of ridges) {
    const mesh = new THREE.Mesh(ridge.geo, mat);
    mesh.position.set(ridge.x, -1.5, ridge.z);
    mesh.rotation.y = ridge.rot;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
  }
}

function addSkyLife(parent) {
  const puff = new THREE.MeshStandardMaterial({
    color: 0xf7f8fb,
    roughness: 1,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  const rand = mulberry32(101);
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Group();
    const blobs = 4 + Math.floor(rand() * 3);
    for (let b = 0; b < blobs; b++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), puff);
      mesh.position.set((rand() - 0.5) * 7, (rand() - 0.4) * 1.6, (rand() - 0.5) * 3.5);
      mesh.scale.set(2.2 + rand() * 2.4, 0.7 + rand() * 0.5, 1.4 + rand());
      cloud.add(mesh);
    }
    cloud.position.set(-120 + rand() * 240, 24 + rand() * 18, -90 + rand() * 170);
    cloud.userData.speed = 1.1 + rand() * 0.8;
    parent.add(cloud);
    clouds.push(cloud);
  }
}

function makeGrazer(kind, antlers) {
  const hare = kind === "hare";
  const group = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: hare ? 0xb08a62 : 0x8d6844, roughness: 0.74 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a3424, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), hide);
  body.scale.set(0.72, 0.78, 1.45);
  body.position.y = 0.78;
  group.add(body);
  const neck = new THREE.Group();
  neck.position.set(0, 0.86, 0.28);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.28, 6), hide);
  neckMesh.position.set(0, 0.12, 0.06);
  neckMesh.rotation.x = 0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), hide);
  head.scale.set(0.85, 0.8, 1.25);
  head.position.set(0, 0.24, 0.16);
  neck.add(neckMesh, head);
  if (hare) {
    for (const sign of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.02), hide);
      ear.position.set(sign * 0.05, 0.4, 0.12);
      ear.rotation.z = sign * -0.15;
      neck.add(ear);
    }
  } else if (antlers) {
    for (const sign of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.26, 4), dark);
      beam.position.set(sign * 0.06, 0.4, 0.1);
      beam.rotation.z = sign * 0.35;
      const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.12, 3), dark);
      tine.position.set(sign * 0.12, 0.46, 0.08);
      tine.rotation.z = sign * 1.15;
      neck.add(beam, tine);
    }
  }
  group.add(neck);
  const legs = [];
  for (const [x, z] of [[-0.1, 0.18], [0.1, 0.18], [-0.1, -0.2], [0.1, -0.2]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.64, z);
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.58, 5), dark);
    limb.position.y = -0.28;
    pivot.add(limb);
    group.add(pivot);
    legs.push(pivot);
  }
  group.scale.setScalar(hare ? 0.48 : 1);
  group.userData.parts = { neck, legs };
  return group;
}

function makeDuck() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a5e34, roughness: 0.68 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x1c6b48, roughness: 0.5 });
  const billMat = new THREE.MeshStandardMaterial({ color: 0xe39a2b, roughness: 0.45 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), bodyMat);
  body.scale.set(0.85, 0.62, 1.25);
  body.position.y = 0.16;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), headMat);
  head.position.set(0, 0.28, 0.12);
  const bill = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.11, 5), billMat);
  bill.rotation.x = Math.PI / 2;
  bill.position.set(0, 0.27, 0.22);
  group.add(body, head, bill);
  return group;
}

function makeBird() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2c333a, roughness: 0.55, metalness: 0.08, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), mat);
  body.scale.set(0.65, 0.5, 1.35);
  group.add(body);
  const wings = [];
  for (const sign of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(0.48, 0.14);
    geo.translate(0.24, 0, 0);
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(geo, mat);
    if (sign < 0) mesh.scale.x = -1;
    pivot.add(mesh);
    pivot.position.set(sign * 0.06, 0.02, 0);
    group.add(pivot);
    wings.push(pivot);
  }
  group.userData.wings = wings;
  return group;
}

function addAnimals(parent) {
  const loops = [
    [[-21, -8], [-29, -2], [-36, 8], [-31, 18], [-22, 12], [-19.4, 1]],
    [[-24, 6], [-33, 12], [-40, 4], [-34, -8], [-23, -4]],
  ];
  for (let i = 0; i < 5; i++) {
    const group = makeGrazer("deer", i === 0);
    group.name = `deer-${i}`;
    const points = loops[i % 2].map(([x, z], index) => ({ x: x - (i % 3) * 0.8, z: z + (i - 2) * 1.4, graze: index % 2 === 1 }));
    parent.add(group);
    grazers.push({ group, points, index: i % points.length, pause: 0, speed: 0.42 + (i % 3) * 0.08, gait: i });
    seatGrazer(grazers[grazers.length - 1]);
  }
  for (let i = 0; i < 2; i++) {
    const group = makeGrazer("hare", false);
    group.name = `hare-${i}`;
    const points = [
      [-18.4, -1 + i * 6],
      [-22, 2 + i * 5],
      [-19.2, 6 + i * 4],
      [-17.6, 2 + i * 3],
    ].map(([x, z], index) => ({ x, z, graze: index === 2 }));
    parent.add(group);
    grazers.push({ group, points, index: 0, pause: 0, speed: 1.15, gait: i * 2 });
    seatGrazer(grazers[grazers.length - 1]);
  }
  for (let i = 0; i < 4; i++) {
    const duck = makeDuck();
    duck.name = `duck-${i}`;
    parent.add(duck);
    ducks.push({ mesh: duck, radius: 3.2 + i * 1.1, speed: 0.18 + i * 0.04, phase: i * 1.4 });
  }
  const flocks = [
    { cx: 0, cz: 8, rx: 34, rz: 22, y: 18, speed: 0.22, count: 7 },
    { cx: 30, cz: 4, rx: 16, rz: 10, y: 9.5, speed: 0.35, count: 5 },
  ];
  for (const flock of flocks) {
    for (let i = 0; i < flock.count; i++) {
      const mesh = makeBird();
      mesh.scale.setScalar(flock.y > 14 ? 1.35 : 0.85);
      parent.add(mesh);
      birds.push({ mesh, ...flock, phase: (i / flock.count) * Math.PI * 2 });
    }
  }
}

function seatGrazer(animal) {
  const point = animal.points[animal.index];
  const next = animal.points[(animal.index + 1) % animal.points.length];
  animal.group.position.set(point.x, terrainHeight(point.x, point.z), point.z);
  animal.group.lookAt(next.x, animal.group.position.y, next.z);
}

function addBridge(parent) {
  const x = 30.1;
  const z = 15.2;
  const y = terrainHeight(x, z, false) + 0.08;
  const oak = new THREE.MeshStandardMaterial({ color: 0xc6ad8c, roughness: 0.74 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x6a5344, roughness: 0.8 });
  const deck = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.04, 0.16), oak);
    plank.position.set(0, 0, (i - 2) * 0.2);
    deck.add(plank);
  }
  for (const sign of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1.15), dark);
    rail.position.set(sign * 0.58, 0.28, 0);
    deck.add(rail);
    for (const end of [-0.5, 0.5]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.05), dark);
      post.position.set(sign * 0.58, 0.14, end);
      deck.add(post);
    }
  }
  deck.position.set(x, y, z);
  // Local +X is the span. After rotation.y it lands on (cos θ, 0, -sin θ).
  // Stream runs (4, -6); the span should follow the perpendicular (6, 4).
  deck.rotation.y = Math.atan2(-4, 6);
  deck.name = "bridge";
  parent.add(deck);
}

export function addGrounds(scene) {
  const root = new THREE.Group();
  root.name = "grounds";
  addTerrain(root);
  addWater(root);
  addMountains(root);
  addTrees(root);
  addMeadow(root);
  addShore(root);
  addBridge(root);
  addSkyLife(root);
  addAnimals(root);
  scene.add(root);
  ready = true;
  return root;
}

function stepGrazer(animal, dt) {
  const { group, points } = animal;
  const parts = group.userData.parts;
  if (animal.pause > 0) {
    animal.pause = Math.max(0, animal.pause - dt);
    parts.neck.rotation.x = 0.55;
    for (const leg of parts.legs) leg.rotation.x *= 0.9;
    return;
  }
  parts.neck.rotation.x = 0.12;
  const target = points[animal.index];
  const dx = target.x - group.position.x;
  const dz = target.z - group.position.z;
  const dist = Math.hypot(dx, dz) || 0.0001;
  if (dist < 0.4) {
    if (target.graze) animal.pause = animal.speed > 0.9 ? 0.8 : 2.6;
    animal.index = (animal.index + 1) % points.length;
    return;
  }
  const step = Math.min(dist, animal.speed * dt);
  group.position.x += (dx / dist) * step;
  group.position.z += (dz / dist) * step;
  group.position.y = terrainHeight(group.position.x, group.position.z);
  group.lookAt(target.x, group.position.y, target.z);
  animal.gait += dt * (animal.speed > 0.9 ? 14 : 8);
  parts.legs.forEach((leg, i) => {
    const phase = animal.gait + (i % 2 ? Math.PI : 0) + (i < 2 ? 0 : Math.PI);
    leg.rotation.x = Math.sin(phase) * 0.42;
  });
}

export function updateGrounds(dt, reduced) {
  if (!ready || reduced) return;
  wind.value += dt;
  if (waterMat) waterMat.uniforms.uTime.value = wind.value;
  for (const animal of grazers) stepGrazer(animal, dt);
  for (const duck of ducks) {
    const a = wind.value * duck.speed + duck.phase;
    const x = LAKE.x + Math.cos(a) * duck.radius;
    const z = LAKE.z + Math.sin(a) * duck.radius * 0.72;
    duck.mesh.position.set(x, WATER_Y + 0.02 + Math.sin(wind.value * 2.4 + duck.phase) * 0.015, z);
    duck.mesh.lookAt(LAKE.x + Math.cos(a + 0.2) * duck.radius, duck.mesh.position.y, LAKE.z + Math.sin(a + 0.2) * duck.radius * 0.72);
  }
  for (const bird of birds) {
    const a = wind.value * bird.speed + bird.phase;
    const x = bird.cx + Math.cos(a) * bird.rx;
    const z = bird.cz + Math.sin(a) * bird.rz;
    const y = bird.y + Math.sin(a * 2) * 0.8;
    bird.mesh.position.set(x, y, z);
    const ahead = a + 0.08;
    bird.mesh.lookAt(bird.cx + Math.cos(ahead) * bird.rx, y, bird.cz + Math.sin(ahead) * bird.rz);
    const flap = Math.sin(wind.value * 9 + bird.phase) * 0.65;
    bird.mesh.userData.wings[0].rotation.z = flap;
    bird.mesh.userData.wings[1].rotation.z = -flap;
  }
  for (const cloud of clouds) {
    cloud.position.x += cloud.userData.speed * dt;
    if (cloud.position.x > 150) cloud.position.x = -150;
  }
}

export function groundsSnapshot() {
  return {
    trees: treeCount,
    deer: grazers.filter((animal) => animal.group.name.startsWith("deer")).map((animal) => [
      Math.round(animal.group.position.x * 10) / 10,
      Math.round(animal.group.position.z * 10) / 10,
    ]),
    hares: grazers.filter((animal) => animal.group.name.startsWith("hare")).length,
    ducks: ducks.length,
    birds: birds.length,
    clouds: clouds.length,
  };
}
