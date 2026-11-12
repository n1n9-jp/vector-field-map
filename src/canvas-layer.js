// 画面に収める範囲（度）。地図（経度 0〜358、緯度 −90〜90）の周囲に余白を残す。
const VIEW_WIDTH = 388.8;
const VIEW_HEIGHT = 216;
const CENTER_LON = 179;
const CENTER_LAT = 0;

export function createCanvasLayer(container, className = 'flow-layer') {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: true });
  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clear() {
    ctx.clearRect(0, 0, width, height);
  }

  function fade(amount = 0.06) {
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0, 0, 0, ${amount})`;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = prev;
  }

  return {
    canvas,
    ctx,
    resize,
    clear,
    fade,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get dpr() {
      return dpr;
    },
  };
}

/**
 * 経度・緯度 → レイヤー上の位置（CSS ピクセル）。北が上の正距円筒図法。
 * 係数はレイヤーの寸法が変わったときだけ求め直す。
 */
export function createProjector(layer) {
  let width = -1;
  let height = -1;
  let scale = 1;
  let originX = 0;
  let originY = 0;

  function refresh() {
    width = layer.width;
    height = layer.height;
    scale = Math.min(width / VIEW_WIDTH, height / VIEW_HEIGHT);
    originX = width / 2 - CENTER_LON * scale;
    originY = height / 2 + CENTER_LAT * scale;
  }

  return function project(lon, lat) {
    if (layer.width !== width || layer.height !== height) refresh();
    return [originX + lon * scale, originY - lat * scale];
  };
}

export function inView(x, y, w, h, pad = 16) {
  return Number.isFinite(x) && Number.isFinite(y)
    && x >= -pad && x <= w + pad && y >= -pad && y <= h + pad;
}
