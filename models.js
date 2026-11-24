import * as THREE from './vendor/three.module.min.js';

// Meters in the city's local east/south coordinate system.
const east = 111320 * Math.cos((40.81 * Math.PI) / 180);
function position(lon, lat) {
  return [(lon + 96.7) * east, (40.81 - lat) * 111320];
}
const capitol = position(-96.69965, 40.80808);
const stadium = position(-96.70564, 40.82066);
const arena = position(-96.7125, 40.81797);
const garden = position(-96.6833, 40.80218);

// Checks building centroids when replacing the city GIS outlines. The stadium
// and arena records also include their concourses and attached service wings.
export function landmarkFootprint(x, z) {
  return (
    (Math.abs(x - capitol[0]) < 68 && Math.abs(z - capitol[1]) < 71) ||
    (Math.abs(x - stadium[0]) < 98 && Math.abs(z - stadium[1]) < 143) ||
    (Math.abs(x - arena[0]) < 64 && Math.abs(z - arena[1]) < 86)
  );
}

const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
const colors = new Map();
function colorFor(hex) {
  if (!colors.has(hex)) colors.set(hex, new THREE.Color(hex));
  return colors.get(hex);
}

// Batch colored solids into one mesh per landmark or movable part. The flat
// normals keep the silhouettes legible from either a car or a helicopter.
class Model {
  positions = [];
  colors = [];

  tri(a, b, c, hex) {
    this.positions.push(...a, ...b, ...c);
    const { r, g, b: blue } = colorFor(hex);
    this.colors.push(r, g, blue, r, g, blue, r, g, blue);
  }
  quad(a, b, c, d, hex) {
    this.tri(a, b, c, hex);
    this.tri(a, c, d, hex);
  }
  shape(geometry, at, size, hex, rotation = [0, 0, 0]) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...at),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...size),
    );
    const points = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const { r, g, b } = colorFor(hex);
    const point = new THREE.Vector3();
    for (let i = 0; i < (index?.count ?? points.count); i++) {
      point.fromBufferAttribute(points, index ? index.getX(i) : i).applyMatrix4(matrix);
      this.positions.push(point.x, point.y, point.z);
      this.colors.push(r, g, b);
    }
  }
  box(x, y, z, w, h, d, hex, turn = 0) {
    this.shape(cube, [x, y, z], [w, h, d], hex, [0, turn, 0]);
  }
  oval(x, y, z, w, h, d, hex) {
    this.shape(sphere, [x, y, z], [w, h, d], hex);
  }
  cylinder(x, y, z, rx, h, rz, hex) {
    this.shape(cylinder, [x, y, z], [rx, h, rz], hex);
  }
  rod(a, b, r, hex) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b);
    const offset = end.clone().sub(start);
    const middle = start.clone().lerp(end, 0.5);
    const rotation = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(up, offset.clone().normalize()),
    );
    this.shape(cylinder, middle.toArray(), [r, offset.length(), r], hex, [
      rotation.x,
      rotation.y,
      rotation.z,
    ]);
  }
  mesh(name) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}
const cube = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.SphereGeometry(1, 16, 10);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
const up = new THREE.Vector3(0, 1, 0);
const tau = 2 * Math.PI;

