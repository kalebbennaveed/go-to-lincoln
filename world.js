import * as THREE from './vendor/three.module.min.js';
import { makeLandmarks, landmarkFootprint } from './models.js';
import { makeStreetscape } from './streetscape.js';

const palette = [
  '#b47c5e',
  '#b38871',
  '#ae7154',
  '#bfa783',
  '#c0b297',
  '#c5b6a4',
  '#9f988e',
  '#cdc4af',
];
const roofs = ['#8e8880', '#777c77', '#ada99a', '#95978a'];
const pointIn = (x, z, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = ring[i],
      [c, d] = ring[j];
    if (b > z !== d > z && x < ((c - a) * (z - b)) / (d - b) + a) inside = !inside;
  }
  return inside;
};

// A spatial index keeps street lookups and building collisions local even on the largest blocks.
class Grid {
  cells = new Map();
  add(record, x0, z0, x1, z1) {
    for (let x = Math.floor(x0 / 80); x <= Math.floor(x1 / 80); x++)
      for (let z = Math.floor(z0 / 80); z <= Math.floor(z1 / 80); z++) {
        const key = x + ',' + z;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(record);
      }
  }
  at(x, z) {
    return this.cells.get(Math.floor(x / 80) + ',' + Math.floor(z / 80)) || [];
  }
}
export function streetNetwork(city) {
  const segments = [],
    grid = new Grid();
  for (const road of city.roads)
    for (let i = 1; i < road.p.length; i++) {
      const [x, z] = road.p[i - 1],
        [ex, ez] = road.p[i],
        dx = ex - x,
        dz = ez - z,
        length = Math.hypot(dx, dz);
      if (length < 0.25) continue;
      const s = { road, x, z, dx, dz, length };
      segments.push(s);
      grid.add(
        s,
        Math.min(x, ex) - 45,
        Math.min(z, ez) - 45,
        Math.max(x, ex) + 45,
        Math.max(z, ez) + 45,
      );
    }
  function nearest(x, z, filter = () => true) {
    let best = null;
    function search(pool) {
      for (const s of pool) {
        if (!filter(s.road)) continue;
        const t = THREE.MathUtils.clamp(
          ((x - s.x) * s.dx + (z - s.z) * s.dz) / (s.length * s.length),
          0,
          1,
        );
        const px = s.x + t * s.dx,
          pz = s.z + t * s.dz,
          distance = Math.hypot(px - x, pz - z);
        if (!best || distance < best.distance) best = { ...s, px, pz, distance };
      }
    }
    search(grid.at(x, z));
    if (!best) search(segments);
    return best;
  }
  return { segments, nearest };
}

