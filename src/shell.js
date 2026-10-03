import * as THREE from "three";

// Same shell as hall.js. Walk point stays inside |x| 11.05 and z -26.2..32.2, eye at 1.64.
// Seats, planters and piers sit outside that point. Galleries hang above y 4.4.
const Z0 = -28.4;
const Z1 = 34.2;
const CEILING = 11.6;
const CURVE = 460;
const MID_Z = (Z0 + Z1) / 2;

function wallX(side, z) {
  const dz = z - MID_Z;
  return side * (13.72 - (dz * dz) / (2 * CURVE));
}

function stone(color, roughness, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: 0.45 });
}

function glassMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xe9f2f8,
    roughness: 0.04,
    metalness: 0.02,
    transparent: true,
    opacity: 0.11,
    envMapIntensity: 1.8,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

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

function boxInstances(geo, material, items, shadow = false) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geo, material, items.length);
  const dummy = new THREE.Object3D();
  items.forEach((item, i) => {
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(item.rx || 0, item.ry || 0, item.rz || 0);
    dummy.scale.set(item.sx ?? 1, item.sy ?? 1, item.sz ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  return mesh;
}

export function addShell(scene, mats) {
  addPark(scene);
  addFloorInlay(scene);
  addCurtain(scene, mats);
  addEnds(scene, mats);
  addCeiling(scene, mats);
  addGalleries(scene, mats);
}

function addFloorInlay(scene) {
  const joint = stone(0xb7b1a6, 0.72, 0.04);
  joint.polygonOffset = true;
  joint.polygonOffsetFactor = -2;
  joint.polygonOffsetUnits = -2;
  const spanZ = Z1 - Z0 - 0.4;
  const spanX = 24.8;
  const lines = [];
  for (let x = -12; x <= 12.01; x += 2.4) {
    lines.push({ x, y: 0.012, z: MID_Z, sx: 0.018, sy: 1, sz: spanZ });
  }
  for (let z = Z0 + 0.6; z <= Z1 - 0.2; z += 2.4) {
    lines.push({ x: 0, y: 0.012, z, sx: spanX, sy: 1, sz: 0.018 });
  }
  const grid = boxInstances(new THREE.BoxGeometry(1, 0.008, 1), joint, lines, false);
  scene.add(grid);

  const border = stone(0xc8c2b6, 0.58, 0.05);
  border.polygonOffset = true;
  border.polygonOffsetFactor = -1;
  border.polygonOffsetUnits = -1;
  const edge = new THREE.BoxGeometry(1, 0.01, 1);
  const borders = [
    { x: -12.15, y: 0.014, z: MID_Z, sx: 0.46, sz: spanZ },
    { x: 12.15, y: 0.014, z: MID_Z, sx: 0.46, sz: spanZ },
    { x: 0, y: 0.014, z: Z0 + 0.7, sx: 24.2, sz: 0.55 },
    { x: 0, y: 0.014, z: Z1 - 0.7, sx: 24.2, sz: 0.55 },
  ];
  scene.add(boxInstances(edge, border, borders, false));

  // A stone frame on the floor in front of the host. Flat, so the eye height never climbs it.
  const court = stone(0xddd6cc, 0.5, 0.06);
  court.polygonOffset = true;
  court.polygonOffsetFactor = -3;
  court.polygonOffsetUnits = -3;
  const courtZ = -23.15;
  scene.add(
    boxInstances(new THREE.BoxGeometry(1, 0.012, 1), court, [
      { x: -3.55, y: 0.016, z: courtZ, sx: 0.07, sz: 6.5 },
      { x: 3.55, y: 0.016, z: courtZ, sx: 0.07, sz: 6.5 },
      { x: 0, y: 0.016, z: -26.35, sx: 7.17, sz: 0.07 },
      { x: 0, y: 0.016, z: -19.95, sx: 7.17, sz: 0.07 },
    ], false),
  );

  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.15, 0.028, 8, 96), joint);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.014;
  scene.add(ring);
}

