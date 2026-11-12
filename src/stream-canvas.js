import { createCanvasLayer, createProjector } from './canvas-layer';

const SPEED_LEVELS = 8;
const GLOW_LEVELS = 4;
// ハイライトや流線レットが線上を進む速さ。粒子移流（earth-animate の stepScale）と同じ値にして、
// 見かけの速さをそろえる。
const HEAD_RATE = 8;
// 中央値の速さの所で、ハイライトの間隔がこの長さ [px] になるよう周期を決める。
const HIGHLIGHT_SPACING = 60;

function fract(x) {
  return x - Math.floor(x);
}

function grayOf(level) {
  return Math.round(85 + ((level + 0.5) / SPEED_LEVELS) * 170);
}

function speedLevel(speed, maxSpeed) {
  return Math.max(0, Math.min(SPEED_LEVELS - 1, Math.floor((speed / maxSpeed) * SPEED_LEVELS)));
}

/** 各流線の点を画面座標（x, y の 2 つ組）にする。 */
function projectLines(stream, project) {
  return stream.lines.map((line) => {
    const n = line.length / 3;
    const pts = new Float32Array(n * 2);
    for (let k = 0; k < n; k += 1) {
      const [x, y] = project(line[k * 3], line[k * 3 + 1]);
      pts[k * 2] = x;
      pts[k * 2 + 1] = y;
    }
    return pts;
  });
}

/** 積分時間で測ったハイライトの周期。 */
function highlightPeriod(stream, pxPerDeg) {
  const speeds = [];
  for (const attr of stream.attrs) {
    for (let k = 0; k < attr.speed.length; k += 4) speeds.push(attr.speed[k]);
  }
  if (!speeds.length) return 1;
  speeds.sort((a, b) => a - b);
  const median = Math.max(speeds[speeds.length >> 1], 1e-6);
  return HIGHLIGHT_SPACING / (pxPerDeg * median);
}

function clipToMap(ctx, project) {
  const [x0, y0] = project(0, 90);
  const [x1, y1] = project(358, -90);
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
}

/** 速さの段ごとに 1 つの Path2D。同じ段が続く区間はひと続きの折れ線にする。 */
function buildLinePaths(pts, attrs, maxSpeed) {
  const paths = Array.from({ length: SPEED_LEVELS }, () => new Path2D());
  for (let li = 0; li < pts.length; li += 1) {
    const p = pts[li];
    const speed = attrs[li].speed;
    let prev = -1;
    for (let k = 0; k < speed.length - 1; k += 1) {
      const level = speedLevel((speed[k] + speed[k + 1]) * 0.5, maxSpeed);
      if (level !== prev) paths[level].moveTo(p[k * 2], p[k * 2 + 1]);
      paths[level].lineTo(p[k * 2 + 2], p[k * 2 + 3]);
      prev = level;
    }
  }
  return paths;
}

/**
 * 線上を風速に比例した速さで進むハイライト。
 * classOf(li, k) が返す番号ごとに線幅を変え、明るさの段とあわせて束ねて描く。
 */
