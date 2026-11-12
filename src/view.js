import { createCanvasLayer, createProjector } from './canvas-layer';
import { createParticleMethod } from './particles';
import { computeStreamlines } from './stream';
import {
  createStreamlineMethod,
  createTubeMethod,
  createStreamletMethod,
} from './stream-canvas';
import { createGlyphMethod } from './glyphs';
import { createLicMethod } from './lic';

const FRAME_COLOR = 'rgb(71, 82, 97)';

const PANELS = [
  ['particles', createParticleMethod],
  ['streamlines', createStreamlineMethod],
  ['tubes', createTubeMethod],
  ['glyphs', createGlyphMethod],
  ['lic', createLicMethod],
  ['streamlets', createStreamletMethod],
];

/** 風場の範囲を示す外枠。各パネルの最背面に置く。 */
function createFrame(container) {
  const layer = createCanvasLayer(container, 'flow-frame');
  const project = createProjector(layer);
  return {
    resize() {
      layer.resize();
      layer.clear();
      const [x0, y0] = project(0, 90);
      const [x1, y1] = project(358, -90);
      const { ctx } = layer;
      ctx.strokeStyle = FRAME_COLOR;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.round(x0) + 0.5,
        Math.round(y0) + 0.5,
        Math.round(x1 - x0),
        Math.round(y1 - y0)
      );
    },
  };
}

export function createAtlas() {
  const atlasEl = document.querySelector('.atlas');
  const frames = [];
  const methods = {};

  for (const [id, createMethod] of PANELS) {
    const el = document.getElementById(`view-${id}`);
    frames.push(createFrame(el));
    methods[id] = createMethod(el);
  }

  let hasField = false;
  let lastWidth = 0;
  let lastHeight = 0;

  function resize() {
    for (const frame of frames) frame.resize();
    for (const [id] of PANELS) methods[id].resize?.();
  }

  // 初回の通知や寸法が変わらない通知では、描き直さない。
  new ResizeObserver(() => {
    const width = atlasEl.clientWidth;
    const height = atlasEl.clientHeight;
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    if (hasField) resize();
  }).observe(atlasEl);

  return {
    methods,
    resize,
    setField(field, density) {
      lastWidth = atlasEl.clientWidth;
      lastHeight = atlasEl.clientHeight;
      hasField = true;
      for (const frame of frames) frame.resize();
      const streamLines = computeStreamlines(field);
      methods.particles.setField(field, density);
      methods.streamlines.setField(field, density, streamLines);
      methods.tubes.setField(field, density, streamLines);
      methods.glyphs.setField(field, density);
      methods.lic.setField(field, density);
      methods.streamlets.setField(field, density, streamLines);
    },
    update(dt) {
      if (!hasField) return;
      for (const [id] of PANELS) methods[id].update(dt);
    },
  };
}
