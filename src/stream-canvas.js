import { createCanvasLayer, createProjector, inView } from './canvas-layer';
import { parsePolylines } from './polyline';
import { createWindColorStyles, flowComet, windGrayAlpha } from './color';
import { sampleField } from './field';

const STREAM_STEP = 0.4;

function lineSpeeds(lines, field) {
  const tmp = [0, 0, 0];
  return lines.map((line) => {
    const npts = line.length / 3;
    const s = new Float32Array(npts);
    for (let k = 0; k < npts; k += 1) {
      sampleField(field, line[k * 3], line[k * 3 + 1], tmp);
      s[k] = tmp[2];
    }
    return s;
  });
}

function drawSegmentColoredLines(ctx, lines, speeds, project, maxS, options) {
  const { alpha = 0.88, width = 1.35 } = options;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li];
    const spd = speeds[li];
    const n = line.length / 3;
    for (let k = 0; k < n - 1; k += 1) {
      const [x0, y0] = project(line[k * 3], line[k * 3 + 1]);
      const [x1, y1] = project(line[(k + 1) * 3], line[(k + 1) * 3 + 1]);
      const s = ((spd[k] ?? 0) + (spd[k + 1] ?? 0)) * 0.5;
      ctx.strokeStyle = windGrayAlpha(s, maxS, alpha);
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawCometHighlights(ctx, lines, speeds, project, maxS, time) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li];
    const spd = speeds[li];
    const n = line.length / 3;
    if (n < 2) continue;
    for (let k = 0; k < n - 1; k += 1) {
      const sNorm = k / (n - 2);
      const glow = flowComet(sNorm, time, 2.4);
      if (glow < 0.06) continue;
      const [x0, y0] = project(line[k * 3], line[k * 3 + 1]);
      const [x1, y1] = project(line[(k + 1) * 3], line[(k + 1) * 3 + 1]);
      const speed = ((spd[k] ?? 0) + (spd[k + 1] ?? 0)) * 0.5;
      const t = speed / maxS;
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.35 + t * 0.55) * glow})`;
      ctx.lineWidth = 1.2 + t * 1.8;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawFilledTubes(ctx, lines, speeds, project, maxS, time) {
  ctx.save();
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li];
    const spd = speeds[li];
    const n = line.length / 3;
    if (n < 2) continue;
    for (let k = 0; k < n - 1; k += 1) {
      const [x0, y0] = project(line[k * 3], line[k * 3 + 1]);
      const [x1, y1] = project(line[(k + 1) * 3], line[(k + 1) * 3 + 1]);
      const speed = ((spd[k] ?? 0) + (spd[k + 1] ?? 0)) * 0.5;
      const t = speed / maxS;
      const w0 = 0.5 + (spd[k] / maxS) * 6.5;
      const w1 = 0.5 + (spd[k + 1] / maxS) * 6.5;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const pulse = 0.55 + 0.45 * flowComet(k / (n - 2), time, 1.35);
      const alpha = (0.42 + t * 0.48) * pulse;
      ctx.fillStyle = windGrayAlpha(speed, maxS, alpha);
      ctx.beginPath();
      ctx.moveTo(x0 + nx * w0, y0 + ny * w0);
      ctx.lineTo(x0 - nx * w0, y0 - ny * w0);
      ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
      ctx.lineTo(x1 + nx * w1, y1 + ny * w1);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

export function createStreamlineMethod(container, getRenderer) {
  const bg = createCanvasLayer(container, 'flow-bg');
  const fg = createCanvasLayer(container, 'flow-layer');
  let project = null;
  let lines = [];
  let speeds = [];
  let field = null;
  let time = 0;

  function redrawBg() {
    if (!field || !lines.length || !project) return;
    bg.resize();
    bg.clear();
    drawSegmentColoredLines(bg.ctx, lines, speeds, project, field.maxSpeed, {
      alpha: 0.9,
      width: 1.45,
    });
  }

  function redrawFg() {
    if (!field || !lines.length || !project) return;
    fg.clear();
    drawCometHighlights(fg.ctx, lines, speeds, project, field.maxSpeed, time);
  }

  return {
    setField(next, _d, streamPd) {
      field = next;
      lines = parsePolylines(streamPd);
      speeds = lineSpeeds(lines, next);
      time = 0;
      fg.resize();
      project = createProjector(getRenderer(), container);
      project.sync();
      redrawBg();
      redrawFg();
    },
    resize() {
      if (!field) return;
      fg.resize();
      project = createProjector(getRenderer(), container);
      project.sync();
      redrawBg();
      redrawFg();
    },
    update(dt) {
      if (!field || !lines.length) return;
      time += dt * 0.42;
      redrawFg();
    },
  };
}

export function createTubeMethod(container, getRenderer) {
  const layer = createCanvasLayer(container, 'flow-layer');
  let project = null;
  let lines = [];
  let speeds = [];
  let field = null;
  let time = 0;

  function redraw() {
    if (!field || !lines.length || !project) return;
    layer.clear();
    drawFilledTubes(layer.ctx, lines, speeds, project, field.maxSpeed, time);
  }

  return {
    setField(next, _d, streamPd) {
      field = next;
      lines = parsePolylines(streamPd);
      speeds = lineSpeeds(lines, next);
      time = 0;
      layer.resize();
      project = createProjector(getRenderer(), container);
      project.sync();
      redraw();
    },
    resize() {
      if (!field) return;
      layer.resize();
      project = createProjector(getRenderer(), container);
      project.sync();
      redraw();
    },
    update(dt) {
      if (!field || !lines.length) return;
      time += dt * 0.28;
      redraw();
    },
  };
}

export function createStreamletMethod(container, getRenderer) {
  const layer = createCanvasLayer(container, 'flow-layer');
  let project = null;
  let lines = [];
  let cursors = [];
  let field = null;
  let colors = null;
  let buckets = [];
  const tmp = [0, 0, 0];

  function respawn(c) {
    c.lineIndex = Math.floor(Math.random() * lines.length);
    const line = lines[c.lineIndex];
    c.t = Math.random() * (line.length / 3 - 2);
    c.age = 0;
  }

  function pointOnLine(line, t) {
    const n = line.length / 3;
    const f = Math.min(n - 1, Math.max(0, t));
    const i0 = Math.floor(f);
    const i1 = Math.min(n - 1, i0 + 1);
    const u = f - i0;
    return [
      line[i0 * 3] * (1 - u) + line[i1 * 3] * u,
      line[i0 * 3 + 1] * (1 - u) + line[i1 * 3 + 1] * u,
    ];
  }

  function seed(density) {
    const count = Math.max(100, Math.round(lines.length * 3.4 * density));
    cursors = [];
    for (let i = 0; i < count; i += 1) {
      const lineIndex = i % lines.length;
      const line = lines[lineIndex];
      cursors.push({
        lineIndex,
        t: Math.random() * (line.length / 3 - 2),
        age: Math.floor(Math.random() * 80),
      });
    }
  }

  function evolve(dt) {
    buckets.forEach((b) => { b.length = 0; });
    const speed = dt * (7 / STREAM_STEP);
    for (const c of cursors) {
      const line = lines[c.lineIndex];
      const npts = line.length / 3;
      c.t += speed;
      c.age += 1;
      if (c.t > npts - 2 || c.age > 90) respawn(c);
      const [lon, lat] = pointOnLine(line, c.t);
      sampleField(field, lon, lat, tmp);
      const [lon2, lat2] = pointOnLine(line, c.t + 0.65);
      const [x0, y0] = project(lon, lat);
      const [x1, y1] = project(lon2, lat2);
      if (inView(x0, y0, layer.width, layer.height)) {
        buckets[colors.indexFor(tmp[2])].push({ x0, y0, x1, y1 });
      }
    }
  }

  function draw() {
    const { ctx } = layer;
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    layer.fade(0.06);
    buckets.forEach((bucket, i) => {
      if (!bucket.length) return;
      for (const seg of bucket) {
        ctx.strokeStyle = colors.styles[i];
        ctx.beginPath();
        ctx.moveTo(seg.x0, seg.y0);
        ctx.lineTo(seg.x1, seg.y1);
        ctx.stroke();
      }
    });
  }

  return {
    setField(next, density, streamPd) {
      field = next;
      lines = parsePolylines(streamPd);
      if (!lines.length) return;
      layer.resize();
      layer.clear();
      project = createProjector(getRenderer(), container);
      project.sync();
      const intensity = Math.max(next.maxSpeed * 0.82, 1);
      colors = createWindColorStyles(8, intensity);
      buckets = colors.styles.map(() => []);
      seed(density);
    },
    resize() {
      if (!field || !lines.length) return;
      layer.resize();
      layer.clear();
      project = createProjector(getRenderer(), container);
      project.sync();
      seed(1);
    },
    update(dt) {
      if (!field || !cursors.length) return;
      evolve(dt);
      draw();
    },
  };
}
