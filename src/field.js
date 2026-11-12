export const NX = 180;
export const NY = 91;
export const ORIGIN = [0, -90, 0];
export const SPACING = [2, 2, 1];

function idx(i, j) {
  return j * NX + i;
}

function lonLat(i, j) {
  return [ORIGIN[0] + i * SPACING[0], ORIGIN[1] + j * SPACING[1]];
}

function cycloneJet(lon, lat) {
  const jetLat = (lat - 43) / 11;
  const jet = 16 * Math.exp(-(jetLat * jetLat)) * (0.65 + 0.35 * Math.sin((lon * Math.PI) / 90));
  const storms = [
    [138, 38, 26, 210],
    [310, 42, 18, 160],
    [80, -22, 14, 140],
    [200, -40, 16, 180],
  ];
  let u = jet;
  let v = 2.2 * Math.sin((lon * Math.PI) / 60) * Math.cos((lat * Math.PI) / 180);
  for (const [cx, cy, amp, rad] of storms) {
    let dlon = lon - cx;
    if (dlon > 180) dlon -= 360;
    if (dlon < -180) dlon += 360;
    const dlat = lat - cy;
    const r2 = dlon * dlon + dlat * dlat;
    const vortex = amp * Math.exp(-r2 / rad);
    const r = Math.sqrt(r2) + 0.6;
    u += -vortex * (dlat / r);
    v += vortex * (dlon / r);
  }
  const tradeLat = (lat + 12) / 16;
  const trades = -7 * Math.exp(-(tradeLat * tradeLat));
  u += trades;
  return [u, v];
}

function doubleGyre(lon, lat) {
  const x = lon / 360;
  const y = (lat + 90) / 180;
  const a = 0.1;
  const e = 0.25;
  const t = 0.4;
  const n = Math.sin(t);
  const f = e * n * x * x + (1 - 2 * e * n) * x;
  const df = 2 * e * n * x + (1 - 2 * e * n);
  const u = -Math.PI * a * Math.sin(Math.PI * f) * Math.cos(Math.PI * y) * 40;
  const v = Math.PI * a * Math.cos(Math.PI * f) * Math.sin(Math.PI * y) * df * 80;
  return [u, v];
}

function saddleJet(lon, lat) {
  const x = (lon - 180) / 90;
  const y = lat / 45;
  const jetOff = lat - 28;
  const u = 9 * y + 14 * Math.exp(-(jetOff * jetOff) / 90);
  const v = 8 * x * Math.exp(-(x * x + y * y) * 0.35);
  return [u, v];
}

function fillFromSampler(sampler) {
  const vectors = new Float32Array(NX * NY * 3);
  const speed = new Float32Array(NX * NY);
  let maxSpeed = 0;
  for (let j = 0; j < NY; j += 1) {
    for (let i = 0; i < NX; i += 1) {
      const [lon, lat] = lonLat(i, j);
      const [u, v] = sampler(lon, lat);
      const k = idx(i, j);
      vectors[k * 3] = u;
      vectors[k * 3 + 1] = v;
      vectors[k * 3 + 2] = 0;
      const s = Math.hypot(u, v);
      speed[k] = s;
      if (s > maxSpeed) maxSpeed = s;
    }
  }
  return { vectors, speed, maxSpeed };
}

function fillFromGfs(json) {
  const { nx, ny, u, v } = json;
  const vectors = new Float32Array(NX * NY * 3);
  const speed = new Float32Array(NX * NY);
  let maxSpeed = 0;
  for (let j = 0; j < NY; j += 1) {
    const srcJ = ny - 1 - j;
    for (let i = 0; i < NX; i += 1) {
      const srcI = Math.min(i, nx - 1);
      const src = srcJ * nx + srcI;
      const uu = u[src] ?? 0;
      const vv = v[src] ?? 0;
      const k = idx(i, j);
      vectors[k * 3] = uu;
      vectors[k * 3 + 1] = vv;
      vectors[k * 3 + 2] = 0;
      const s = Math.hypot(uu, vv);
      speed[k] = s;
      if (s > maxSpeed) maxSpeed = s;
    }
  }
  return { vectors, speed, maxSpeed };
}

export function sampleField(field, x, y, out) {
  const fx = (x - ORIGIN[0]) / SPACING[0];
  const fy = (y - ORIGIN[1]) / SPACING[1];
  if (fx < 0 || fy < 0 || fx > NX - 1 || fy > NY - 1) return false;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const i1 = Math.min(i0 + 1, NX - 1);
  const j1 = Math.min(j0 + 1, NY - 1);
  const tx = fx - i0;
  const ty = fy - j0;
  const { vectors } = field;
  const a = idx(i0, j0) * 3;
  const b = idx(i1, j0) * 3;
  const c = idx(i0, j1) * 3;
  const d = idx(i1, j1) * 3;
  const u =
    (vectors[a] * (1 - tx) + vectors[b] * tx) * (1 - ty) +
    (vectors[c] * (1 - tx) + vectors[d] * tx) * ty;
  const v =
    (vectors[a + 1] * (1 - tx) + vectors[b + 1] * tx) * (1 - ty) +
    (vectors[c + 1] * (1 - tx) + vectors[d + 1] * tx) * ty;
  out[0] = u;
  out[1] = v;
  out[2] = Math.hypot(u, v);
  return true;
}

export function stepRK2(field, x, y, dt, tmp) {
  if (!sampleField(field, x, y, tmp)) return null;
  const mx = x + tmp[0] * dt * 0.5;
  const my = y + tmp[1] * dt * 0.5;
  if (!sampleField(field, mx, my, tmp)) return null;
  const x2 = x + tmp[0] * dt;
  const y2 = y + tmp[1] * dt;
  if (!sampleField(field, x2, y2, tmp)) return null;
  return [x2, y2, tmp[2]];
}

function wrapField(kind, packed, label, unit) {
  const advectionScale = 1.15 / Math.max(packed.maxSpeed, 1e-6);
  return {
    kind,
    label,
    unit,
    nx: NX,
    ny: NY,
    origin: ORIGIN,
    spacing: SPACING,
    vectors: packed.vectors,
    speed: packed.speed,
    maxSpeed: packed.maxSpeed,
    advectionScale,
    bounds: [0, 358, -90, 90, 0, 0],
  };
}

const SAMPLERS = {
  cyclone: cycloneJet,
  gyre: doubleGyre,
  saddle: saddleJet,
};

export function createSyntheticField(kind) {
  const sampler = SAMPLERS[kind] ?? cycloneJet;
  const labels = {
    cyclone: '合成・低気圧と偏西風',
    gyre: '合成・ダブルジャイア',
    saddle: '合成・鞍点とジェット',
  };
  return wrapField(kind, fillFromSampler(sampler), labels[kind] ?? kind, '相対');
}

export function createGfsField(json) {
  return wrapField('gfs', fillFromGfs(json), `GFS ${json.refTime?.slice(0, 10) ?? ''} 地表風`, 'm/s');
}

export function randomInDomain() {
  return [Math.random() * 358, Math.random() * 180 - 90];
}