function addPark(scene) {
  const geo = new THREE.PlaneGeometry(220, 220, 46, 46);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const grass = new THREE.Color(0x8eae78);
  const shade = new THREE.Color(0x5f8a48);
  const path = new THREE.Color(0xe4dfd6);
  const tmp = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    tmp.copy(grass);
    const dapple = 0.5 + 0.5 * Math.sin(x * 0.31) * Math.cos(z * 0.23);
    tmp.lerp(shade, dapple * 0.38);
    if (z > 32 && Math.abs(x) < 9) {
      const fade = 1 - THREE.MathUtils.smoothstep(Math.abs(x), 1.6, 4.2);
      tmp.lerp(path, fade * THREE.MathUtils.smoothstep(z, 32, 40));
    }
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0, vertexColors: true }),
  );
  ground.position.y = -0.05;
  scene.add(ground);

  const terraceMat = stone(0xe7e2d8, 0.62, 0.04);
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.06, 20), terraceMat);
  terrace.position.set(0, -0.02, 45.2);
  terrace.receiveShadow = true;
  scene.add(terrace);
  const runner = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.045, 28), stone(0xddd7cd, 0.7, 0.03));
  runner.position.set(0, -0.01, 70);
  runner.receiveShadow = true;
  scene.add(runner);

  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x3e6a3c, roughness: 0.9, metalness: 0 });
  const hedgeTop = new THREE.MeshStandardMaterial({ color: 0x4f7d45, roughness: 0.86, metalness: 0 });
  const hedges = [];
  const hedgeCaps = [];
  for (const side of [-1, 1]) {
    hedges.push({ x: side * 6.7, y: 0.36, z: 45.4, sx: 0.9, sz: 15.5 });
    hedgeCaps.push({ x: side * 6.7, y: 0.74, z: 45.4, sx: 0.55, sz: 15.5 });
  }
  scene.add(boxInstances(new THREE.BoxGeometry(1, 0.7, 1), hedgeMat, hedges, false));
  scene.add(boxInstances(new THREE.BoxGeometry(1, 0.08, 1), hedgeTop, hedgeCaps, false));

  const rand = mulberry32(11);
  const spots = [];
  for (let i = 0; i < 72; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const x = side * (18 + rand() * 28);
    const z = -58 + rand() * 138;
    if (z > 30 && Math.abs(x) < 14) continue;
    spots.push({ x, z, s: 0.85 + rand() * 0.95, shade: rand(), base: 0 });
  }
  // Six interior trees. Centers sit past the walk limit, on the window line.
  for (const side of [-1, 1]) {
    for (const z of [-16, 6, 26]) spots.push({ x: side * 12.2, z, s: 0.48, shade: 0.35, base: 0.46, indoor: true });
  }

  const lobes = [];
  for (const spot of spots) {
    lobes.push({ ...spot, ox: 0, oz: 0, sc: 1.05 });
    lobes.push({ ...spot, ox: 0.72, oz: 0.22, sc: 0.78, shade: Math.min(1, spot.shade + 0.22) });
    lobes.push({ ...spot, ox: -0.58, oz: -0.42, sc: 0.7, shade: Math.max(0, spot.shade - 0.18) });
    lobes.push({ ...spot, ox: 0.15, oz: -0.7, sc: 0.5, shade: Math.min(1, spot.shade + 0.1) });
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.15, 1, 7), stone(0x8d7560, 0.86, 0), spots.length);
  const crowns = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1.15, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 }),
    lobes.length,
  );
  const dummy = new THREE.Object3D();
  const leaf = new THREE.Color();
  spots.forEach((spot, i) => {
    dummy.position.set(spot.x, spot.base + spot.s * 0.7, spot.z);
    dummy.scale.set(spot.s * 0.85, spot.s * 1.55, spot.s * 0.85);
    dummy.rotation.set(0, spot.shade * 6, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
  });
  lobes.forEach((lobe, i) => {
    const s = lobe.s * lobe.sc;
    dummy.position.set(lobe.x + lobe.ox * lobe.s, lobe.base + lobe.s * 2.25, lobe.z + lobe.oz * lobe.s);
    dummy.scale.set(s, s * 0.78, s);
    dummy.rotation.set(0, lobe.shade * 6, 0);
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
    leaf.set(0x6d9a56).lerp(new THREE.Color(0x3d6a3a), lobe.shade);
    crowns.setColorAt(i, leaf);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  crowns.instanceColor.needsUpdate = true;
  trunks.castShadow = false;
  crowns.castShadow = false;
  scene.add(trunks, crowns);

  const pots = [];
  spots.filter((spot) => spot.indoor).forEach((spot) => {
    pots.push({ x: spot.x, y: 0.22, z: spot.z, sx: 1, sy: 1, sz: 1 });
  });
  scene.add(boxInstances(new THREE.CylinderGeometry(0.42, 0.48, 0.44, 18), stone(0xe6e1d8, 0.5, 0.05), pots, true));

  const shrubs = [];
  const shrubRand = mulberry32(29);
  for (let i = 0; i < 48; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const x = side * (15.5 + shrubRand() * 10);
    const z = -40 + shrubRand() * 95;
    if (Math.abs(x) < 16 && z > 28 && z < 56) continue;
    shrubs.push({ x, y: 0.32, z, sx: 0.45 + shrubRand() * 0.35, sy: 0.28 + shrubRand() * 0.2, sz: 0.45 + shrubRand() * 0.3, ry: shrubRand() * 3 });
  }
  const shrubMesh = boxInstances(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x4d7a40, roughness: 0.9, metalness: 0 }),
    shrubs,
    false,
  );
  scene.add(shrubMesh);
}

