const east = 111320 * Math.cos((40.81 * Math.PI) / 180);
const locations = [
  ['Nebraska State Capitol', 'Capitol District', -96.69965, 40.80808],
  ['Historic Haymarket', 'Haymarket', -96.71005, 40.81493],
  ['Memorial Stadium', 'University of Nebraska', -96.70564, 40.82066],
  ['Pinnacle Bank Arena', 'West Haymarket', -96.7125, 40.81797],
  ['Sunken Gardens', 'Near South', -96.68347, 40.80224],
];
export const places = locations.map(([name, district, lon, lat], i) => ({
  id: i,
  name,
  district,
  x: (lon + 96.7) * east,
  z: (40.81 - lat) * 111320,
}));
export const distanceText = (m) =>
  m < 160 ? `${Math.round((m * 3.28084) / 10) * 10} ft` : `${(m / 1609.344).toFixed(1)} mi`;
const $ = (id) => document.getElementById(id);
function trace(ctx, ring) {
  ring.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
}
function prepareBase(city) {
  const [left, top, right, bottom] = city.bounds,
    scale = Math.min(0.57, 3000 / Math.max(right - left, bottom - top));
  const base = document.createElement('canvas');
  base.width = Math.ceil((right - left) * scale);
  base.height = Math.ceil((bottom - top) * scale);
  const ctx = base.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
  ctx.fillStyle = '#cdd0b7';
  ctx.fillRect(left, top, right - left, bottom - top);
  for (const [features, color] of [
    [city.parks, '#a4bd8d'],
    [city.water, '#8fb7b7'],
    [city.buildings, '#b2b49f'],
  ]) {
    ctx.fillStyle = color;
    for (const f of features || []) {
      ctx.beginPath();
      trace(ctx, f.p);
      ctx.closePath();
      for (const hole of f.holes || []) {
        trace(ctx, hole);
        ctx.closePath();
      }
      ctx.fill('evenodd');
    }
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const outline of [true, false])
    for (const r of city.roads) {
      ctx.lineWidth = Math.max(r.w, 0.9 / scale) + (outline ? 3 : 0);
      ctx.strokeStyle = outline ? '#aaa998' : r.w >= 15 ? '#f8dfa5' : '#f7f3db';
      ctx.beginPath();
      trace(ctx, r.p);
      ctx.stroke();
    }
  return { base, left, top, right, bottom };
}
function pin(ctx, x, y, n, selected, done) {
  ctx.beginPath();
  ctx.arc(x, y, selected ? 10 : 8, 0, Math.PI * 2);
  ctx.fillStyle = selected ? '#ac482e' : done ? '#417553' : '#2d5147';
  ctx.fill();
  ctx.strokeStyle = '#fef8dc';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#fff9e5';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n + 1), x, y + 0.5);
}
function playerArrow(ctx, x, y, heading) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(6.8, 7);
  ctx.lineTo(0, 4);
  ctx.lineTo(-6.8, 7);
  ctx.closePath();
  ctx.fillStyle = '#bb462c';
  ctx.strokeStyle = '#fff8dc';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}