const colors = new Map();
function color(value) {
  if (!colors.has(value)) colors.set(value, new THREE.Color(value));
  return colors.get(value);
}
class Batch {
  positions = [];
  colors = [];
  uvs = [];
  triangle(
    points,
    tint,
    uv = [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
  ) {
    const c = color(tint);
    for (let i = 0; i < 3; i++) {
      this.positions.push(...points[i]);
      this.colors.push(c.r, c.g, c.b);
      this.uvs.push(...uv[i]);
    }
  }
  quad(
    a,
    b,
    c,
    d,
    tint,
    uv = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  ) {
    this.triangle([a, b, d], tint, [uv[0], uv[1], uv[3]]);
    this.triangle([b, c, d], tint, [uv[1], uv[2], uv[3]]);
  }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}
function facade(style) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = style === 2 ? '#c6cece' : '#fff9ed';
  ctx.fillRect(0, 0, 128, 128);
  if (style === 0) {
    ctx.fillStyle = '#ded7ce';
    for (let y = 0; y < 128; y += 8) {
      ctx.fillRect(0, y, 128, 0.9);
      for (let x = y % 16 ? 0 : 11; x < 128; x += 24) ctx.fillRect(x, y, 0.8, 8);
    }
  }
  const x = style === 2 ? 3 : 24,
    y = style === 2 ? 3 : 18,
    w = 128 - x * 2,
    h = style === 2 ? 119 : 81;
  ctx.fillStyle = '#c3b6a6';
  ctx.fillRect(x - 5, y - 5, w + 10, h + 11);
  const glass = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
  glass.addColorStop(0, '#495658');
  glass.addColorStop(0.48, '#7e949a');
  glass.addColorStop(0.5, '#6d838b');
  glass.addColorStop(1, '#9faeaf');
  ctx.fillStyle = glass;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#333f43';
  ctx.fillRect(x, y, w, 5);
  ctx.fillRect(x, y, 4, h);
  ctx.fillStyle = '#c6bcab';
  ctx.fillRect(62, y, 4, h);
  ctx.fillRect(x, y + h * 0.37, w, 3);
  if (style !== 2) {
    ctx.fillStyle = '#fffcf3';
    ctx.fillRect(x - 7, y + h + 2, w + 14, 5);
    ctx.fillStyle = '#c3beb6';
    ctx.fillRect(0, 121, 128, 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function triangulate(p, holes = []) {
  const vectors = (ring) => ring.map(([x, z]) => new THREE.Vector2(x, z));
  return THREE.ShapeUtils.triangulateShape(vectors(p), holes.map(vectors));
}
function cap(batch, p, holes, y, tint) {
  const all = [...p, ...holes.flat()];
  for (const face of triangulate(p, holes))
    batch.triangle(
      face
        .slice()
        .reverse()
        .map((i) => [all[i][0], y, all[i][1]]),
      tint,
    );
}
// Split each roof triangle along the ridgeline, preserving setbacks and irregular outlines.
function pitchedRoof(batch, ring, y, tint) {
  let dx = 1,
    dz = 0,
    longest = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > longest) {
      longest = len;
      dx = (b[0] - a[0]) / len;
      dz = (b[1] - a[1]) / len;
    }
  }
  const axis = ([x, z]) => -dz * x + dx * z,
    projection = ring.map(axis),
    min = Math.min(...projection),
    max = Math.max(...projection),
    mid = (max + min) / 2;
  const lift = (p) =>
    Math.max(
      0,
      Math.min(2.8, (max - min) * 0.22) *
        (1 - Math.abs(axis(p) - mid) / Math.max(0.1, (max - min) / 2)),
    );
  const point = (p) => [p[0], y + lift(p), p[1]];
  for (const face of triangulate(ring)) {
    const triangle = face.map((i) => ring[i]);
    for (const side of [-1, 1]) {
      const clip = [];
      for (let i = 0; i < 3; i++) {
        const a = triangle[i],
          b = triangle[(i + 1) % 3],
          sa = (axis(a) - mid) * side,
          sb = (axis(b) - mid) * side;
        if (sa >= 0) clip.push(a);
        if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
          const u = sa / (sa - sb);
          clip.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]);
        }
      }
      for (let i = 1; i < clip.length - 1; i++)
        batch.triangle([point(clip[0]), point(clip[i + 1]), point(clip[i])], tint);
    }
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      va = axis(a) - mid,
      vb = axis(b) - mid,
      points = [a];
    if (va * vb < 0) {
      const u = va / (va - vb);
      points.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]);
    }
    points.push(b);
    for (let j = 1; j < points.length; j++) {
      const l = points[j - 1],
        r = points[j];
      batch.quad([l[0], y, l[1]], [r[0], y, r[1]], point(r), point(l), '#cdbfa8');
    }
  }
}
function rectangle(batch, x, z, dx, dz, length, width, y, tint, offset = 0) {
  const ax = (dx * length) / 2,
    az = (dz * length) / 2,
    bx = (-dz * width) / 2,
    bz = (dx * width) / 2;
  x -= dz * offset;
  z += dx * offset;
  batch.quad(
    [x - ax - bx, y, z - az - bz],
    [x - ax + bx, y, z - az + bz],
    [x + ax + bx, y, z + az + bz],
    [x + ax - bx, y, z + az - bz],
    tint,
  );
}
let facadeMaterials;
function buildings(city, root, collision) {
  const material = (map = null) =>
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      map,
      flatShading: true,
    });
  if (!facadeMaterials) {
    facadeMaterials = [material(facade(0)), material(facade(1)), material(facade(2)), material()];
    // Reflected sky retains its own color across different masonry finishes.
    facadeMaterials.slice(0, 3).forEach((mat, style) => {
      mat.onBeforeCompile = (shader) => {
        const glass =
          style === 2
            ? 'step(.035,tile.x)*step(tile.x,.97)*step(.055,tile.y)*step(tile.y,.96)'
            : 'step(.20,tile.x)*step(tile.x,.805)*step(.235,tile.y)*step(tile.y,.85)';
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `vec2 tile=fract(vMapUv);float glass=${glass};diffuseColor.rgb*=mix(vColor,vec3(.88,.95,1.),glass*.88);`,
        );
      };
      mat.customProgramCacheKey = () => `facade-${style}`;
    });
  }
  const mats = facadeMaterials;
  const tiles = new Map();
  for (const b of city.buildings) {
    const p = b.p,
      holes = b.holes || [];
    const xs = p.map((v) => v[0]),
      zs = p.map((v) => v[1]);
    const bounds = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    const cx = (bounds[0] + bounds[2]) / 2,
      cz = (bounds[1] + bounds[3]) / 2;
    if (landmarkFootprint(cx, cz)) continue;
    collision.add(b, ...bounds);
    const seed = Math.abs(Math.floor(cx * 13 + cz * 37));
    const type = b.h > 27 && seed % 4 === 0 ? 2 : seed % 3 === 0 ? 1 : 0;
    const tint = type === 2 ? '#d4dfdf' : palette[seed % palette.length];
    const key = Math.floor(cx / 350) + ',' + Math.floor(cz / 350);
    if (!tiles.has(key))
      tiles.set(
        key,
        mats.map(() => new Batch()),
      );
    const batches = tiles.get(key),
      walls = batches[type],
      solid = batches[3],
      h = b.h;
    const house =
      h < 8.4 &&
      !holes.length &&
      bounds[2] - bounds[0] < 26 &&
      bounds[3] - bounds[1] < 26 &&
      Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]) > 6;
    if (house)
      pitchedRoof(solid, p, h + 0.16, ['#83766d', '#69746f', '#756a60', '#888079'][seed % 4]);
    else cap(solid, p, holes, h + 0.16, roofs[seed % roofs.length]);
    for (const ring of [p, ...holes])
      for (let i = 0; i < ring.length; i++) {
        const [x, z] = ring[i],
          [a, d] = ring[(i + 1) % ring.length];
        const u = Math.max(1, Math.round(Math.hypot(x - a, z - d) / (type === 2 ? 2.5 : 3.65))),
          v = Math.max(1, Math.round(h / 3.5));
        walls.quad([x, 0.24, z], [a, 0.24, d], [a, h, d], [x, h, z], tint, [
          [0, 0],
          [u, 0],
          [u, v],
          [0, v],
        ]);
        solid.quad(
          [x, h - 0.35, z],
          [a, h - 0.35, d],
          [a, h + 0.16, d],
          [x, h + 0.16, z],
          type === 2 ? '#6f7976' : '#dfd3ba',
        );
      }
  }
  for (const batches of tiles.values())
    batches.forEach((batch, i) => {
      if (batch.positions.length) root.add(batch.mesh(mats[i]));
    });
}
let pavementMaterial;
function pavement() {
  if (pavementMaterial) return pavementMaterial;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'),
    grain = ctx.createImageData(128, 128);
  let state = 27314;
  for (let i = 0; i < grain.data.length; i += 4) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const g = 220 + (state % 36);
    grain.data.set([g, g, g, 255], i);
  }
  ctx.putImageData(grain, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  pavementMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    map: texture,
  });
  pavementMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      '#include <uv_vertex>\n vMapUv=position.xz*.27;',
    );
  };
  return pavementMaterial;
}
function roads(city, root) {
  const surfaces = new Batch();
  for (const park of city.parks || []) cap(surfaces, park.p, park.holes || [], 0.012, '#91a674');
  for (const water of city.water || []) cap(surfaces, water.p, water.holes || [], 0.016, '#66999c');
  for (const road of city.roads) {
    const p = road.p,
      w = road.w;
    const distances = [0];
    for (let i = 1; i < p.length; i++)
      distances.push(distances[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    const total = distances.at(-1);
    for (let i = 1; i < p.length; i++) {
      const [x, z] = p[i - 1],
        [a, b] = p[i],
        len = distances[i] - distances[i - 1];
      if (!len) continue;
      const dx = (a - x) / len,
        dz = (b - z) / len,
        mx = (x + a) / 2,
        mz = (z + b) / 2;
      rectangle(surfaces, mx, mz, dx, dz, len + 1, w + 4.8, 0.035, '#c1b9a8');
      rectangle(surfaces, mx, mz, dx, dz, len + 0.7, w + 0.45, 0.055, '#ded7c4');
      rectangle(surfaces, mx, mz, dx, dz, len + 0.7, w, 0.074, '#535859');
      if (w < 6 || total < 21) continue;
      const start = Math.max(0, 9 - distances[i - 1]),
        end = Math.min(len, total - 9 - distances[i - 1]);
      if (end > start && w >= 11) {
        for (const offset of [-0.15, 0.15])
          rectangle(
            surfaces,
            x + (dx * (start + end)) / 2,
            z + (dz * (start + end)) / 2,
            dx,
            dz,
            end - start,
            0.12,
            0.1,
            '#d7b366',
            offset,
          );
      }
      if (w >= 15 || w < 11) {
        const offsets = w >= 15 ? [-w / 4, w / 4] : [0];
        for (
          let pos = Math.ceil((start + distances[i - 1]) / 13) * 13 - distances[i - 1];
          pos < end;
          pos += 13
        ) {
          const size = Math.min(3.9, end - pos);
          for (const offset of offsets)
            rectangle(
              surfaces,
              x + dx * (pos + size / 2),
              z + dz * (pos + size / 2),
              dx,
              dz,
              size,
              0.17,
              0.102,
              w < 11 ? '#d9bb73' : '#dad5c3',
              offset,
            );
        }
      }
      if (total > 55 && w >= 12)
        for (const distance of [9.5, total - 9.5]) {
          const t = distance - distances[i - 1];
          if (t < 0 || t > len) continue;
          for (let offset = -w / 2 + 0.7; offset < w / 2 - 0.5; offset += 1.55)
            rectangle(
              surfaces,
              x + dx * t,
              z + dz * t,
              dx,
              dz,
              2.5,
              0.59,
              0.104,
              '#c6c5b6',
              offset,
            );
        }
    }
    // Fill bends so the full road width stays continuous through curved segments.
    for (let i = 1; i < p.length - 1; i++) {
      const [x, z] = p[i];
      for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI) / 5,
          b = ((k + 1) * Math.PI) / 5;
        surfaces.triangle(
          [
            [x, 0.075, z],
            [x + (Math.cos(b) * w) / 2, 0.075, z + (Math.sin(b) * w) / 2],
            [x + (Math.cos(a) * w) / 2, 0.075, z + (Math.sin(a) * w) / 2],
          ],
          '#535859',
        );
      }
    }
  }
  if (surfaces.positions.length) root.add(surfaces.mesh(pavement()));
}
function buildingShadows(city) {
  // Bake one ground layer so all buildings can cast shadows without per-frame shadow maps.
  const [left, top, right, bottom] = city.bounds,
    canvas = document.createElement('canvas');
  canvas.width = Math.min(2048, Math.ceil((right - left) * 0.8));
  canvas.height = Math.round((2048 * (bottom - top)) / (right - left));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(
    canvas.width / (right - left),
    0,
    0,
    canvas.height / (bottom - top),
    (-left * canvas.width) / (right - left),
    (-top * canvas.height) / (bottom - top),
  );
  ctx.fillStyle = '#283139';
  for (const b of city.buildings) {
    const p = b.p,
      dx = b.h * 0.8,
      dz = -b.h * 0.38;
    ctx.beginPath();
    for (let i = 0; i < p.length; i++) {
      const [x, z] = p[i],
        [a, v] = p[(i + 1) % p.length];
      ctx.moveTo(x, z);
      ctx.lineTo(a, v);
      ctx.lineTo(a + dx, v + dz);
      ctx.lineTo(x + dx, z + dz);
      ctx.closePath();
    }
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(right - left, bottom - top),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((left + right) / 2, 0.127, (top + bottom) / 2);
  return mesh;
}
export function buildWorld(city, scene) {
  const collision = new Grid(),
    root = new THREE.Group();
  buildings(city, root, collision);
  const contains = (b, x, z) =>
    pointIn(x, z, b.p) && !(b.holes || []).some((h) => pointIn(x, z, h));
  function blocked(x, z) {
    return !!landmarkFootprint(x, z) || collision.at(x, z).some((b) => contains(b, x, z));
  }
  blocked.heightAt = (x, z) => {
    if (landmarkFootprint(x, z)) {
      if (Math.abs(x - 29) < 16 && Math.abs(z - 214) < 16) return 122;
      if (x > -100) return 22;
      return x < -850 ? 38 : 43;
    }
    let height = 0;
    for (const b of collision.at(x, z)) if (contains(b, x, z)) height = Math.max(height, b.h);
    return height;
  };
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(52000, 52000),
    new THREE.MeshLambertMaterial({ color: '#a6ae88' }),
  );
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);
  roads(city, root);
  root.add(buildingShadows(city));
  root.add(makeLandmarks(), makeStreetscape(city, blocked));
  scene.add(root);
  return blocked;
}