function addCurtain(scene, mats) {
  const { aluminum, oak } = mats;
  const panes = 18;
  const positions = [];
  const mullions = [];
  const caps = [];
  const rails = [];
  const seats = [];
  const brackets = [];
  const shoes = [];
  const levels = [3.28, 7.05];
  for (const side of [-1, 1]) {
    for (let i = 0; i < panes; i++) {
      const t0 = i / panes;
      const t1 = (i + 1) / panes;
      const za = Z0 + (Z1 - Z0) * t0;
      const zb = Z0 + (Z1 - Z0) * t1;
      const x0 = wallX(side, za);
      const x1 = wallX(side, zb);
      const y0 = 0.02;
      const y1 = CEILING - 0.08;
      positions.push(x0, y0, za, x1, y0, zb, x1, y1, zb);
      positions.push(x0, y0, za, x1, y1, zb, x0, y1, za);
      const zm = (za + zb) / 2;
      const xm = wallX(side, zm);
      const bay = (zb - za) * 1.02;
      mullions.push({ x: xm - side * 0.02, y: (y0 + y1) / 2, z: zm });
      caps.push({ x: xm + side * 0.1, y: (y0 + y1) / 2, z: zm });
      // Inner lip stays past x 11.05. Narrowest bay is the end, wall about 12.66.
      const seatX = xm - side * 0.28;
      seats.push({ x: seatX, y: 0.46, z: zm, sz: bay * 0.96 });
      brackets.push({ x: xm - side * 0.1, y: 0.24, z: zm });
      shoes.push({ x: xm - side * 0.05, y: 0.012, z: zm, sz: bay });
      for (const y of levels) rails.push({ x: xm - side * 0.05, y, z: zm, sz: bay });
    }
    mullions.push({ x: wallX(side, Z1) - side * 0.02, y: (0.02 + CEILING - 0.08) / 2, z: Z1 });
    caps.push({ x: wallX(side, Z1) + side * 0.1, y: (0.02 + CEILING - 0.08) / 2, z: Z1 });
  }

  const glassGeo = new THREE.BufferGeometry();
  glassGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  glassGeo.computeVertexNormals();
  const glass = new THREE.Mesh(glassGeo, glassMaterial());
  glass.renderOrder = 2;
  glass.castShadow = false;
  scene.add(glass);

  const height = CEILING - 0.2;
  scene.add(boxInstances(new THREE.BoxGeometry(0.16, height, 0.055), aluminum, mullions, true));
  scene.add(boxInstances(new THREE.BoxGeometry(0.04, height, 0.085), aluminum, caps, false));
  scene.add(boxInstances(new THREE.BoxGeometry(0.14, 0.04, 1), aluminum, rails, false));
  scene.add(boxInstances(new THREE.BoxGeometry(0.4, 0.045, 1), oak, seats, true));
  scene.add(boxInstances(new THREE.BoxGeometry(0.025, 0.42, 0.05), aluminum, brackets, false));
  scene.add(boxInstances(new THREE.BoxGeometry(0.14, 0.018, 1), aluminum, shoes, false));

  const plates = [];
  for (const mullion of mullions) {
    for (const y of levels) plates.push({ x: mullion.x, y, z: mullion.z });
  }
  scene.add(boxInstances(new THREE.BoxGeometry(0.07, 0.07, 0.07), aluminum, plates, false));
}

