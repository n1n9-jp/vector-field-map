import { createCanvasLayer, createProjector } from './canvas-layer';
import { sampleField } from './field';
import { speedToRgb } from './color';

// IBFV（van Wijk 2002, https://www.win.tue.nl/~vanwijk/ibfv/）。
// 毎フレーム、前の画像を風で流したものに、時間変化するノイズを少しだけ混ぜる。
const BLEND = 0.08; // 新しいノイズを混ぜる割合
const NOISE_CELL = 2; // ノイズの粒の大きさ [px]
const NOISE_RATE = 1.4; // ノイズの明滅 [周期/秒]
const CONTRAST = 4.5; // 表示時のコントラスト強調
const WARMUP_FRAMES = 20;
const ADVECT_RATE = 8; // 粒子移流（earth-animate の stepScale）と同じ

function hashNoise(i, j, seed) {
  const n = Math.sin(i * 127.1 + j * 311.7 + seed * 74.13) * 43758.5453;
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

export function createIbfvMethod(container) {
  const layer = createCanvasLayer(container, 'flow-layer');
  const project = createProjector(layer);
  const offscreen = document.createElement('canvas');
  const offCtx = offscreen.getContext('2d');
  let field = null;
  let gridW = 0;
  let gridH = 0;
  let phase = null; // 画素ごとのノイズの位相
  let curr = null;
  let next = null;
  let uBuf = null;
  let vBuf = null;
  let tint = null; // 速さの色（r, g, b の 3 つ組）
  let image = null;
  let time = 0;
  const tmp = [0, 0, 0];

  // 格子は地図の矩形にぴったり重ね、1 セルを画面の 1 px にする。行 0 は南端。
  function ensureGrid() {
    layer.resize();
    const scale = project.scale();
    const w = Math.max(64, Math.round(358 * scale));
    const h = Math.max(32, Math.round(180 * scale));
    if (w === gridW && h === gridH) return;
    gridW = w;
    gridH = h;
    const n = w * h;
    phase = new Float32Array(n);
    curr = new Float32Array(n);
    next = new Float32Array(n);
    uBuf = new Float32Array(n);
    vBuf = new Float32Array(n);
    tint = new Float32Array(n * 3);
    offscreen.width = w;
    offscreen.height = h;
    image = offCtx.createImageData(w, h);
    for (let j = 0; j < h; j += 1) {
      for (let i = 0; i < w; i += 1) {
        phase[j * w + i] = hashNoise(Math.floor(i / NOISE_CELL), Math.floor(j / NOISE_CELL), 1);
      }
    }
  }

  function bakeField() {
    const maxSpeed = Math.max(field.maxSpeed, 1e-6);
    for (let j = 0; j < gridH; j += 1) {
      for (let i = 0; i < gridW; i += 1) {
        const lon = (i / (gridW - 1)) * 358;
        const lat = (j / (gridH - 1)) * 180 - 90;
        sampleField(field, lon, lat, tmp);
        const p = j * gridW + i;
        uBuf[p] = tmp[0];
        vBuf[p] = tmp[1];
        const [r, g, b] = speedToRgb(tmp[2] / maxSpeed);
        tint[p * 3] = r * 255;
        tint[p * 3 + 1] = g * 255;
        tint[p * 3 + 2] = b * 255;
      }
    }
  }

  function reset() {
    for (let p = 0; p < curr.length; p += 1) curr[p] = phase[p] < 0.5 ? 1 : 0;
    for (let k = 0; k < WARMUP_FRAMES; k += 1) advect(1 / 60);
  }

  function advect(dt) {
    time += dt;
    const kx = dt * ADVECT_RATE * (gridW / 358);
    const ky = dt * ADVECT_RATE * (gridH / 180);
    const shift = time * NOISE_RATE;
    const n = gridW * gridH;
    for (let p = 0; p < n; p += 1) {
      const i = p % gridW;
      const j = (p - i) / gridW;
      // 時間とともに明滅するノイズ。位相が画素ごとに違うので、模様が固定されない。
      const t = phase[p] + shift;
      const noise = t - Math.floor(t) < 0.5 ? 1 : 0;
      next[p] = (1 - BLEND) * sampleBuf(curr, gridW, gridH, i - uBuf[p] * kx, j - vBuf[p] * ky) + BLEND * noise;
    }
    const swap = curr;
    curr = next;
    next = swap;
  }

  function paint() {
    const { ctx, width, height } = layer;
    const data = image.data;
    for (let j = 0; j < gridH; j += 1) {
      // 格子の行 0 は南端。画像は上が北なので、書き込む行を上下反転する。
      const row = (gridH - 1 - j) * gridW;
      for (let i = 0; i < gridW; i += 1) {
        const p = j * gridW + i;
        const streak = Math.min(1, Math.max(0, 0.5 + (curr[p] - 0.5) * CONTRAST));
        const shade = 0.16 + 0.84 * streak;
        const q = (row + i) * 4;
        data[q] = tint[p * 3] * shade;
        data[q + 1] = tint[p * 3 + 1] * shade;
        data[q + 2] = tint[p * 3 + 2] * shade;
        data[q + 3] = 255;
      }
    }
    offCtx.putImageData(image, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const [x0, y0] = project(0, 90);
    const [x1, y1] = project(358, -90);
    ctx.drawImage(offscreen, x0, y0, x1 - x0, y1 - y0);
  }

  function rebuild() {
    ensureGrid();
    bakeField();
    reset();
    paint();
  }

  return {
    setField(nextField) {
      field = nextField;
      rebuild();
    },
    resize() {
      if (!field) return;
      rebuild();
    },
    update(dt) {
      if (!field) return;
      advect(Math.min(0.033, dt));
      paint();
    },
  };
}