// The core is immediately playable. Neighborhood footprints and props follow the player in 800 m tiles.
export function streamRegion(region, core, scene, coreBlocked) {
  const side = 800,
    outerRoads = new Map(),
    loaded = new Map(),
    pending = new Map(),
    errors = new Map();
  const [left, top, right, bottom] = core.bounds;
  const inCore = ([x, z]) => x >= left && x <= right && z >= top && z <= bottom;
  const keyOf = (x, z) => Math.floor(x / side) + ',' + Math.floor(z / side);
  const center = (p) => [(p[0][0] + p.at(-1)[0]) / 2, (p[0][1] + p.at(-1)[1]) / 2];
  for (const r of region.roads) {
    if (r.p.every(inCore)) continue;
    const key = keyOf(...center(r.p));
    if (!outerRoads.has(key)) outerRoads.set(key, []);
    outerRoads.get(key).push(r);
  }
  const landscapes = new THREE.Group();
  roads(
    {
      roads: [],
      parks: region.parks.filter((f) => !f.p.every(inCore)),
      water: region.water.filter((f) => !f.p.every(inCore)),
    },
    landscapes,
  );
  scene.add(landscapes);
  let wanted = new Set(),
    lastKey = '',
    queue = [];
  function heightAt(x, z) {
    let h = coreBlocked.heightAt(x, z);
    for (const tile of loaded.values())
      for (const b of tile.grid.at(x, z))
        if (pointIn(x, z, b.p) && !(b.holes || []).some((r) => pointIn(x, z, r)))
          h = Math.max(h, b.h);
    return h;
  }
  function release(tile) {
    scene.remove(tile.root);
    const geos = new Set(),
      mats = new Set();
    tile.root.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.geometry) geos.add(o.geometry);
      if (o.material && o.material !== pavementMaterial && !facadeMaterials.includes(o.material))
        mats.add(o.material);
    });
    for (const g of geos) g.dispose();
    for (const m of mats) {
      m.map?.dispose();
      m.dispose();
    }
  }
  function build(key, footprints) {
    const [tx, tz] = key.split(',').map(Number),
      bounds = [tx * side, tz * side, (tx + 1) * side, (tz + 1) * side];
    const district = { roads: outerRoads.get(key) || [], buildings: footprints, bounds };
    const root = new THREE.Group(),
      grid = new Grid();
    buildings(district, root, grid);
    roads(district, root);
    if (footprints.length) root.add(buildingShadows(district));
    if (district.roads.length)
      root.add(
        makeStreetscape(
          district,
          (x, z) => coreBlocked(x, z) || grid.at(x, z).some((b) => pointIn(x, z, b.p)),
        ),
      );
    scene.add(root);
    loaded.set(key, { root, grid });
  }
  async function fetchTile(key) {
    pending.set(key, true);
    try {
      let records = [];
      if (region.tiles[key]) {
        const response = await fetch('data/tiles/' + key.replace(',', '_') + '.json');
        if (!response.ok) throw Error('Map tile ' + response.status);
        records = await response.json();
      }
      if (wanted.has(key)) queue.push({ key, records });
      else pending.delete(key);
    } catch (error) {
      errors.set(key, performance.now() + 5000);
      pending.delete(key);
      console.warn('Neighborhood data temporarily unavailable', key, error);
    }
  }
  function update(x, z) {
    const tx = Math.floor(x / side),
      tz = Math.floor(z / side),
      key = tx + ',' + tz;
    if (key !== lastKey) {
      lastKey = key;
      wanted = new Set();
      const nearby = [];
      for (let dx = -2; dx <= 2; dx++)
        for (let dz = -2; dz <= 2; dz++) {
          const k = tx + dx + ',' + (tz + dz);
          if (region.tiles[k] || outerRoads.has(k)) nearby.push([k, dx * dx + dz * dz]);
        }
      nearby.sort((a, b) => a[1] - b[1]).forEach(([k]) => wanted.add(k));
      for (const [k, tile] of loaded)
        if (!wanted.has(k)) {
          release(tile);
          loaded.delete(k);
        }
    }
    for (const k of wanted) {
      if (pending.size >= 4) break;
      if (!pending.has(k) && !loaded.has(k) && !(performance.now() < errors.get(k))) fetchTile(k);
    }
    if (queue.length) {
      queue.sort((a, b) => (a.key === key ? -1 : b.key === key ? 1 : 0));
      const { key: k, records } = queue.shift();
      pending.delete(k);
      if (wanted.has(k)) build(k, records);
    }
  }
  return {
    update,
    heightAt,
    blocked: (x, z) => heightAt(x, z) > 0,
    ready: (x, z) => {
      const k = keyOf(x, z);
      return inCore([x, z]) || (!region.tiles[k] && !outerRoads.has(k)) || loaded.has(k);
    },
  };
}