function addEnds(scene, mats) {
  const { aluminum, plaster } = mats;
  const glass = glassMaterial();
  for (const z of [Z0, Z1]) {
    const width = wallX(1, z) * 2 - 0.15;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(width, CEILING - 0.16), glass);
    pane.position.set(0, (CEILING - 0.16) / 2, z);
    pane.renderOrder = 2;
    scene.add(pane);

    const head = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.1, 0.14), aluminum);
    head.position.set(0, CEILING - 0.1, z);
    scene.add(head);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.06, 0.12), aluminum);
    sill.position.set(0, 0.03, z);
    scene.add(sill);

    const uprights = [];
    const bars = [];
    for (let x = -width / 2 + 0.8; x < width / 2 - 0.2; x += 1.6) {
      const inDoor = z === Z1 && Math.abs(x) < 1.7;
      if (inDoor) uprights.push({ x, y: (3.34 + CEILING - 0.2) / 2, z: z - 0.04, sy: (CEILING - 0.2 - 3.34) / (CEILING - 0.24) });
      else uprights.push({ x, y: (CEILING - 0.16) / 2, z: z - 0.04, sy: 1 });
    }
    for (const y of [3.28, 7.05]) {
      bars.push({ x: 0, y, z: z - 0.04, sx: width });
    }
    scene.add(boxInstances(new THREE.BoxGeometry(0.05, CEILING - 0.24, 0.05), aluminum, uprights, false));
    scene.add(boxInstances(new THREE.BoxGeometry(1, 0.04, 0.05), aluminum, bars, false));
  }

  const frameZ = Z1 - 0.08;
  for (const x of [-1.7, 1.7]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.09, 3.34, 0.1), aluminum);
    jamb.position.set(x, 1.67, frameZ);
    scene.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.1, 0.12), aluminum);
  lintel.position.set(0, 3.3, frameZ);
  scene.add(lintel);
  const stile = new THREE.Mesh(new THREE.BoxGeometry(0.04, 3.18, 0.06), aluminum);
  stile.position.set(0, 1.6, frameZ - 0.02);
  scene.add(stile);
  const leafMat = glassMaterial();
  leafMat.opacity = 0.3;
  leafMat.color.set(0xf3f6f8);
  for (const x of [-0.8, 0.8]) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3.12), leafMat);
    leaf.position.set(x, 1.58, frameZ - 0.02);
    leaf.renderOrder = 3;
    scene.add(leaf);
  }
  for (const x of [-0.46, 0.46]) {
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.028, 1.05, 0.028), aluminum);
    pull.position.set(x, 1.22, frameZ - 0.1);
    scene.add(pull);
  }
  const threshold = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.03, 0.42), stone(0xb9b3a8, 0.45, 0.35));
  threshold.position.set(0, 0.02, Z1 - 0.4);
  scene.add(threshold);

  for (const z of [Z0, Z1]) {
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, CEILING, 0.22), plaster);
      post.position.set(wallX(side, z), CEILING / 2, z);
      post.castShadow = true;
      scene.add(post);
    }
  }

  // Piers stand behind the host. Front face stays past the walk limit (z -26.2).
  for (const side of [-1, 1]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.34, 7.5, 0.34), stone(0xe7e2d8, 0.46, 0.05));
    pier.position.set(side * 2.85, 3.91, -26.72);
    pier.castShadow = true;
    pier.receiveShadow = true;
    scene.add(pier);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), stone(0xddd6cc, 0.5, 0.06));
    base.position.set(side * 2.85, 0.07, -26.72);
    scene.add(base);
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.018, 7.2, 0.012), stone(0xc4bdb2, 0.35, 0.4));
    groove.position.set(side * 2.85, 3.9, -26.54);
    scene.add(groove);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.46), aluminum);
    cap.position.set(side * 2.85, 7.68, -26.72);
    scene.add(cap);
  }

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.06, 5.4), aluminum);
  canopy.position.set(0, 3.42, 36.7);
  canopy.castShadow = true;
  scene.add(canopy);
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.18, 0.04), aluminum);
  fascia.position.set(0, 3.3, 39.35);
  scene.add(fascia);
  const wash = new THREE.Mesh(
    new THREE.BoxGeometry(7.2, 0.015, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xf7f4ee, emissive: 0xf4efe6, emissiveIntensity: 1.5, roughness: 0.4 }),
  );
  wash.position.set(0, 3.36, 34.6);
  scene.add(wash);
  for (const side of [-1, 1]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.42, 0.62), aluminum);
    blade.position.set(side * 3.55, 1.71, 38.2);
    blade.castShadow = true;
    scene.add(blade);
  }
}

