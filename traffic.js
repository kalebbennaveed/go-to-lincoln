import * as THREE from './vendor/three.module.min.js';

// Traffic chooses a connected street at each junction and keeps to its right-hand lane.
export function makeTraffic(roads, scene) {
  const node = (p) => p[0] + ',' + p[1],
    ends = new Map(),
    routes = [];
  for (const r of roads) {
    if (r.w < 8 || r.p.length < 2) continue;
    const lengths = [];
    let total = 0;
    for (let i = 1; i < r.p.length; i++) {
      total += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
      lengths.push(total);
    }
    if (total < 16) continue;
    const route = { r, lengths, total };
    routes.push(route);
    for (const reverse of [false, true]) {
      const key = node(reverse ? r.p.at(-1) : r.p[0]);
      if (!ends.has(key)) ends.set(key, []);
      ends.get(key).push({ route, reverse });
    }
  }
  const count = 72,
    colors = ['#9b3731', '#35616b', '#545957', '#e0d9c3', '#786c76', '#bc8857', '#6d8b7b'];
  const parts = [
    [
      [1.8, 0.68, 4.3],
      [0, 0.64, 0],
    ],
    [
      [1.52, 0.66, 2.13],
      [0, 1.19, 0.12],
    ],
    [
      [1.42, 0.4, 1.9],
      [0, 1.26, 0.12],
    ],
    [
      [1.75, 0.14, 0.08],
      [0, 0.72, 2.16],
    ],
    [
      [1.75, 0.13, 0.08],
      [0, 0.68, -2.16],
    ],
  ];
  const meshes = parts.map(([dims], j) => {
    const g = new THREE.BoxGeometry(...dims),
      mat = new THREE.MeshLambertMaterial({
        color: j === 2 ? '#536c70' : j === 3 ? '#aa4138' : j === 4 ? '#dfd4ac' : '#ffffff',
      });
    const mesh = new THREE.InstancedMesh(g, mat, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    return mesh;
  });
  const nearStart = routes.filter(
    ({ r }) => Math.abs(r.p[0][0] + 345) < 350 && Math.abs(r.p[0][1] - 214) < 350,
  );
  const movers = Array.from({ length: count }, (_, i) => {
    const route =
      i < 12 && nearStart.length
        ? nearStart[(i * 7) % nearStart.length]
        : routes[(i * 173 + 53) % routes.length];
    for (let j = 0; j < 2; j++) meshes[j].setColorAt(i, new THREE.Color(colors[i % colors.length]));
    return {
      route,
      reverse: i % 3 === 1,
      along: ((i * 0.317) % 1) * route.total,
      pace: 5 + ((i * 7) % 11) * 0.65,
      tick: i,
    };
  });
  const dummy = new THREE.Object3D();
  return (dt, player) => {
    movers.forEach((m, i) => {
      const close =
        Math.hypot((m.x ?? 1e6) - player.x, (m.z ?? 1e6) - player.z) < 6 && player.y < 3;
      if (!close) m.along += m.pace * dt;
      if (m.along >= m.route.total) {
        const end = m.reverse ? m.route.r.p[0] : m.route.r.p.at(-1),
          options = (ends.get(node(end)) || []).filter((c) => c.route !== m.route);
        const next = options[(m.tick++ * 13 + i) % options.length];
        m.along = 0;
        if (next) Object.assign(m, next);
        else m.reverse = !m.reverse;
      }
      const { r, lengths, total } = m.route,
        d = m.reverse ? total - m.along : m.along;
      let j = lengths.findIndex((x) => x >= d);
      if (j < 0) j = lengths.length - 1;
      const [ax, az] = r.p[j],
        [bx, bz] = r.p[j + 1],
        len = lengths[j] - (lengths[j - 1] || 0),
        u = (d - (lengths[j - 1] || 0)) / Math.max(0.01, len);
      const dx = ((bx - ax) / len) * (m.reverse ? -1 : 1),
        dz = ((bz - az) / len) * (m.reverse ? -1 : 1);
      m.x = ax + (bx - ax) * u - dz * r.w * 0.24;
      m.z = az + (bz - az) * u + dx * r.w * 0.24;
      const angle = Math.atan2(-dx, -dz);
      parts.forEach(([, pos], k) => {
        dummy.position.set(
          m.x + Math.sin(angle) * pos[2],
          pos[1] + 0.08,
          m.z + Math.cos(angle) * pos[2],
        );
        dummy.rotation.y = angle;
        dummy.updateMatrix();
        meshes[k].setMatrixAt(i, dummy.matrix);
      });
    });
    meshes.forEach((mesh) => (mesh.instanceMatrix.needsUpdate = true));
  };
}
