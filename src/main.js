import { createAtlas } from './view';
import { createGfsField, createSyntheticField } from './field';

// 既定の風場。取得はページの初期化と並行して進める。
const gfsRequest = fetch(`${import.meta.env.BASE_URL}data/gfs-20140131-2deg.json`).then((r) => r.json());

const presetEl = document.getElementById('preset');
const toggleEl = document.getElementById('toggle');
const speedEl = document.getElementById('speed');
const densityEl = document.getElementById('density');
const statusEl = document.getElementById('status');
const legendUnit = document.getElementById('legend-unit');

let atlas;
try {
  atlas = createAtlas();
} catch (err) {
  statusEl.textContent = `初期化に失敗: ${err.message}`;
  throw err;
}
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let playing = !reduceMotion;
let speed = 1;
let density = 1;
let field = null;
let gfsField = null;
let last = performance.now();

toggleEl.setAttribute('aria-pressed', playing ? 'true' : 'false');
toggleEl.textContent = playing ? '停止' : '再生';

function applyField(next) {
  field = next;
  legendUnit.textContent = next.unit;
  try {
    atlas.setField(field, density);
    statusEl.textContent = next.label;
  } catch (err) {
    statusEl.textContent = `描画に失敗: ${err.message}`;
    console.error(err);
  }
}

function currentPreset() {
  const kind = presetEl.value;
  if (kind === 'gfs') return gfsField ?? createSyntheticField('cyclone');
  return createSyntheticField(kind);
}

toggleEl.addEventListener('click', () => {
  playing = !playing;
  toggleEl.setAttribute('aria-pressed', playing ? 'true' : 'false');
  toggleEl.textContent = playing ? '停止' : '再生';
});

speedEl.addEventListener('input', () => {
  speed = Number(speedEl.value);
});

// スライダーを動かしているあいだの再計算は、1 フレームに 1 回までにする。
let densityPending = false;
densityEl.addEventListener('input', () => {
  density = Number(densityEl.value);
  if (densityPending) return;
  densityPending = true;
  requestAnimationFrame(() => {
    densityPending = false;
    if (field) atlas.setField(field, density);
  });
});

presetEl.addEventListener('change', () => {
  applyField(currentPreset());
});

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * speed;
  last = now;
  if (!document.hidden) {
    if (playing) atlas.update(dt);
  }
  requestAnimationFrame(frame);
}

// 既定の GFS が選ばれているあいだは、届いてから 1 回だけ描く。
if (presetEl.value !== 'gfs') applyField(currentPreset());
requestAnimationFrame(frame);

gfsRequest
  .then((json) => {
    gfsField = createGfsField(json);
    if (presetEl.value === 'gfs') applyField(gfsField);
    else if (field) statusEl.textContent = `${field.label}  / GFS 読み込み済`;
  })
  .catch(() => {
    if (presetEl.value === 'gfs') {
      presetEl.value = 'cyclone';
      applyField(createSyntheticField('cyclone'));
    }
    statusEl.textContent = 'GFS を読めなかったので合成場を表示';
  });
