import { createCanvasLayer, createProjector } from './canvas-layer';
import { sampleField } from './field';
import { speedToRgb } from './color';

function hashNoise(i, j, seed) {
  let n = Math.sin(i * 127.1 + j * 311.7 + seed * 74.13) * 43758.5453;
  return n - Math.floor(n);
}

function sampleBuf(buf, w, h, x, y) {
  const xx = ((x % w) + w) % w;
  const yy = Math.min(h - 1.001, Math.max(0, y));
  const i0 = Math.floor(xx);
  const j0 = Math.floor(yy);
  const i1 = (i0 + 1) % w;
  const j1 = Math.min(h - 1, j0 + 1);
  const tx = xx - i0;
  const ty = yy - j0;
  const a = buf[j0 * w + i0];
  const b = buf[j0 * w + i1];
  const c = buf[j1 * w + i0];
  const d = buf[j1 * w + i1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

export function createLicMethod(container) {
  const layer = createCanvasLayer(container, 'flow-layer');
  const project = createProjector(layer);
  let field = null;
  let gridW = 0;
  let gridH = 0;
  let noise = null;
  let curr = null;
  let next = null;
  let uBuf = null;
  let vBuf = null;
  const tmp = [0, 0, 0];

  function ensureGrid() {
    layer.resize();
    const w = Math.max(64, Math.floor(layer.width * 0.95));
    const h = Math.max(32, Math.floor(layer.height * 0.95));
    if (w === gridW && h === gridH && noise) return;
    gridW = w;
    gridH = h;
    const n = w * h;
    noise = new Float32Array(n);
    curr = new Float32Array(n);
    next = new Float32Array(n);
    uBuf = new Float32Array(n);
    vBuf = new Float32Array(n);
    for (let j = 0; j < h; j += 1) {
      for (let i = 0; i < w; i += 1) {
        const p = j * w + i;
        noise[p] = 0.45 * hashNoise(i, j, 1) + 0.55 * hashNoise(i * 3, j * 3, 2);
        curr[p] = noise[p];
      }
    }
  }

  function bakeField() {
    const maxS = Math.max(field.maxSpeed, 1e-6);
    for (let j = 0; j < gridH; j += 1) {
      for (let i = 0; i < gridW; i += 1) {
        const lon = (i / (gridW - 1)) * 358;
        const lat = (j / (gridH - 1)) * 180 - 90;
        sampleField(field, lon, lat, tmp);
        const p = j * gridW + i;
        uBuf[p] = tmp[0];
        vBuf[p] = tmp[1];
      }
    }
  }

  function advect(dt) {
    const kx = dt * 8 * (gridW / 358);
    const ky = dt * 8 * (gridH / 180);
    const n = gridW * gridH;
    for (let p = 0; p < n; p += 1) {
      const i = p % gridW;
      const j = (p - i) / gridW;
      next[p] = 0.94 * sampleBuf(curr, gridW, gridH, i - uBuf[p] * kx, j - vBuf[p] * ky) + 0.06 * noise[p];
    }
    const swap = curr;
    curr = next;
    next = swap;
  }

  function paint() {
    if (!field) return;
    const { ctx, width, height } = layer;
    const maxS = Math.max(field.maxSpeed, 1e-6);
    const img = ctx.createImageData(gridW, gridH);
    const data = img.data;
    for (let j = 0; j < gridH; j += 1) {
      for (let i = 0; i < gridW; i += 1) {
        const p = j * gridW + i;
        const lon = (i / (gridW - 1)) * 358;
        const lat = (j / (gridH - 1)) * 180 - 90;
        sampleField(field, lon, lat, tmp);
        const [r, g, b] = speedToRgb(tmp[2] / maxS);
        const lic = 0.16 + 0.84 * curr[p];
        // 格子の行 0 は南緯 90°。画像は上が北なので、書き込む行を上下反転する。
        const q = ((gridH - 1 - j) * gridW + i) * 4;
        data[q] = Math.round(r * lic * 255);
        data[q + 1] = Math.round(g * lic * 255);
        data[q + 2] = Math.round(b * lic * 255);
        data[q + 3] = 255;
      }
    }
    const off = document.createElement('canvas');
    off.width = gridW;
    off.height = gridH;
    off.getContext('2d').putImageData(img, 0, 0);

    ctx.clearRect(0, 0, width, height);
    const corners = [
      project(0, -90),
      project(358, -90),
      project(0, 90),
      project(358, 90),
    ];
    const minX = Math.min(...corners.map((c) => c[0]));
    const maxX = Math.max(...corners.map((c) => c[0]));
    const minY = Math.min(...corners.map((c) => c[1]));
    const maxY = Math.max(...corners.map((c) => c[1]));
    ctx.drawImage(off, minX, minY, maxX - minX, maxY - minY);
  }

  return {
    setField(nextField) {
      field = nextField;
      ensureGrid();
      bakeField();
      for (let i = 0; i < curr.length; i += 1) curr[i] = noise[i];
      for (let k = 0; k < 40; k += 1) advect(1 / 60);
      paint();
    },
    resize() {
      if (!field) return;
      ensureGrid();
      bakeField();
      for (let i = 0; i < curr.length; i += 1) curr[i] = noise[i];
      for (let k = 0; k < 24; k += 1) advect(1 / 60);
      paint();
    },
    update(dt) {
      if (!field) return;
      advect(Math.min(0.033, dt));
      paint();
    },
  };
}