function addCeiling(scene, mats) {
  const { aluminum, plaster } = mats;
  // Rectangle stays inside the narrowest glass (about 12.66) so the bow reads as a clerestory.
  const halfX = 12.05;
  const zA = Z0 + 1.5;
  const zB = Z1 - 1.5;
  const shape = new THREE.Shape();
  shape.moveTo(-halfX, -zB);
  shape.lineTo(halfX, -zB);
  shape.lineTo(halfX, -zA);
  shape.lineTo(-halfX, -zA);
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, 4.35, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const soffitGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false, curveSegments: 56 });
  // rotateX(-π/2) sends shape (x, y, 0) to (x, 0, -y), so shape y is -worldZ.
  soffitGeo.rotateX(-Math.PI / 2);
  soffitGeo.translate(0, CEILING - 0.16, 0);
  const soffit = new THREE.Mesh(soffitGeo, plaster);
  soffit.receiveShadow = true;
  // A full-nave caster would put the whole floor in shade. The sun stays the light.
  soffit.castShadow = false;
  scene.add(soffit);

  const lip = stone(0xd5d8db, 0.28, 0.8);
  lip.envMapIntensity = 0.9;
  const edgeY = CEILING - 0.08;
  const edgeZ = (zA + zB) / 2;
  scene.add(
    boxInstances(new THREE.BoxGeometry(1, 0.16, 0.04), lip, [
      { x: -halfX, y: edgeY, z: edgeZ, sx: 1, sz: zB - zA },
      { x: halfX, y: edgeY, z: edgeZ, sx: 1, sz: zB - zA },
      { x: 0, y: edgeY, z: zA, sx: halfX * 2, sz: 1 },
      { x: 0, y: edgeY, z: zB, sx: halfX * 2, sz: 1 },
    ], false),
  );

  const coveMat = new THREE.MeshStandardMaterial({
    color: 0xf7f5f0,
    emissive: 0xf3f0e8,
    emissiveIntensity: 1.25,
    roughness: 0.42,
  });
  scene.add(
    boxInstances(new THREE.BoxGeometry(1, 0.025, 0.08), coveMat, [
      { x: -halfX + 0.25, y: CEILING - 0.145, z: edgeZ, sx: 1, sz: zB - zA - 1 },
      { x: halfX - 0.25, y: CEILING - 0.145, z: edgeZ, sx: 1, sz: zB - zA - 1 },
    ], false),
  );

  const recessMat = stone(0xded8d0, 0.7, 0.02);
  const slotMat = new THREE.MeshStandardMaterial({
    color: 0xf8f7f4,
    emissive: 0xf6f3ec,
    emissiveIntensity: 1.8,
    roughness: 0.35,
  });
  const baffles = [];
  const recesses = [];
  const slots = [];
  const runs = [
    { z0: zA + 0.8, z1: -5.15 },
    { z0: 5.15, z1: zB - 0.8 },
  ];
  for (const x of [-7.8, -5.2, -2.6, 2.6, 5.2, 7.8]) {
    for (const run of runs) {
      const len = run.z1 - run.z0;
      const z = (run.z0 + run.z1) / 2;
      baffles.push({ x: x - 0.1, y: CEILING - 0.28, z, sz: len });
      baffles.push({ x: x + 0.1, y: CEILING - 0.28, z, sz: len });
      recesses.push({ x, y: CEILING - 0.15, z, sz: len });
      slots.push({ x, y: CEILING - 0.34, z, sz: len });
    }
  }
  const baffleMat = stone(0xcfc8be, 0.5, 0.12);
  scene.add(boxInstances(new THREE.BoxGeometry(0.02, 0.2, 1), baffleMat, baffles, false));
  scene.add(boxInstances(new THREE.BoxGeometry(0.18, 0.025, 1), recessMat, recesses, false));
  scene.add(boxInstances(new THREE.BoxGeometry(0.07, 0.018, 1), slotMat, slots, false));

  const ringGeo = new THREE.TorusGeometry(4.35, 0.045, 10, 80);
  ringGeo.rotateX(Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, aluminum);
  ring.position.y = CEILING - 0.16;
  scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(4.55, 0.02, 8, 80), aluminum);
  ring2.geometry.rotateX(Math.PI / 2);
  ring2.position.y = CEILING - 0.02;
  scene.add(ring2);

  const drum = new THREE.Mesh(new THREE.CylinderGeometry(4.32, 4.46, 0.62, 64, 1, true), aluminum);
  drum.position.y = CEILING + 0.14;
  drum.material = aluminum.clone();
  drum.material.side = THREE.DoubleSide;
  scene.add(drum);

  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(4.2, 64),
    new THREE.MeshStandardMaterial({
      color: 0xf7f8fa,
      emissive: 0xe7f0f8,
      emissiveIntensity: 0.9,
      roughness: 0.4,
      side: THREE.DoubleSide,
    }),
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.y = CEILING + 0.42;
  scene.add(lens);

  const fins = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    fins.push({
      x: Math.cos(a) * 2.85,
      y: CEILING - 0.36,
      z: Math.sin(a) * 2.85,
      ry: Math.PI / 2 - a,
    });
  }
  // Tops stay under the ring at y 11.44. Outer tips stay inside radius 4.3.
  scene.add(boxInstances(new THREE.BoxGeometry(0.04, 0.2, 1.3), aluminum, fins, false));
}