// Goodhue's cross within a 437-foot square, four courtyard gardens, and the
// limestone tower capped by the Sower. Dimensions follow the Capitol Commission.
function buildCapitol() {
  const m = new Model();
  const stone = '#e1cea5',
    trim = '#f3e2bc',
    shade = '#baa886',
    glass = '#475651';
  m.box(0, 0.15, 0, 139, 0.3, 139, '#aeaa80');
  for (const sign of [-1, 1]) {
    m.box(0, 6, sign * 58, 133, 12, 17, stone);
    m.box(sign * 58, 6, 0, 17, 12, 101, stone);
    m.box(0, 12.15, sign * 58, 134, 0.8, 18, trim);
    m.box(sign * 58, 12.15, 0, 18, 0.8, 101, trim);
    m.box(0, 12.75, sign * 58, 130, 0.5, 15, '#978d79');
    m.box(sign * 58, 12.75, 0, 15, 0.5, 99, '#978d79');
    for (let span = -60; span <= 60; span += 4) {
      for (const height of [4, 8.6]) {
        m.box(span, height, sign * 66.55, 1.4, 2.6, 0.2, glass);
        m.box(sign * 66.55, height, span, 0.2, 2.6, 1.4, glass);
      }
    }
  }
  m.box(0, 8.1, 0, 21, 16.2, 129, stone);
  m.box(0, 8.1, 0, 129, 16.2, 21, stone);
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      m.box(x * 36, 0.4, z * 36, 25, 0.35, 24, '#7f925b');
      m.cylinder(x * 36, 0.8, z * 36, 6, 0.65, 6, '#bfba9f');
      m.cylinder(x * 36, 1.18, z * 36, 4.8, 0.22, 4.8, '#70afb0');
    }
  // Broad north steps and twin ceremonial pylons.
  for (let step = 0; step < 6; step++) {
    m.box(0, 0.19 + step * 0.3, -78 + step * 1.75, 25, 0.38 + step * 0.6, 2.0, trim);
  }
  m.box(0, 7.8, -66, 25, 15.5, 9, stone);
  m.box(0, 6.4, -70.6, 9, 10, 0.4, '#3b4037');
  for (const sign of [-1, 1]) {
    m.box(9.8 * sign, 9, -69, 5.5, 18, 8.6, trim);
    m.box(sign * 62, 7.7, 0, 10, 15.4, 23, stone);
  }
  // Successive setbacks and incised vertical window strips define the shaft.
  m.box(0, 19, 0, 48, 10, 48, stone);
  m.box(0, 26, 0, 37, 12, 37, stone);
  m.box(0, 48, 0, 26.8, 52, 26.8, stone);
  for (const face of [-1, 1]) {
    for (const side of [-1, 1]) {
      m.box(side * 14, 38, face * 12, 3, 29, 4, trim);
      m.box(side * 12, 38, face * 14, 4, 29, 3, trim);
    }
    for (const lane of [-8, -4, 0, 4, 8]) {
      m.box(lane, 52, face * 13.46, 1.65, 43, 0.22, shade);
      m.box(face * 13.46, 52, lane, 0.22, 43, 1.65, shade);
      for (let y = 33; y <= 73; y += 4.45) {
        m.box(lane, y, face * 13.62, 1.36, 3.05, 0.18, glass);
        m.box(face * 13.62, y, lane, 0.18, 3.05, 1.36, glass);
      }
    }
  }
  m.box(0, 75, 0, 28.8, 2.8, 28.8, trim);
  m.box(0, 82, 0, 24, 13, 24, stone);
  for (const side of [-1, 1])
    for (const offset of [-6.8, 0, 6.8]) {
      m.box(offset, 82, side * 12.08, 3.5, 8, 0.28, glass);
      m.box(side * 12.08, 82, offset, 0.28, 8, 3.5, glass);
      m.oval(offset, 86, side * 12.18, 1.75, 1.65, 0.13, glass);
      m.oval(side * 12.18, 86, offset, 0.13, 1.65, 1.75, glass);
    }
  m.box(0, 89.5, 0, 26, 2, 26, trim);
  m.cylinder(0, 93, 0, 12.8, 5.2, 12.8, stone);
  m.cylinder(0, 96, 0, 13.3, 1.1, 13.3, '#a28148');
  const dome = new THREE.SphereGeometry(1, 24, 12, 0, tau, 0, Math.PI / 2);
  m.shape(dome, [0, 96.5, 0], [13, 15.6, 13], '#d6ae4f');
  for (let i = 0; i < 16; i++) {
    const az = (i * tau) / 16;
    for (let lat = 0; lat < 5; lat++) {
      const point = (n) => [
        13.02 * Math.cos(az) * Math.cos((n * Math.PI) / 10),
        96.5 + 15.65 * Math.sin((n * Math.PI) / 10),
        13.02 * Math.sin(az) * Math.cos((n * Math.PI) / 10),
      ];
      m.rod(point(lat), point(lat + 1), 0.12, '#e7c570');
    }
  }
  const bronze = '#594e35';
  m.cylinder(0, 113.1, 0, 1.55, 2, 1.55, '#bc9e58');
  m.box(0, 114.8, 0, 2, 1.5, 2, bronze);
  m.rod([-0.5, 115.5, 0], [-0.3, 118.3, 0], 0.35, bronze);
  m.rod([0.8, 115.5, 0.4], [0.35, 118.3, 0], 0.36, bronze);
  m.oval(0, 119, 0, 0.8, 1.25, 0.62, bronze);
  m.oval(0, 120.8, 0, 0.52, 0.68, 0.52, bronze);
  m.rod([0.5, 119.7, 0], [1.8, 119.1, -0.4], 0.24, bronze);
  m.rod([1.8, 119.1, -0.4], [2.9, 119.5, -0.55], 0.18, bronze);
  m.rod([-0.4, 119.7, 0], [-1.4, 118.4, 0.45], 0.26, bronze);
  return m.mesh('Nebraska State Capitol');
}