export function makeAtlas(city, player, onTravel, onResume, toast) {
  const map = prepareBase(city),
    mini = $('mini'),
    large = $('large-map'),
    dialog = $('atlas');
  let wideMap = null,
    wideCity = null,
    wide = false,
    custom = null,
    projection = null,
    streetNames = new Map();
  let selected = 0,
    target = null,
    transform = null,
    visited = new Set();
  const memoRoads = (roads) => {
    streetNames = new Map();
    for (const r of roads) {
      if (!r.n || r.n === 'Access Road') continue;
      const key = r.n.toLowerCase();
      if (!streetNames.has(key)) streetNames.set(key, []);
      streetNames.get(key).push(r);
    }
  };
  memoRoads(city.roads);
  function setRegion(region) {
    wideCity = region;
    wideMap = prepareBase({ ...region, buildings: [] });
    memoRoads(region.roads);
    $('map-scale').disabled = false;
    if (dialog.open) draw(large, true);
  }
  $('map-scale').disabled = true;
  function selectPoint(p) {
    custom = p;
    selected = -1;
    buttons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
    $('search-result').hidden = false;
    $('search-result').textContent = p.name;
    draw(large, true);
  }
  function current() {
    return selected < 0 ? custom : places[selected];
  }
  function setWide(on) {
    wide = on;
    $('map-scale').textContent = wide ? 'Show downtown' : 'Show all Lincoln';
  }
  $('map-scale').onclick = () => {
    setWide(!wide);
    draw(large, true);
  };
  function matchNames(q) {
    return [...streetNames.keys()]
      .filter((n) => n.includes(q))
      .sort((a, b) => Number(b.startsWith(q)) - Number(a.startsWith(q)) || a.localeCompare(b));
  }
  $('street-query').oninput = () => {
    const q = $('street-query').value.trim().toLowerCase();
    $('street-names').replaceChildren();
    if (!q) return;
    for (const name of matchNames(q).slice(0, 20)) {
      const option = document.createElement('option');
      option.value = streetNames.get(name)[0].n;
      $('street-names').append(option);
    }
  };
  $('street-search').onsubmit = (e) => {
    e.preventDefault();
    const q = $('street-query').value.trim().toLowerCase(),
      name = streetNames.has(q) ? q : matchNames(q)[0];
    if (!name) {
      $('search-result').hidden = false;
      $('search-result').textContent = 'No matching street in the mapped area.';
      return;
    }
    const segments = streetNames.get(name);
    let closest = null,
      d = Infinity;
    for (const r of segments) {
      const mid = Math.floor((r.p.length - 2) / 2),
        p = r.p[mid],
        last = r.p[mid + 1],
        x = (p[0] + last[0]) / 2,
        z = (p[1] + last[1]) / 2,
        dist = Math.hypot(x - player.x, z - player.z);
      if (dist < d) {
        d = dist;
        closest = { name: r.n, street: r.n, x, z };
      }
    }
    setWide(!!wideMap);
    selectPoint(closest);
  };
  try {
    const saved = JSON.parse(localStorage.getItem('lincoln.drive.visited') || '[]');
    if (Array.isArray(saved))
      visited = new Set(saved.filter((i) => Number.isInteger(i) && i >= 0 && i < places.length));
  } catch {}
  const buttons = places.map((p) => {
    const b = document.createElement('button');
    b.className = 'place';
    b.innerHTML = `<span>${p.id + 1}</span>${p.name}<em></em>`;
    b.onclick = () => choose(p.id);
    $('places').append(b);
    return b;
  });
  function choose(id) {
    selected = id;
    custom = null;
    $('search-result').hidden = true;
    buttons.forEach((b, i) => {
      b.setAttribute('aria-pressed', i === selected);
      b.lastElementChild.textContent = visited.has(i) ? '✓' : '';
    });
    $('progress').textContent = `${visited.size} / ${places.length}`;
    if (dialog.open) draw(large, true);
  }
  function setTarget(p) {
    target = p;
    document.querySelector('.waypoint').hidden = !p;
    if (p) {
      $('target-label').textContent = p.name;
      $('remaining').textContent = distanceText(Math.hypot(p.x - player.x, p.z - player.z));
    }
  }
  function draw(canvas, isFull) {
    const rect = canvas.getBoundingClientRect(),
      w = rect.width,
      h = rect.height;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2),
      pw = Math.round(w * dpr),
      ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#cbd0b7';
    ctx.fillRect(0, 0, w, h);
    let cx = isFull ? (Math.min(player.x, -1138) + Math.max(player.x, 1440)) / 2 : player.x,
      cz = isFull ? (Math.min(player.z, -1190) + Math.max(player.z, 930)) / 2 : player.z;
    let scale = isFull
      ? Math.min(
          w / (Math.max(player.x, 1440) - Math.min(player.x, -1138) + 420),
          h / (Math.max(player.z, 930) - Math.min(player.z, -1190) + 400),
        )
      : w / 570;
    if (isFull && wide && wideCity) {
      const b = wideCity.bounds;
      cx = (b[0] + b[2]) / 2;
      cz = (b[1] + b[3]) / 2;
      scale = Math.min(w / (b[2] - b[0]), h / (b[3] - b[1]));
    }
    const x = (v) => (v - cx) * scale + w / 2,
      z = (v) => (v - cz) * scale + h / 2;
    if (isFull) projection = { cx, cz, scale, w, h };
    for (const layer of [wideMap, map])
      if (layer)
        ctx.drawImage(
          layer.base,
          x(layer.left),
          z(layer.top),
          (layer.right - layer.left) * scale,
          (layer.bottom - layer.top) * scale,
        );
    if (target) {
      ctx.strokeStyle = '#ba4f34';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(x(player.x), z(player.z));
      ctx.lineTo(x(target.x), z(target.z));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const p of places)
      pin(ctx, x(p.x), z(p.z), p.id, isFull ? selected === p.id : target === p, visited.has(p.id));
    if (isFull && custom) {
      ctx.fillStyle = '#ae4228';
      ctx.beginPath();
      ctx.arc(x(custom.x), z(custom.z), 5, 0, Math.PI * 2);
      ctx.fill();
    }
    playerArrow(ctx, x(player.x), z(player.z), player.heading);
    if (isFull) transform = places.map((p) => [x(p.x), z(p.z)]);
  }
  large.addEventListener('click', (e) => {
    const box = large.getBoundingClientRect(),
      px = e.clientX - box.left,
      py = e.clientY - box.top;
    const i = transform?.findIndex(([x, y]) => Math.hypot(x - px, y - py) < 11);
    if (i >= 0) {
      choose(i);
      return;
    }
    const { cx, cz, scale, w, h } = projection,
      x = cx + (px - w / 2) / scale,
      z = cz + (py - h / 2) / scale,
      b = wideCity?.bounds || city.bounds;
    if (x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3])
      selectPoint({ name: 'Dropped pin', x, z });
  });
  function open() {
    if (!dialog.open) dialog.showModal();
    if (target && !Number.isInteger(target.id)) selectPoint(target);
    else if (target || selected >= 0) choose(target?.id ?? selected);
    else draw(large, true);
  }
  function close() {
    dialog.close();
    onResume();
  }
  function visit(p) {
    if (visited.has(p.id)) return;
    visited.add(p.id);
    try {
      localStorage.setItem('lincoln.drive.visited', JSON.stringify([...visited]));
    } catch {}
    toast(
      visited.size === places.length
        ? 'Tour complete · All five landmarks visited'
        : `${p.name} · ${visited.size}/${places.length} visited`,
    );
    if (selected >= 0) choose(selected);
    else {
      $('progress').textContent = `${visited.size} / ${places.length}`;
      buttons[p.id].lastElementChild.textContent = '✓';
    }
  }
  $('set-target').onclick = () => {
    setTarget(current());
    close();
  };
  $('travel').onclick = () => {
    const p = current();
    onTravel(p);
    setTarget(null);
    if (Number.isInteger(p.id)) visit(p);
    close();
  };
  $('clear-target').onclick = () => setTarget(null);
  dialog.querySelector('.close').onclick = close;
  dialog.addEventListener('close', onResume);
  $('map-button').onclick = open;
  function update() {
    draw(mini, false);
    if (dialog.open) {
      draw(large, true);
      return;
    }
    if (target)
      $('remaining').textContent = distanceText(
        Math.hypot(target.x - player.x, target.z - player.z),
      );
    if (
      target &&
      !Number.isInteger(target.id) &&
      Math.hypot(target.x - player.x, target.z - player.z) < 35
    ) {
      toast(`Arrived · ${target.name}`);
      setTarget(null);
    }
    for (const p of places) {
      const distance = Math.hypot(p.x - player.x, p.z - player.z);
      const r = [155, 53, 177, 150, 88][p.id];
      if (distance <= r && player.y < 160) {
        visit(p);
        if (target === p) {
          setTarget(null);
          if (visited.size !== places.length) toast(`Arrived · ${p.name}`);
        }
      }
    }
  }
  choose(0);
  return { open, update, setRegion, drawMini: () => draw(mini, false) };
}