export const skies = {
  'Golden hour': {
    top: '#73aabf',
    horizon: '#f5d9b2',
    fog: '#e1cfb0',
    sun: '#ffe1ba',
    light: 2.0,
    ambient: 1.65,
    direction: [-0.85, 0.68, 0.38],
  },
  Daylight: {
    top: '#438fc3',
    horizon: '#d3e8e9',
    fog: '#c5dce1',
    sun: '#fff1cb',
    light: 2.1,
    ambient: 1.75,
    direction: [-0.45, 1.2, -0.3],
  },
  'Blue hour': {
    top: '#263b63',
    horizon: '#d5a19b',
    fog: '#9b98a8',
    sun: '#f0b599',
    light: 1.05,
    ambient: 1.05,
    direction: [-0.9, 0.27, 0.55],
  },
};
export function atmosphere(scene) {
  const ambient = new THREE.HemisphereLight('#eaf5ff', '#a1a793', 1.55),
    sun = new THREE.DirectionalLight('#fff1da', 2);
  scene.add(ambient, sun);
  scene.fog = new THREE.FogExp2('#dacbb9', 0.00057);
  const uniforms = {
    top: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3() },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(3500, 44, 22),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms,
      vertexShader: `varying vec3 ray;void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 ray;uniform vec3 top,horizon,sunDir;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}void main(){vec3 r=normalize(ray);float t=max(0.,r.y);vec3 c=mix(horizon,top,pow(smoothstep(-.025,.62,t),.50));vec2 uv=r.xz/max(.075,r.y+.04);float n=noise(uv*vec2(1.8,5.))+noise(uv*vec2(5.,14.))*.4+noise(uv*vec2(13.,35.))*.12;c=mix(c,vec3(1.,.96,.89),smoothstep(.79,1.18,n)*smoothstep(.035,.18,t)*.50);float s=max(0.,dot(r,normalize(sunDir)));c+=vec3(.6,.42,.18)*pow(s,50.);c=mix(c,vec3(1.,.96,.76),smoothstep(.99968,.9999,s));gl_FragColor=vec4(c,1.);\n#include <colorspace_fragment>\n}`,
    }),
  );
  sky.frustumCulled = false;
  scene.add(sky);
  function set(name) {
    const s = skies[name];
    uniforms.top.value.set(s.top);
    uniforms.horizon.value.set(s.horizon);
    uniforms.sunDir.value.fromArray(s.direction);
    scene.fog.color.set(s.fog);
    sun.color.set(s.sun);
    sun.intensity = s.light;
    sun.position.fromArray(s.direction).multiplyScalar(100);
    ambient.intensity = s.ambient;
  }
  set('Golden hour');
  return { set, sky };
}
