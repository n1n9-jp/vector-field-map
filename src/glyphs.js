import { createCanvasLayer, createProjector } from './canvas-layer';
import { sampleField } from './field';
import { HIGHLIGHT_RGB, speedGraySoft } from './color';

const SPEED_LEVELS = 8;
const SPACING = 16; // 密度 1 のときの矢印の間隔 [px]
const CALM = 0.02; // 最大風速に対するこの割合より弱い所は点で示す

/**
 * 矢印グリフ。画面上で等間隔の固定点に矢印を置き、向きで風向、長さと濃さで風速を示す。
 * 矢印は動かない。風速に応じた速さの濃い印が、各矢印の根元から先へ走る。
 */
export function createGlyphMethod(container) {
  const bg = createCanvasLayer(container, 'flow-bg');
  const fg = createCanvasLayer(container, 'flow-layer');
  const project = createProjector(fg);
  let field = null;
  let density = 1;
  let arrows = [];
  let time = 0;
  const tmp = [0, 0, 0];

  function build() {
    const spacing = SPACING / density;
    const stepDeg = spacing / project.scale();
    const cols = Math.max(1, Math.floor(358 / stepDeg));
    const rows = Math.max(1, Math.floor(180 / stepDeg));
    const maxSpeed = Math.max(field.maxSpeed, 1e-6);
    arrows = [];
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const lon = ((i + 0.5) / cols) * 358;
        const lat = ((j + 0.5) / rows) * 180 - 90;
        sampleField(field, lon, lat, tmp);
        const t = Math.min(1, tmp[2] / maxSpeed);
        const [cx, cy] = project(lon, lat);
        const calm = t < CALM;
        const len = calm ? 0 : spacing * (0.3 + 0.65 * t);
        // 画面は下向きが +y なので、北向き成分の符号を反転する。
        // 向きは地図上の動き（緯度補正ずみ）、長さと濃さは風速で決める。
        const norm = Math.hypot(tmp[0], tmp[1]) || 1;
        const ux = calm ? 0 : tmp[0] / norm;
        const uy = calm ? 0 : -tmp[1] / norm;
        arrows.push({
          x0: cx - ux * len * 0.5,
          y0: cy - uy * len * 0.5,
          ux,
          uy,
          len,
          level: Math.min(SPEED_LEVELS - 1, Math.floor(t * SPEED_LEVELS)),
          rate: 0.5 + 2 * t, // 濃い印が矢印を走り抜ける回数 [回/秒]
          offset: (i * 0.37 + j * 0.61) % 1,
        });
      }
    }
  }

  function drawBackground() {
    bg.resize();
    bg.clear();
    const { ctx } = bg;
    const paths = Array.from({ length: SPEED_LEVELS }, () => new Path2D());
    for (const a of arrows) {
      const path = paths[a.level];
      if (a.len === 0) {
        path.rect(a.x0 - 0.5, a.y0 - 0.5, 1, 1);
        continue;
      }
      const x1 = a.x0 + a.ux * a.len;
      const y1 = a.y0 + a.uy * a.len;
      const tip = Math.min(4.5, a.len * 0.35);
      const px = -a.uy * tip * 0.55;
      const py = a.ux * tip * 0.55;
      path.moveTo(a.x0, a.y0);
      path.lineTo(x1, y1);
      path.moveTo(x1 - a.ux * tip + px, y1 - a.uy * tip + py);
      path.lineTo(x1, y1);
      path.lineTo(x1 - a.ux * tip - px, y1 - a.uy * tip - py);
    }
    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let level = 0; level < SPEED_LEVELS; level += 1) {
      const g = speedGraySoft((level + 0.5) / SPEED_LEVELS);
      ctx.strokeStyle = `rgb(${g}, ${g}, ${g})`;
      ctx.stroke(paths[level]);
    }
  }

  function drawForeground() {
    fg.clear();
    const { ctx } = fg;
    const path = new Path2D();
    for (const a of arrows) {
      if (a.len === 0) continue;
      const head = (time * a.rate + a.offset) % 1;
      const from = Math.max(0, head - 0.35) * a.len;
      const to = head * a.len;
      path.moveTo(a.x0 + a.ux * from, a.y0 + a.uy * from);
      path.lineTo(a.x0 + a.ux * to, a.y0 + a.uy * to);
    }
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(${HIGHLIGHT_RGB}, 0.9)`;
    ctx.stroke(path);
  }

  function rebuild() {
    fg.resize();
    build();
    drawBackground();
    drawForeground();
  }

  return {
    setField(next, d = 1) {
      field = next;
      density = d;
      time = 0;
      rebuild();
    },
    resize() {
      if (!field) return;
      rebuild();
    },
    update(dt) {
      if (!field) return;
      time += dt;
      drawForeground();
    },
  };
}