function ovalCorner(w, d, angle, exponent) {
  const x = Math.cos(angle),
    z = Math.sin(angle);
  return [
    Math.sign(x) * w * Math.pow(Math.abs(x), exponent),
    Math.sign(z) * d * Math.pow(Math.abs(z), exponent),
  ];
}
function bowlPoint(width, depth, y, angle) {
  const [x, z] = ovalCorner(width, depth, angle, 0.61);
  return [x, y, z];
}
function buildStadium() {
  const m = new Model();
  const white = '#edead9',
    turf = '#488260',
    concrete = '#baad98';
  m.box(0, 0.5, 0, 79, 1, 130, '#647469');
  m.box(0, 1.04, 0, 49, 0.1, 109.7, turf);
  for (const sign of [-1, 1]) {
    m.box(0, 1.13, sign * 50.3, 48.7, 0.12, 8.8, '#ad332f');
    m.box(sign * 24.36, 1.15, 0, 0.24, 0.13, 109.7, white);
    m.box(0, 1.16, sign * 54.84, 49, 0.13, 0.24, white);
    // Goalposts, with a rear support and two uprights.
    m.rod([0, 1.2, sign * 57], [0, 4.8, sign * 57], 0.17, '#e5c84b');
    m.rod([0, 4.8, sign * 57], [0, 4.8, sign * 55], 0.15, '#e5c84b');
    m.box(0, 4.8, sign * 55, 5.7, 0.26, 0.26, '#e5c84b');
    for (const side of [-1, 1]) m.box(side * 2.77, 7.9, sign * 55, 0.22, 6.1, 0.22, '#e5c84b');
  }
  for (let i = -10; i <= 10; i++) {
    m.box(0, 1.16, i * 4.572, 48.8, 0.13, 0.21, white);
    for (const side of [-1, 1])
      for (let tick = 1; tick < 5 && i < 10; tick++)
        m.box(side * 5.65, 1.16, i * 4.572 + tick * 0.9144, 0.55, 0.13, 0.12, white);
  }
  m.box(-3, 1.29, 0, 1.5, 0.14, 10, '#b63534');
  m.box(3, 1.29, 0, 1.5, 0.14, 10, '#b63534');
  m.box(0, 1.29, 0, 1.5, 0.14, 11.2, '#b63534', 0.55);
  const seatRed = ['#b64a42', '#d36a55', '#b95845', '#c14c41'];
  // Nested terraces leave the playing surface open from above.
  const tiers = 16,
    sections = 72;
  for (let tier = 0; tier < tiers; tier++) {
    const w = 34 + tier * 3.6,
      d = 64 + tier * 3.55,
      y = 2 + tier * 1.65;
    for (let seg = 0; seg < sections; seg++) {
      const a = (seg * tau) / sections,
        b = ((seg + 1) * tau) / sections;
      const start = bowlPoint(w, d, y, a),
        end = bowlPoint(w, d, y, b);
      const next = bowlPoint(w + 3.6, d + 3.55, y + 1.65, b),
        far = bowlPoint(w + 3.6, d + 3.55, y + 1.65, a);
      const lipA = [far[0], y, far[2]],
        lipB = [next[0], y, next[2]];
      m.quad(start, end, lipB, lipA, seg % 5 === 0 ? concrete : seatRed[(seg + tier) % 4]);
      m.quad(lipA, lipB, next, far, seg % 5 === 0 ? '#afa38e' : '#994a41');
      if (tier === tiers - 1)
        m.quad(far, next, [next[0], 0, next[2]], [far[0], 0, far[2]], '#b4987e');
    }
  }
  for (const sign of [-1, 1]) {
    m.box(sign * 84, 29, 0, 19, 17, 113, '#c1b6a2');
    m.box(sign * 84, 37.8, 0, 20, 1.2, 115, '#d1ccbc');
    for (const y of [24.5, 28.7, 32.9]) {
      m.box(sign * 93.6, y, 0, 0.6, 2.5, 105, '#667b7e');
      m.box(sign * 74.3, y, 0, 0.5, 2.5, 108, '#60787d');
    }
    for (let z = -54; z <= 54; z += 9)
      m.box(sign * 94, z === 0 ? 18 : 15, z, 1.8, 30, 1.2, concrete);
  }
  m.box(0, 14, -133, 82, 28, 20, '#b19f87');
  m.box(0, 34, -124, 49, 16, 2.6, '#444a48');
  m.box(0, 34, -122.5, 45, 12, 0.5, '#a73d36');
  return m.mesh('Memorial Stadium');
}

