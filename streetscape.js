import * as THREE from './vendor/three.module.min.js';

// All distances are metres. The source centerlines use X east and Z south.
const GRID = 48;
const TILE = 600;
const gridKey = (x, z, size) => `${Math.floor(x / size)},${Math.floor(z / size)}`;
const leaves = [0x698545, 0x84974f, 0x91a456, 0x728f57, 0x547b58, 0x879b67];
const bodywork = [0xe9ddc4, 0x597886, 0xad6959, 0x667171, 0xc1bbac, 0x9bafab, 0x4c5860, 0xb29a66];

function randomSource() {
  let value = 23018;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function streetIndex(roads) {
  const cells = new Map();
  for (const road of roads) {
    for (let i = 1; i < road.p.length; i++) {
      const [x, z] = road.p[i - 1];
      const dx = road.p[i][0] - x,
        dz = road.p[i][1] - z;
      const lengthSq = dx * dx + dz * dz;
      if (!lengthSq) continue;
      const segment = { road, x, z, dx, dz, lengthSq };
      const margin = road.w / 2 + 4;
      const xMin = Math.floor((Math.min(x, x + dx) - margin) / GRID);
      const zMin = Math.floor((Math.min(z, z + dz) - margin) / GRID);
      const xMax = Math.floor((Math.max(x, x + dx) + margin) / GRID);
      const zMax = Math.floor((Math.max(z, z + dz) + margin) / GRID);
      for (let col = xMin; col <= xMax; col++) {
        for (let row = zMin; row <= zMax; row++) {
          const key = `${col},${row}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(segment);
        }
      }
    }
  }
  const nearby = (x, z) => cells.get(gridKey(x, z, GRID)) || [];
  function distance(segment, x, z) {
    const { dx, dz, lengthSq } = segment;
    const px = x - segment.x,
      pz = z - segment.z;
    const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / lengthSq));
    return Math.hypot(px - t * dx, pz - t * dz);
  }
  function clear(x, z, padding, ignore) {
    return nearby(x, z).every(
      (s) => s.road === ignore || distance(s, x, z) >= s.road.w / 2 + padding,
    );
  }
  return { nearby, distance, clear };
}

function pathSamples(road, start, spacing, visit) {
  let next = start;
  for (let i = 1; i < road.p.length; i++) {
    const [x, z] = road.p[i - 1];
    const [bx, bz] = road.p[i];
    const length = Math.hypot(bx - x, bz - z);
    if (length < 0.05) continue;
    const dx = (bx - x) / length,
      dz = (bz - z) / length;
    while (next <= length) {
      visit(x + next * dx, z + next * dz, dx, dz);
      next += spacing;
    }
    next -= length;
  }
}

function leafGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const p = geometry.attributes.position;
  // Perturb coincident corners consistently, keeping the canopy watertight.
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const radius = 1 + 0.1 * Math.sin(x * 14 + z * 19 + y * 6);
    p.setXYZ(i, x * radius + y * 0.09, y * radius, z * radius);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Each ring is a horizontal rectangle with clipped corners, joined by tapered faces.
function vehicleShell(rings) {
  const vertices = [],
    indices = [];
  for (const [halfWidth, front, back, y, bevel] of rings) {
    const a = halfWidth - bevel;
    for (const [x, z] of [
      [-a, front],
      [-halfWidth, front + bevel],
      [-halfWidth, back - bevel],
      [-a, back],
      [a, back],
      [halfWidth, back - bevel],
      [halfWidth, front + bevel],
      [a, front],
    ]) {
      vertices.push(x, y, z);
    }
  }
  for (let level = 1; level < rings.length; level++) {
    for (let i = 0; i < 8; i++) {
      const a = (level - 1) * 8 + i,
        b = (level - 1) * 8 + ((i + 1) % 8);
      indices.push(a, b, a + 8, b, b + 8, a + 8);
    }
  }
  const top = (rings.length - 1) * 8;
  for (let j = 1; j < 7; j++) indices.push(top, top + j, top + j + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  geometry.dispose();
  return flat;
}

function districtRoad(road) {
  return (
    road.w >= 5 &&
    road.p.length >= 2 &&
    !/ramp|interstate|\bi[- ]?180\b|cornhusker hwy|salt creek roadway/i.test(road.n)
  );
}

function plateName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (s) => s.toUpperCase())
    .replace(
      /\b(Street|Avenue|Boulevard|Drive|Court|Place|Road|Highway)\b/g,
      (word) =>
        ({
          Street: 'St',
          Avenue: 'Ave',
          Boulevard: 'Blvd',
          Drive: 'Dr',
          Court: 'Ct',
          Place: 'Pl',
          Road: 'Rd',
          Highway: 'Hwy',
        })[word],
    );
}

function streetPlates(signs) {
  if (!signs.length) return null;
  const names = [...new Set(signs.map((sign) => sign.name))];
  const columns = 8,
    cellWidth = 192,
    cellHeight = 40;
  // A power-of-two atlas width/height keeps mipmapped nameplates crisp at oblique angles.
  const atlas = document.createElement('canvas');
  atlas.width = 2048;
  atlas.height = THREE.MathUtils.ceilPowerOfTwo(Math.ceil(names.length / columns) * 64);
  const ctx = atlas.getContext('2d');
  const rectangles = new Map();
  for (const [i, name] of names.entries()) {
    const x = (i % columns) * 256 + 4,
      y = Math.floor(i / columns) * 64 + 4;
    ctx.fillStyle = '#1c5146';
    ctx.fillRect(x - 3, y - 3, cellWidth + 6, cellHeight + 6);
    ctx.strokeStyle = '#bad2b8';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);
    ctx.fillStyle = '#fcf6dd';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x + cellWidth / 2, y + cellHeight / 2, cellWidth - 16);
    rectangles.set(name, [
      x / atlas.width,
      1 - (y + cellHeight) / atlas.height,
      (x + cellWidth) / atlas.width,
      1 - y / atlas.height,
    ]);
  }
  const texture = new THREE.CanvasTexture(atlas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshLambertMaterial({ map: texture });
  const positions = [],
    uvs = [];
  for (const { x, y, z, dx, dz, name } of signs) {
    const [u0, v0, u1, v1] = rectangles.get(name);
    const half = Math.max(0.52, Math.min(1.15, 0.084 * name.length + 0.18));
    const height = 0.145;
    for (const side of [-1, 1]) {
      const vx = side * dx,
        vz = side * dz;
      const cx = x - vz * 0.028,
        cz = z + vx * 0.028;
      const corners = [
        [cx - vx * half, y - height, cz - vz * half],
        [cx + vx * half, y - height, cz + vz * half],
        [cx + vx * half, y + height, cz + vz * half],
        [cx - vx * half, y + height, cz - vz * half],
      ];
      const uv = [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v1],
      ];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        positions.push(...corners[i]);
        uvs.push(...uv[i]);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

export function makeStreetscape(city, blocked) {
  const group = new THREE.Group();
  group.name = 'Lincoln streetscape';
  const rnd = randomSource();
  const streets = streetIndex(city.roads);
  const occupied = new Map();
  function reserve(x, z, radius) {
    if (blocked(x, z)) return false;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const neighbors = occupied.get(`${Math.floor(x / 10) + a},${Math.floor(z / 10) + b}`);
        if (neighbors?.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius + radius)) return false;
      }
    const key = gridKey(x, z, 10);
    if (!occupied.has(key)) occupied.set(key, []);
    occupied.get(key).push({ x, z, radius });
    return true;
  }
  const cylinder = (top, bottom, count) => new THREE.CylinderGeometry(top, bottom, 1, count, 1);
  const wheel = cylinder(0.5, 0.5, 10).rotateZ(Math.PI / 2);
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    trunk: cylinder(0.35, 0.56, 7),
    leaf: leafGeometry(),
    column: cylinder(0.46, 0.5, 8),
    wheel,
    car: vehicleShell([
      [0.8, -2.11, 2.1, 0.37, 0.18],
      [0.92, -2.16, 2.16, 0.67, 0.17],
      [0.88, -2.04, 2.09, 0.98, 0.24],
    ]),
    glass: vehicleShell([
      [0.82, -1.27, 1.43, 0.96, 0.19],
      [0.69, -0.65, 0.84, 1.43, 0.2],
    ]),
    lantern: cylinder(0.54, 0.3, 6),
    cap: new THREE.ConeGeometry(0.6, 1, 6),
    shade: new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2),
  };
  geometries.lowerLeaf = geometries.leaf;
  const distantCrown = new THREE.IcosahedronGeometry(1);
  const material = new THREE.MeshLambertMaterial({ flatShading: true });
  const shadow = new THREE.MeshBasicMaterial({
    color: 0x262d27,
    transparent: true,
    opacity: 0.19,
    depthWrite: false,
  });
  const batches = new Map();
  function put(kind, x, y, z, w, h, d, color, yaw = 0, roll = 0) {
    const key = kind + '/' + gridKey(x, z, TILE);
    if (!batches.has(key)) batches.set(key, { kind, items: [] });
    batches.get(key).items.push([x, y, z, w, h, d, color, yaw, roll]);
  }
  function tree(x, z, formal) {
    const height = (formal ? 7.5 : 6.3) + rnd() * 3.7;
    const radius = height * (0.29 + rnd() * 0.1);
    const ay = rnd() * Math.PI * 2;
    const tint = leaves[Math.floor(rnd() * leaves.length)];
    const bark = rnd() < 0.5 ? 0x675c4d : 0x786c53;
    put('trunk', x, height * 0.26, z, 0.5, height * 0.52, 0.5, bark, ay);
    put('leaf', x, height * 0.72, z, radius, height * 0.31, radius * 0.91, tint, ay);
    // Lower, asymmetric side canopy anchors the crown to a visible branching trunk.
    const reach = radius * 0.55,
      sx = Math.cos(ay),
      sz = Math.sin(ay);
    put(
      'column',
      x + sx * 0.34,
      height * 0.44,
      z + sz * 0.34,
      0.23,
      height * 0.2,
      0.23,
      bark,
      -ay,
      -0.46,
    );
    put(
      'lowerLeaf',
      x + sx * reach,
      height * 0.62,
      z + sz * reach,
      radius * 0.74,
      height * 0.22,
      radius * 0.68,
      tint,
      -ay,
    );
    put(
      'shade',
      x + radius * 0.6,
      0.115,
      z - radius * 0.26,
      radius * 1.23,
      1,
      radius * 0.88,
      0xffffff,
      0.3,
    );
  }
  function lamp(x, z, nx, nz, formal) {
    const metal = formal ? 0x3c4c44 : 0x5e6b69;
    if (formal) {
      put('column', x, 0.39, z, 0.46, 0.78, 0.46, metal);
      put('column', x, 2.42, z, 0.17, 4.4, 0.17, metal);
      put('column', x, 4.59, z, 0.42, 0.13, 0.42, metal);
      put('lantern', x, 4.94, z, 0.83, 0.65, 0.83, 0xffedb8);
      put('cap', x, 5.4, z, 0.89, 0.28, 0.89, metal);
      put('column', x, 5.58, z, 0.08, 0.16, 0.08, metal);
    } else {
      const angle = Math.atan2(nx, nz);
      put('column', x, 0.24, z, 0.4, 0.48, 0.4, metal);
      put('column', x, 3.65, z, 0.19, 7.3, 0.19, metal);
      put('box', x + nx * 0.74, 7.27, z + nz * 0.74, 0.11, 0.1, 1.6, metal, angle);
      put('box', x + nx * 1.55, 7.24, z + nz * 1.55, 0.36, 0.14, 0.62, 0x525e60, angle);
      put('box', x + nx * 1.55, 7.15, z + nz * 1.55, 0.27, 0.035, 0.47, 0xf6e7bd, angle);
    }
  }
  function bench(x, z, dx, dz, side) {
    const yaw = Math.atan2(-dz, dx),
      nx = -dz * side,
      nz = dx * side;
    put('box', x, 0.55, z, 1.85, 0.12, 0.5, 0xb07951, yaw);
    put('box', x + nx * 0.2, 0.89, z + nz * 0.2, 1.85, 0.25, 0.09, 0xa16a47, yaw);
    for (const offset of [-0.64, 0.64]) {
      put('box', x + dx * offset, 0.3, z + dz * offset, 0.1, 0.5, 0.46, 0x48544b, yaw);
    }
  }
  function car(x, z, dx, dz) {
    const yaw = Math.atan2(-dx, -dz);
    const color = bodywork[Math.floor(rnd() * bodywork.length)];
    put('shade', x + 0.28, 0.115, z - 0.12, 1.12, 1, 2.29, 0xffffff, yaw);
    put('car', x, 0.05, z, 1, 1, 1, color, yaw);
    put('glass', x, 0.05, z, 1, 1, 1, 0x4b6269, yaw);
    put('box', x - dx * 0.1, 1.49, z - dz * 0.1, 1.29, 0.07, 1.4, color, yaw);
    for (const ax of [-1.36, 1.33]) {
      put('wheel', x - dx * ax, 0.37, z - dz * ax, 1.84, 0.64, 0.64, 0x373b39, yaw);
      put('wheel', x - dx * ax, 0.37, z - dz * ax, 1.855, 0.34, 0.34, 0x9aa3a0, yaw);
    }
    for (const s of [-0.63, 0.63]) {
      put(
        'box',
        x + dx * 2.1 - dz * s,
        0.84,
        z + dz * 2.1 + dx * s,
        0.29,
        0.15,
        0.12,
        0xffeac6,
        yaw,
      );
      put(
        'box',
        x - dx * 2.14 - dz * s,
        0.82,
        z - dz * 2.14 + dx * s,
        0.31,
        0.17,
        0.1,
        0xa64137,
        yaw,
      );
    }
  }

  const roads = city.roads.filter(districtRoad);
  const signs = [],
    signedCorners = new Set();
  // Intersection plates are reserved first, so a tree cannot obscure their post.
  for (const road of roads) {
    if (!road.n || /^unnamed|^alley$/i.test(road.n)) continue;
    for (const end of [0, road.p.length - 1]) {
      const [cx, cz] = road.p[end],
        other = road.p[end === 0 ? 1 : end - 1];
      const length = Math.hypot(other[0] - cx, other[1] - cz);
      if (length < 0.2) continue;
      const key = gridKey(cx, cz, 8);
      if (signedCorners.has(key)) continue;
      const dx = (other[0] - cx) / length,
        dz = (other[1] - cz) / length;
      const cross = streets
        .nearby(cx, cz)
        .find(
          (s) =>
            s.road.n &&
            s.road.n !== road.n &&
            districtRoad(s.road) &&
            streets.distance(s, cx, cz) < 2 &&
            Math.abs(dx * s.dz - dz * s.dx) > 0.75 * Math.sqrt(s.lengthSq),
        );
      if (!cross) continue;
      const sx = cross.dx / Math.sqrt(cross.lengthSq),
        sz = cross.dz / Math.sqrt(cross.lengthSq);
      for (const side of [1, -1]) {
        const x = cx + dx * (cross.road.w / 2 + 2.7) - dz * side * (road.w / 2 + 2.2);
        const z = cz + dz * (cross.road.w / 2 + 2.7) + dx * side * (road.w / 2 + 2.2);
        if (!streets.clear(x, z, 0.5) || !reserve(x, z, 0.65)) continue;
        put('column', x, 1.48, z, 0.075, 2.96, 0.075, 0x778785);
        signs.push(
          { x, y: 2.89, z, dx, dz, name: plateName(road.n) },
          { x, y: 2.56, z, dx: sx, dz: sz, name: plateName(cross.road.n) },
        );
        signedCorners.add(key);
        break;
      }
    }
  }
  for (const road of roads) {
    const formal = /lincoln mall|centennial mall|canopy|pinnacle arena|stadium dr/i.test(road.n);
    const edge = road.w / 2;
    for (const side of [-1, 1]) {
      const treeGap = formal ? 18 : 31 + rnd() * 15;
      pathSamples(road, 8 + rnd() * treeGap, treeGap, (cx, cz, dx, dz) => {
        const setback = edge + (formal ? 3.5 : 3.9 + 1.9 * rnd());
        const x = cx - dz * side * setback,
          z = cz + dx * side * setback;
        if (
          !streets.clear(x, z, 2) ||
          blocked(x - dz * side * 2.4, z + dx * side * 2.4) ||
          !reserve(x, z, 3.8)
        )
          return;
        tree(x, z, formal);
      });
      const lampGap = formal ? 32 : 72;
      pathSamples(road, 10 + rnd() * (formal ? 16 : 42), lampGap, (cx, cz, dx, dz) => {
        const x = cx - dz * side * (edge + 1),
          z = cz + dx * side * (edge + 1);
        if (streets.clear(x, z, 0.45) && reserve(x, z, 0.58))
          lamp(x, z, dz * side, -dx * side, formal);
      });
      if (road.w < 8 || road.w > 25) continue;
      const spacing = 65 + rnd() * 65;
      pathSamples(road, 13 + rnd() * spacing, spacing, (cx, cz, dx, dz) => {
        const x = cx - dz * side * (edge - 0.67),
          z = cz + dx * side * (edge - 0.67);
        if (!streets.clear(x, z, 4.6, road) || !reserve(x, z, 2.4)) return;
        car(x, z, dx * side, dz * side);
      });
      if (formal) {
        pathSamples(road, 21 + rnd() * 27, 50, (cx, cz, dx, dz) => {
          const x = cx - dz * side * (edge + 2.4),
            z = cz + dx * side * (edge + 2.4);
          if (streets.clear(x, z, 1) && reserve(x, z, 1.3)) bench(x, z, dx, dz, side);
        });
      }
    }
  }

  const matrix = new THREE.Object3D(),
    tint = new THREE.Color(),
    tiles = new Map();
  matrix.rotation.order = 'YXZ';
  for (const { kind, items } of batches.values()) {
    const [x0, , z0] = items[0],
      key = gridKey(x0, z0, TILE);
    if (!tiles.has(key)) {
      const levels = new THREE.LOD(),
        near = new THREE.Group(),
        far = new THREE.Group();
      levels.position.set(
        (Math.floor(x0 / TILE) + 0.5) * TILE,
        0,
        (Math.floor(z0 / TILE) + 0.5) * TILE,
      );
      levels.addLevel(near, 0);
      levels.addLevel(far, 840, 0.06);
      levels.addLevel(new THREE.Group(), 2300, 0.05);
      tiles.set(key, { near, far, position: levels.position });
      group.add(levels);
    }
    const { near, far, position } = tiles.get(key);
    const mesh = new THREE.InstancedMesh(
      geometries[kind],
      kind === 'shade' ? shadow : material,
      items.length,
    );
    mesh.name = kind;
    for (const [i, [x, y, z, w, h, d, color, yaw, roll]] of items.entries()) {
      matrix.position.set(x - position.x, y, z - position.z);
      matrix.rotation.set(0, yaw, roll);
      matrix.scale.set(w, h, d);
      matrix.updateMatrix();
      mesh.setMatrixAt(i, matrix.matrix);
      mesh.setColorAt(i, tint.setHex(color));
    }
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    mesh.castShadow = kind === 'leaf' || kind === 'car';
    near.add(mesh);
    if (kind === 'leaf') {
      const canopy = new THREE.InstancedMesh(distantCrown, material, items.length);
      canopy.instanceMatrix = mesh.instanceMatrix;
      canopy.instanceColor = mesh.instanceColor;
      canopy.boundingSphere = mesh.boundingSphere.clone();
      far.add(canopy);
    }
  }
  const plates = streetPlates(signs);
  if (plates) group.add(plates);
  return group;
}