function drawHighlights(ctx, pts, attrs, time, period, classCount, classOf, styleOf) {
  const paths = Array.from({ length: GLOW_LEVELS * classCount }, () => null);
  for (let li = 0; li < pts.length; li += 1) {
    const p = pts[li];
    const tau = attrs[li].tau;
    const offset = 0.618 * li;
    let prev = -1;
    for (let k = 0; k < tau.length - 1; k += 1) {
      const phase = fract((HEAD_RATE * time - (tau[k] + tau[k + 1]) * 0.5) / period + offset);
      const glow = (1 - phase) * (1 - phase);
      if (glow < 0.1) {
        prev = -1;
        continue;
      }
      const key = (Math.ceil(glow * GLOW_LEVELS) - 1) * classCount + classOf(li, k);
      if (key !== prev) {
        if (!paths[key]) paths[key] = new Path2D();
        paths[key].moveTo(p[k * 2], p[k * 2 + 1]);
      }
      paths[key].lineTo(p[k * 2 + 2], p[k * 2 + 3]);
      prev = key;
    }
  }
  for (let key = 0; key < paths.length; key += 1) {
    if (!paths[key]) continue;
    const glow = (Math.floor(key / classCount) + 1) / GLOW_LEVELS;
    const { width, alpha } = styleOf(key % classCount);
    ctx.lineWidth = width;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * glow})`;
    ctx.stroke(paths[key]);
  }
}

export function createStreamlineMethod(container) {
  const bg = createCanvasLayer(container, 'flow-bg');
  const fg = createCanvasLayer(container, 'flow-layer');
  const project = createProjector(fg);
  let pts = [];
  let attrs = [];
  let maxSpeed = 1;
  let period = 1;
  let time = 0;

  // 速さが半分以上の区間は太く明るくする。
  const classOf = (li, k) => (attrs[li].speed[k] / maxSpeed >= 0.5 ? 1 : 0);
  const styleOf = (cls) => (cls === 1 ? { width: 2.6, alpha: 0.76 } : { width: 1.6, alpha: 0.49 });

  function drawBackground() {
    bg.clear();
    const { ctx } = bg;
    const paths = buildLinePaths(pts, attrs, maxSpeed);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.45;
    for (let level = 0; level < SPEED_LEVELS; level += 1) {
      const g = grayOf(level);
      ctx.strokeStyle = `rgba(${g}, ${g}, ${g}, 0.9)`;
      ctx.stroke(paths[level]);
    }
  }

  function drawForeground() {
    fg.clear();
    const { ctx } = fg;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawHighlights(ctx, pts, attrs, time, period, 2, classOf, styleOf);
  }

  return {
    setField(field, _density, stream) {
      bg.resize();
      fg.resize();
      pts = projectLines(stream, project);
      attrs = stream.attrs;
      maxSpeed = Math.max(field.maxSpeed, 1e-6);
      period = highlightPeriod(stream, project.scale());
      time = 0;
      drawBackground();
      drawForeground();
    },
    update(dt) {
      if (!pts.length) return;
      time += dt;
      drawForeground();
    },
  };
}

// 流管の幅の段（全幅 [px] の上限）。ハイライトの線幅を束ねるのに使う。
const TUBE_WIDTH_STEPS = [1.5, 3, 5, 7.5];

export function createTubeMethod(container) {
  const bg = createCanvasLayer(container, 'flow-bg');
  const fg = createCanvasLayer(container, 'flow-layer');
  const project = createProjector(fg);
  let pts = [];
  let attrs = [];
  let widths = [];
  let maxSpeed = 1;
  let period = 1;
  let time = 0;

  const classOf = (li, k) => {
    const w = widths[li][k];
    let cls = 0;
    while (cls < TUBE_WIDTH_STEPS.length - 1 && w > TUBE_WIDTH_STEPS[cls]) cls += 1;
    return cls;
  };
  const styleOf = (cls) => ({ width: TUBE_WIDTH_STEPS[cls], alpha: 0.38 });

  /** 速さで決まる全幅。隣の線までのすき間（clear）を超えない。 */
  function computeWidths(stream) {
    const widest = 0.9 * stream.params.dsepPx;
    return stream.attrs.map((attr) => {
      const n = attr.speed.length;
      const w = new Float32Array(n);
      for (let k = 0; k < n; k += 1) {
        const t = Math.min(1, attr.speed[k] / maxSpeed);
        w[k] = Math.max(0.6, Math.min(0.8 + (widest - 0.8) * t, 0.95 * attr.clear[k]));
      }
      return w;
    });
  }

  /** 速さの段が同じ区間ごとに、左右の縁をつないだ 1 つの多角形にする。 */
  function buildRibbonPaths() {
    const paths = Array.from({ length: SPEED_LEVELS }, () => new Path2D());
    for (let li = 0; li < pts.length; li += 1) {
      const p = pts[li];
      const speed = attrs[li].speed;
      const w = widths[li];
      const n = speed.length;
      const left = new Float32Array(n * 2);
      const right = new Float32Array(n * 2);
      for (let k = 0; k < n; k += 1) {
        const a = Math.max(0, k - 1);
        const b = Math.min(n - 1, k + 1);
        const tx = p[b * 2] - p[a * 2];
        const ty = p[b * 2 + 1] - p[a * 2 + 1];
        const len = Math.hypot(tx, ty) || 1;
        const nx = (-ty / len) * w[k] * 0.5;
        const ny = (tx / len) * w[k] * 0.5;
        left[k * 2] = p[k * 2] + nx;
        left[k * 2 + 1] = p[k * 2 + 1] + ny;
        right[k * 2] = p[k * 2] - nx;
        right[k * 2 + 1] = p[k * 2 + 1] - ny;
      }
      let start = 0;
      while (start < n - 1) {
        const level = speedLevel((speed[start] + speed[start + 1]) * 0.5, maxSpeed);
        let end = start + 1;
        while (end < n - 1 && speedLevel((speed[end] + speed[end + 1]) * 0.5, maxSpeed) === level) end += 1;
        const path = paths[level];
        path.moveTo(left[start * 2], left[start * 2 + 1]);
        for (let k = start + 1; k <= end; k += 1) path.lineTo(left[k * 2], left[k * 2 + 1]);
        for (let k = end; k >= start; k -= 1) path.lineTo(right[k * 2], right[k * 2 + 1]);
        path.closePath();
        start = end;
      }
    }
    return paths;
  }

  function drawBackground() {
    bg.clear();
    const { ctx } = bg;
    const paths = buildRibbonPaths();
    ctx.save();
    clipToMap(ctx, project);
    for (let level = 0; level < SPEED_LEVELS; level += 1) {
      const g = grayOf(level);
      const t = (level + 0.5) / SPEED_LEVELS;
      ctx.fillStyle = `rgba(${g}, ${g}, ${g}, ${0.3 + 0.4 * t})`;
      ctx.fill(paths[level]);
    }
    ctx.restore();
  }

  function drawForeground() {
    fg.clear();
    const { ctx } = fg;
    ctx.save();
    clipToMap(ctx, project);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    drawHighlights(ctx, pts, attrs, time, period, TUBE_WIDTH_STEPS.length, classOf, styleOf);
    ctx.restore();
  }

  return {
    setField(field, _density, stream) {
      bg.resize();
      fg.resize();
      pts = projectLines(stream, project);
      attrs = stream.attrs;
      maxSpeed = Math.max(field.maxSpeed, 1e-6);
      widths = computeWidths(stream);
      // 流線のハイライトより間隔を広くして、ゆったりした波にする。
      period = highlightPeriod(stream, project.scale()) * 1.6;
      time = 0;
      drawBackground();
      drawForeground();
    },
    update(dt) {
      if (!pts.length) return;
      time += dt;
      drawForeground();
    },
  };
}

// 流線レット 1 本の長さ（点の数。点は線上に 2 px 間隔で並ぶ）と寿命 [フレーム]
const STREAMLET_POINTS = 3;
const STREAMLET_MAX_AGE = 90;
// 線の長さ何 px につき 1 本置くか
const STREAMLET_SPACING = 25;

export function createStreamletMethod(container) {
  const layer = createCanvasLayer(container, 'flow-layer');
  const project = createProjector(layer);
  let pts = [];
  let attrs = [];
  let maxSpeed = 1;
  let cumulative = [];
  let cursors = [];

  function respawn(c, age = 0) {
    // 線の長さ（点の数）に比例した確率で線を選ぶ。
    const total = cumulative[cumulative.length - 1];
    const pick = Math.random() * total;
    let li = 0;
    while (li < cumulative.length - 1 && cumulative[li] < pick) li += 1;
    const tau = attrs[li].tau;
    const n = tau.length;
    const k = Math.min(n - 2, Math.floor(Math.random() * (n - 1)));
    c.li = li;
    c.k = k;
    c.tau = tau[k] + Math.random() * (tau[k + 1] - tau[k]);
    c.age = age;
  }

  function seed() {
    cumulative = [];
    let total = 0;
    let lengthPx = 0;
    for (let li = 0; li < pts.length; li += 1) {
      const p = pts[li];
      const n = p.length / 2;
      total += n - 1;
      cumulative.push(total);
      for (let k = 0; k < n - 1; k += 1) {
        lengthPx += Math.hypot(p[k * 2 + 2] - p[k * 2], p[k * 2 + 3] - p[k * 2 + 1]);
      }
    }
    cursors = [];
    if (!total) return;
    const count = Math.max(40, Math.round(lengthPx / STREAMLET_SPACING));
    for (let i = 0; i < count; i += 1) {
      const c = {};
      respawn(c, Math.floor(Math.random() * STREAMLET_MAX_AGE));
      cursors.push(c);
    }
  }

  function step(dt) {
    const { ctx } = layer;
    const paths = Array.from({ length: SPEED_LEVELS }, () => null);
    for (const c of cursors) {
      c.tau += HEAD_RATE * dt;
      c.age += 1;
      let tau = attrs[c.li].tau;
      if (c.age > STREAMLET_MAX_AGE || c.tau >= tau[tau.length - 1]) {
        respawn(c);
        tau = attrs[c.li].tau;
      }
      while (c.k < tau.length - 2 && tau[c.k + 1] <= c.tau) c.k += 1;
      const p = pts[c.li];
      const k = c.k;
      const span = tau[k + 1] - tau[k];
      const u = span > 0 ? Math.min(1, Math.max(0, (c.tau - tau[k]) / span)) : 0;
      const level = speedLevel(attrs[c.li].speed[k], maxSpeed);
      if (!paths[level]) paths[level] = new Path2D();
      const path = paths[level];
      // 尾は線に沿って STREAMLET_POINTS 点ぶん後ろ。頭は現在位置。
      const t0 = k - STREAMLET_POINTS;
      if (t0 >= 0) {
        path.moveTo(
          p[t0 * 2] + (p[t0 * 2 + 2] - p[t0 * 2]) * u,
          p[t0 * 2 + 1] + (p[t0 * 2 + 3] - p[t0 * 2 + 1]) * u
        );
      } else {
        path.moveTo(p[0], p[1]);
      }
      for (let j = Math.max(1, t0 + 1); j <= k; j += 1) path.lineTo(p[j * 2], p[j * 2 + 1]);
      path.lineTo(
        p[k * 2] + (p[k * 2 + 2] - p[k * 2]) * u,
        p[k * 2 + 1] + (p[k * 2 + 3] - p[k * 2 + 1]) * u
      );
    }
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    layer.fade(0.06);
    for (let level = 0; level < SPEED_LEVELS; level += 1) {
      if (!paths[level]) continue;
      const g = grayOf(level);
      ctx.strokeStyle = `rgb(${g}, ${g}, ${g})`;
      ctx.stroke(paths[level]);
    }
  }

  return {
    setField(field, _density, stream) {
      layer.resize();
      layer.clear();
      pts = projectLines(stream, project);
      attrs = stream.attrs;
      maxSpeed = Math.max(field.maxSpeed, 1e-6);
      seed();
    },
    update(dt) {
      if (!cursors.length) return;
      step(dt);
    },
  };
}