function buildArena() {
  const m = new Model();
  const segments = 48;
  const levels = [
    [0, 55, 69],
    [9, 57, 70],
    [12, 58, 72],
    [23, 62, 78],
    [28, 63, 77],
    [34, 60, 72],
    [37, 42, 51],
    [39, 0, 0],
  ];
  const cladding = ['#92766c', '#a1a59e', '#466976', '#c0c9c9', '#d1d6d0', '#c5d1ce', '#d0d7d1'];
  function corner(level, a) {
    const [y, width, depth] = levels[level];
    const [x, z] = ovalCorner(width, depth, a, 0.73);
    return [x, y + (level >= 3 ? 3.5 * Math.cos(a) - 1.8 * Math.sin(a) : 0), z];
  }
  for (let seg = 0; seg < segments; seg++) {
    const a = (seg * tau) / segments,
      b = ((seg + 1) * tau) / segments;
    for (let level = 0; level < levels.length - 1; level++) {
      const hi = level + 1;
      m.quad(corner(level, a), corner(level, b), corner(hi, b), corner(hi, a), cladding[level]);
    }
    m.rod(corner(2, a), corner(3, a), 0.27, '#b5c5c2');
    m.rod(corner(4, a), corner(4, b), 0.29, '#829699');
  }
  m.box(-21, 5.9, 76, 66, 11.8, 18, '#aa978b');
  m.box(-21, 12.1, 76, 67, 1, 19, '#c4c4bb');
  m.box(15, 7.5, 68, 47, 15, 12, '#63828c');
  m.box(15, 16, 71, 54, 1.5, 19, '#b7c5c5');
  return m.mesh('Pinnacle Bank Arena');
}

function buildGarden() {
  const m = new Model();
  m.box(0, 0.18, 0, 38, 0.3, 59, '#86a470');
  m.box(0, 0.4, 0, 3.8, 0.18, 57, '#d4c7a8');
  for (const s of [-1, 1]) {
    m.box(0, 0.42, s * 11.2, 36, 0.18, 2.8, '#d4c7a8');
    m.cylinder(0, 0.54, s * 16.8, 5.3, 0.3, 3.7, '#c5b29a');
    m.cylinder(0, 0.72, s * 16.8, 4.9, 0.18, 3.3, '#6faaaa');
    for (let row = -2; row <= 2; row++) {
      m.cylinder(s * 10, 0.65, row * 9, 6.5, 0.8, 3.6, '#567948');
      m.cylinder(
        s * 10,
        1.1,
        row * 9,
        5.6,
        0.36,
        2.8,
        ['#d97867', '#e8c36a', '#c7a3c4', '#ebd8bd', '#d78b6c'][row + 2],
      );
    }
  }
  const x = -12,
    z = -24;
  m.cylinder(x, 0.36, z, 4.5, 0.65, 4.5, '#d5c3a8');
  for (let i = 0; i < 8; i++) {
    const a = (i * tau) / 8;
    m.cylinder(x + 3.6 * Math.cos(a), 2.1, z + 3.6 * Math.sin(a), 0.24, 3.4, 0.24, '#b8a58a');
  }
  const roof = new THREE.SphereGeometry(1, 12, 6, 0, tau, 0, Math.PI / 2);
  m.shape(roof, [x, 3.8, z], [4.4, 2.3, 4.4], '#756a53');
  return m.mesh('Sunken Gardens');
}

