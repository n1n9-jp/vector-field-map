import { randomInDomain, stepRK2 } from './field';
import { createWindColorStyles } from './color';
import { inView } from './canvas-layer';

const MAX_AGE = 100;
const LINE_WIDTH = 1.05;
const PARTICLE_MULTIPLIER = 7;

export function createEarthFieldAnimator(layer, project, options = {}) {
  const multiplier = options.multiplier ?? PARTICLE_MULTIPLIER;
  const lineWidth = options.lineWidth ?? LINE_WIDTH;
  const fadeAlpha = options.fadeAlpha ?? 0.06;
  const stepScale = options.stepScale ?? 8;
  const drawSegment = options.drawSegment ?? defaultSegment;

  let field = null;
  let particles = [];
  let colors = null;
  let buckets = [];
  let intensity = 1;
  const tmp = [0, 0, 0];

  function defaultSegment(ctx, x0, y0, x1, y1, style) {
    ctx.strokeStyle = style;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  function seed(randomAge = true, density = 1) {
    if (!field || !layer.width) return;
    const count = Math.max(48, Math.round(layer.width * multiplier * density));
    particles = [];
    for (let i = 0; i < count; i += 1) {
      const [lon, lat] = randomInDomain();
      particles.push({
        lon,
        lat,
        age: randomAge ? Math.floor(Math.random() * MAX_AGE) : 0,
      });
    }
  }

  function respawn(p) {
    const [lon, lat] = randomInDomain();
    p.lon = lon;
    p.lat = lat;
    p.age = 0;
  }

  function evolve(dt) {
    if (!field || !colors) return;
    buckets.forEach((bucket) => {
      bucket.length = 0;
    });
    const step = dt * stepScale;
    const { width, height } = layer;
    for (const p of particles) {
      if (p.age > MAX_AGE) respawn(p);
      const next = stepRK2(field, p.lon, p.lat, step, tmp);
      if (!next) {
        // 場の外へ出る粒子。下の加算で MAX_AGE を超え、次のフレームで再配置される。
        p.age = MAX_AGE;
      } else {
        const [x0, y0] = project(p.lon, p.lat);
        const [x1, y1] = project(next[0], next[1]);
        if (inView(x0, y0, width, height) || inView(x1, y1, width, height)) {
          buckets[colors.indexFor(tmp[2])].push({ x0, y0, x1, y1 });
        }
        p.lon = next[0];
        p.lat = next[1];
      }
      p.age += 1;
    }
  }

  function draw() {
    const { ctx } = layer;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    layer.fade(fadeAlpha);
    const batched = drawSegment === defaultSegment;
    buckets.forEach((bucket, i) => {
      if (!bucket.length) return;
      if (batched) {
        ctx.strokeStyle = colors.styles[i];
        ctx.beginPath();
        for (const seg of bucket) {
          ctx.moveTo(seg.x0, seg.y0);
          ctx.lineTo(seg.x1, seg.y1);
        }
        ctx.stroke();
      } else {
        for (const seg of bucket) {
          drawSegment(ctx, seg.x0, seg.y0, seg.x1, seg.y1, colors.styles[i]);
        }
      }
    });
  }

  return {
    setField(next, density = 1) {
      field = next;
      intensity = Math.max(next.maxSpeed * 0.82, 1);
      colors = createWindColorStyles(8, intensity);
      buckets = colors.styles.map(() => []);
      seed(true, density);
      layer.clear();
    },
    resize(density = 1) {
      seed(true, density);
      layer.clear();
    },
    update(dt) {
      if (!field) return;
      evolve(dt);
      draw();
    },
  };
}