function addGalleries(scene, mats) {
  const { aluminum, oak, plaster } = mats;
  const glass = glassMaterial();
  glass.opacity = 0.14;
  const z = 4;
  const len = 44;
  for (const side of [-1, 1]) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.55, 0.1, len), oak);
    deck.position.set(side * 9.72, 4.58, z);
    deck.castShadow = true;
    deck.receiveShadow = true;
    scene.add(deck);

    const soffit = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.04, len - 0.2), plaster);
    soffit.position.set(side * 9.78, 4.5, z);
    scene.add(soffit);

    const fascia = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.32, len), aluminum);
    fascia.position.set(side * 7.46, 4.46, z);
    fascia.castShadow = true;
    scene.add(fascia);

    const rail = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.86), glass);
    rail.position.set(side * 7.5, 5.12, z);
    rail.rotation.y = Math.PI / 2;
    rail.renderOrder = 2;
    scene.add(rail);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.022, len), aluminum);
    hand.position.set(side * 7.5, 5.56, z);
    scene.add(hand);
  }

  // Brackets stay on the window side of the walk limit.
  const arms = [];
  for (const side of [-1, 1]) {
    for (let gz = -16; gz <= 24; gz += 4) {
      const xm = wallX(side, gz);
      const reach = Math.max(0.35, Math.abs(xm) - 12.15);
      arms.push({ x: side * (12.05 + reach / 2), y: 4.35, z: gz, sx: reach });
    }
  }
  scene.add(boxInstances(new THREE.BoxGeometry(1, 0.04, 0.08), aluminum, arms, false));
}