export function makeLandmarks() {
  const group = new THREE.Group();
  for (const [build, location] of [
    [buildCapitol, capitol],
    [buildStadium, stadium],
    [buildArena, arena],
    [buildGarden, garden],
  ]) {
    const object = build();
    object.position.set(location[0], 0, location[1]);
    group.add(object);
  }
  return group;
}

// The coupe's body is lofted through transverse sections, with folded fenders,
// a fastback greenhouse, metal bumpers and inset lights on both fascias.
function coupe() {
  const m = new Model();
  const paint = '#d33b36',
    highlight = '#ed5446',
    darkPaint = '#982932';
  const stripe = '#f4e3b5',
    glass = '#365363',
    chrome = '#c4c8bd',
    rubber = '#262c30';
  const sections = [
    // z, body half-width, lower y, shoulder y, hood/deck y
    [-2.16, 0.8, 0.45, 0.71, 0.72],
    [-1.93, 0.94, 0.35, 0.74, 0.77],
    [-1.31, 0.98, 0.34, 0.83, 0.87],
    [-0.64, 0.94, 0.33, 0.79, 0.85],
    [0.7, 0.95, 0.34, 0.77, 0.82],
    [1.38, 1, 0.36, 0.84, 0.88],
    [1.92, 0.97, 0.39, 0.78, 0.79],
    [2.12, 0.91, 0.48, 0.76, 0.77],
  ];
  function section([z, w, b, s, t]) {
    return [
      [-w * 0.94, b, z],
      [-w, s, z],
      [-w * 0.84, t, z],
      [w * 0.84, t, z],
      [w, s, z],
      [w * 0.94, b, z],
    ];
  }
  const rings = sections.map(section);
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i],
      b = rings[i + 1];
    for (let j = 0; j < 6; j++) {
      const next = (j + 1) % 6;
      m.quad(
        a[j],
        a[next],
        b[next],
        b[j],
        [paint, highlight, paint, highlight, paint, darkPaint][j],
      );
    }
    const left = sections[i],
      right = sections[i + 1];
    for (const x of [-0.17, 0.17])
      m.quad(
        [x - 0.085, left[4] + 0.008, left[0]],
        [x + 0.085, left[4] + 0.008, left[0]],
        [x + 0.085, right[4] + 0.008, right[0]],
        [x - 0.085, right[4] + 0.008, right[0]],
        stripe,
      );
  }
  for (const end of [0, rings.length - 1]) {
    const face = rings[end];
    m.quad(face[0], face[1], face[4], face[5], paint);
    m.quad(face[1], face[2], face[3], face[4], paint);
  }
  // Tapered cabin, with a little rake in every pillar.
  const frontBase = [-0.8, 0.84, -0.76],
    frontTop = [-0.66, 1.34, -0.24];
  const rearBase = [-0.82, 0.85, 1.22],
    rearTop = [-0.69, 1.35, 0.47];
  const mirror = (v) => [-v[0], v[1], v[2]];
  m.quad(frontBase, mirror(frontBase), mirror(frontTop), frontTop, '#6f949e');
  m.quad(rearTop, mirror(rearTop), mirror(rearBase), rearBase, glass);
  m.quad(frontTop, mirror(frontTop), mirror(rearTop), rearTop, paint);
  for (const x of [-0.17, 0.17]) {
    m.quad(
      [x - 0.085, 1.347, -0.24],
      [x + 0.085, 1.347, -0.24],
      [x + 0.085, 1.357, 0.47],
      [x - 0.085, 1.357, 0.47],
      stripe,
    );
    m.box(x, 0.615, 2.127, 0.17, 0.25, 0.015, stripe);
  }
  for (const fold of [(p) => p, mirror]) {
    const a = fold(frontBase),
      b = fold(frontTop),
      c = fold(rearTop),
      d = fold(rearBase);
    m.quad(a, b, c, d, glass);
    m.rod(a, b, 0.041, chrome);
    m.rod(b, c, 0.036, chrome);
    m.rod(c, d, 0.053, paint);
    m.rod(d, a, 0.038, chrome);
    m.rod(fold([-0.745, 1.32, 0.28]), fold([-0.82, 0.87, 0.39]), 0.042, rubber);
  }
  // Wheels turn around the local X axis. Hub, steel lip and cap sit slightly
  // proud of the tire so the wheels stay readable at chase-camera distance.
  for (const s of [-1, 1]) {
    for (const z of [-1.32, 1.32]) {
      const wheel = (x, r, width, hex) =>
        m.shape(cylinder, [x, 0.369, z], [r, width, r], hex, [0, 0, Math.PI / 2]);
      wheel(s * 0.907, 0.366, 0.19, rubber);
      wheel(s * 1.007, 0.23, 0.03, chrome);
      wheel(s * 1.028, 0.171, 0.023, '#67787b');
      wheel(s * 1.047, 0.09, 0.023, chrome);
      for (let i = 0; i < 5; i++) {
        const angle = (i * tau) / 5;
        m.rod(
          [s * 1.044, 0.369 + 0.08 * Math.cos(angle), z + 0.08 * Math.sin(angle)],
          [s * 1.044, 0.369 + 0.182 * Math.cos(angle), z + 0.182 * Math.sin(angle)],
          0.017,
          chrome,
        );
      }
    }
    m.box(s * 0.957, 0.55, 0, 0.018, 0.038, 1.95, chrome);
    m.box(s * 0.962, 0.73, 0.38, 0.018, 0.037, 0.18, chrome);
    m.rod([s * 0.83, 0.87, -0.5], [s * 1.018, 0.94, -0.52], 0.028, chrome);
    m.oval(s * 1.035, 0.95, -0.52, 0.102, 0.069, 0.13, paint);
    m.box(s * 0.62, 0.63, 2.132, 0.44, 0.14, 0.035, '#661b27');
    for (let j = -1; j <= 1; j++)
      m.box(s * 0.62 + j * 0.115, 0.655, 2.156, 0.086, 0.085, 0.018, '#ff5c43');
    m.box(s * 0.665, 0.482, 2.153, 0.42, 0.075, 0.08, chrome);
    for (const t of [-1, 1]) {
      const headX = s * 0.62 + t * 0.098;
      m.shape(cylinder, [headX, 0.635, -2.164], [0.086, 0.042, 0.086], chrome, [Math.PI / 2, 0, 0]);
      m.shape(cylinder, [headX, 0.635, -2.193], [0.067, 0.025, 0.067], '#fff0b9', [
        Math.PI / 2,
        0,
        0,
      ]);
    }
  }
  m.box(0, 0.61, -2.17, 0.87, 0.17, 0.044, '#272f33');
  for (const y of [0.562, 0.611, 0.659]) m.box(0, y, -2.195, 0.85, 0.015, 0.012, chrome);
  m.box(0, 0.465, -2.155, 1.68, 0.09, 0.1, chrome);
  m.box(0, 0.475, 2.155, 0.99, 0.095, 0.11, chrome);
  m.box(0, 0.585, 2.15, 0.39, 0.17, 0.034, '#e8dcb4');
  m.box(0, 0.62, 2.174, 0.32, 0.021, 0.015, '#527c7b');
  // Pixel-stroke "LNK" on the rear license plate.
  const alphabet = ['100100111', '101111101', '101110101'];
  for (let letter = 0; letter < 3; letter++) {
    const bitmap = alphabet[letter];
    for (let j = 0; j < 9; j++)
      if (bitmap[j] === '1')
        m.box(
          (letter - 1) * 0.066 + ((j % 3) - 1) * 0.016,
          0.586 - Math.floor(j / 3) * 0.018,
          2.176,
          0.016,
          0.018,
          0.01,
          '#3b4c50',
        );
  }
  return m.mesh('Prairie coupe');
}

function hiker() {
  const m = new Model(),
    group = new THREE.Group();
  const jacket = '#d5a44a',
    denim = '#405c69',
    skin = '#bb805d',
    boot = '#594c3f';
  m.oval(0, 1.22, 0, 0.235, 0.34, 0.16, jacket);
  m.oval(0, 1.68, -0.015, 0.15, 0.183, 0.14, skin);
  m.oval(0, 1.82, 0.005, 0.159, 0.11, 0.145, '#4a3930');
  m.cylinder(0, 1.87, -0.023, 0.17, 0.045, 0.17, '#6b7d66');
  m.cylinder(0, 1.923, 0.008, 0.135, 0.084, 0.128, '#738871');
  m.box(0, 1.24, 0.135, 0.262, 0.354, 0.13, '#7c5840');
  m.box(0, 1.15, 0.2, 0.188, 0.12, 0.055, '#aa7c4f');
  group.add(m.mesh('Walker'));
  for (const s of [-1, 1]) {
    const leg = new Model(),
      arm = new Model();
    leg.rod([0, 0, 0], [0, -0.38, -0.015], 0.101, denim);
    leg.rod([0, -0.38, -0.015], [0, -0.8, 0.015], 0.084, denim);
    leg.oval(0, -0.84, -0.035, 0.102, 0.094, 0.173, boot);
    const legMesh = leg.mesh(s === 1 ? 'legR' : 'legL');
    legMesh.position.set(s * 0.108, 0.934, 0);
    group.add(legMesh);
    arm.rod([0, 0, 0], [s * 0.045, -0.254, 0.032], 0.087, jacket);
    arm.rod([s * 0.045, -0.254, 0.032], [s * 0.043, -0.49, -0.023], 0.062, skin);
    arm.oval(s * 0.043, -0.505, -0.023, 0.063, 0.09, 0.067, skin);
    const armMesh = arm.mesh(s === 1 ? 'armR' : 'armL');
    armMesh.position.set(s * 0.205, 1.43, 0);
    group.add(armMesh);
  }
  return group;
}
function bicycle() {
  const m = new Model();
  const tire = '#2d3434',
    frame = '#c9653b',
    metal = '#b8c5c1',
    jersey = '#44938d',
    dark = '#35414b',
    skin = '#ae795c';
  const wheelR = 0.35;
  for (const z of [-0.58, 0.58]) {
    const rim = new THREE.TorusGeometry(wheelR - 0.025, 0.028, 6, 30);
    m.shape(rim, [0, wheelR, z], [1, 1, 1], tire, [0, Math.PI / 2, 0]);
    for (let i = 0; i < 10; i++) {
      const a = (i * tau) / 10;
      m.rod(
        [0, wheelR, z],
        [0, wheelR + 0.324 * Math.cos(a), z + 0.324 * Math.sin(a)],
        0.0065,
        metal,
      );
    }
  }
  const crank = [0, 0.36, 0.05],
    seat = [0, 0.9, 0.22],
    head = [0, 0.83, -0.43],
    back = [0, 0.35, 0.58],
    front = [0, 0.35, -0.58];
  for (const [a, b] of [
    [seat, back],
    [back, crank],
    [crank, seat],
    [seat, head],
    [head, crank],
    [head, front],
  ])
    m.rod(a, b, 0.029, frame);
  m.rod([0, 0.83, -0.43], [0, 1.07, -0.48], 0.026, metal);
  m.box(0, 1.08, -0.51, 0.52, 0.045, 0.047, tire);
  m.oval(0, 0.97, 0.235, 0.122, 0.043, 0.158, '#463c35');
  // Bent knees and arms keep the rider's silhouette distinct from the walker.
  m.rod([0, 1.01, 0.21], [0, 1.42, -0.024], 0.14, jersey);
  m.oval(0, 1.61, -0.073, 0.136, 0.166, 0.13, skin);
  m.oval(0, 1.72, -0.063, 0.153, 0.11, 0.164, '#efe5cd');
  for (const s of [-1, 1]) {
    const knee = [s * 0.109, 0.8 + s * 0.09, -0.09],
      foot = [s * 0.12, 0.38 + s * 0.1, 0.01 + s * 0.09];
    m.rod([s * 0.084, 1.02, 0.2], knee, 0.093, dark);
    m.rod(knee, foot, 0.059, skin);
    m.oval(foot[0], foot[1], foot[2] - 0.035, 0.065, 0.045, 0.13, '#e6dac3');
    m.rod([s * 0.145, 1.4, -0.05], [s * 0.198, 1.22, -0.16], 0.07, jersey);
    m.rod([s * 0.198, 1.22, -0.16], [s * 0.228, 1.09, -0.504], 0.048, skin);
  }
  return m.mesh('Prairie cyclist');
}
function helicopter() {
  const m = new Model(),
    group = new THREE.Group();
  const ice = '#e5dfbf',
    blue = '#477b84',
    glass = '#355a6b',
    graphite = '#3c484a',
    accent = '#cb653f';
  m.oval(0, 1.48, -0.24, 1.03, 0.9, 2.05, ice);
  m.oval(0, 1.58, -1.03, 0.97, 0.84, 1.35, glass);
  m.oval(0, 1.06, -0.85, 1.02, 0.38, 1.47, blue);
  m.oval(0, 2.12, 0.31, 0.69, 0.53, 1.06, blue);
  m.box(0, 2.49, 0.27, 0.62, 0.21, 1.15, graphite);
  m.rod([0, 1.56, 1.19], [0, 2.32, 5.14], 0.18, ice);
  m.rod([0, 1.57, 1.22], [0, 1.83, 2.74], 0.34, blue);
  m.rod([0, 2.26, 4.88], [0, 3.12, 5.34], 0.145, accent);
  m.box(0, 2.18, 4.14, 1.62, 0.079, 0.4, blue);
  for (const s of [-1, 1]) {
    m.rod([s * 0.73, 0.95, -0.77], [s * 0.94, 0.25, -0.73], 0.076, graphite);
    m.rod([s * 0.73, 0.95, 0.72], [s * 0.94, 0.25, 0.81], 0.076, graphite);
    m.rod([s * 0.94, 0.19, 1.23], [s * 0.94, 0.19, -1.44], 0.095, graphite);
    m.rod([s * 0.94, 0.19, -1.44], [s * 0.94, 0.38, -1.78], 0.09, graphite);
    m.rod([s * 0.74, 2, -1.6], [s * 0.99, 1.4, -1.17], 0.047, ice);
    m.rod([s * 0.86, 1.88, -0.07], [s * 1.01, 1.34, -0.04], 0.045, ice);
    m.box(s * 1.007, 1.36, 0.06, 0.04, 0.061, 0.22, graphite);
  }
  m.rod([0, 2.53, 0.1], [0, 3.12, 0.1], 0.108, graphite);
  group.add(m.mesh('Helicopter fuselage'));
  const rotor = new Model();
  rotor.cylinder(0, 0, 0, 0.24, 0.18, 0.24, graphite);
  for (let i = 0; i < 3; i++) {
    const a = (i * tau) / 3;
    rotor.box(2.16 * Math.sin(a), 0, 2.16 * Math.cos(a), 0.23, 0.075, 4.18, graphite, a);
    rotor.box(4.14 * Math.sin(a), 0.004, 4.14 * Math.cos(a), 0.235, 0.079, 0.26, '#e6bb54', a);
  }
  const blades = rotor.mesh('rotor');
  blades.position.set(0, 3.12, 0.1);
  group.add(blades);
  const tail = new Model();
  tail.box(0, 0, 0, 0.064, 1.3, 0.12, graphite);
  tail.box(0, 0, 0, 0.064, 0.12, 1.3, graphite);
  const tailBlades = tail.mesh('tailRotor');
  tailBlades.position.set(0.175, 2.91, 5.22);
  group.add(tailBlades);
  return group;
}

// All four roots have their ground contact at y=0 and point down local -Z.
export function makeVehicle(mode) {
  const factories = { car: coupe, walk: hiker, bike: bicycle, fly: helicopter };
  const group = new THREE.Group();
  group.name = mode;
  group.add((factories[mode] ?? coupe)());
  return group;
}
