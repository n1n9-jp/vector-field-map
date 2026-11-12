import { createCanvasLayer, createProjector } from './canvas-layer';
import { createParticleMethod } from './particles';
import { buildStreamlines } from './streamlines';
import {
  createStreamlineMethod,
  createTubeMethod,
  createStreamletMethod,
} from './stream-canvas';
import { createGlyphMethod } from './glyphs';
import { createIbfvMethod } from './ibfv';

const FRAME_COLOR = 'rgb(71, 82, 97)';

// 流線を共有するパネル
const STREAM_PANELS = ['streamlines', 'tubes', 'streamlets'];

const PANELS = [
  ['particles', createParticleMethod],
  ['streamlines', createStreamlineMethod],
  ['tubes', createTubeMethod],
  ['glyphs', createGlyphMethod],
  ['ibfv', createIbfvMethod],
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
    /** 画面の倍率 [px/度] */
    scale: () => project.scale(),
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
  // 風場が届く前から外枠を見せておく。
  for (const frame of frames) frame.resize();

  let field = null;
  let density = 1;
  let lastWidth = 0;
  let lastHeight = 0;

  // 流線の間隔は画面上の px で決めるので、寸法が変わったら作り直す。
  function drawStreamPanels() {
    const stream = buildStreamlines(field, {
      density,
      pxPerDeg: frames[0].scale(),
      latCorrect: field.latCorrect,
    });
    for (const id of STREAM_PANELS) methods[id].setField(field, density, stream);
  }

  function resize() {
    for (const frame of frames) frame.resize();
    drawStreamPanels();
    for (const [id] of PANELS) methods[id].resize?.();
  }

  // 寸法と解像度の変化が同時に来ても、描き直しは 1 フレームに 1 回にまとめる。
  let resizePending = false;
  function scheduleResize() {
    if (!field || resizePending) return;
    resizePending = true;
    requestAnimationFrame(() => {
      resizePending = false;
      resize();
    });
  }

  // 初回の通知や寸法が変わらない通知では、描き直さない。
  new ResizeObserver(() => {
    const width = atlasEl.clientWidth;
    const height = atlasEl.clientHeight;
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    scheduleResize();
  }).observe(atlasEl);

  // ブラウザのズームなどで、寸法は同じまま解像度だけが変わったときも作り直す。
  function watchPixelRatio() {
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener(
      'change',
      () => {
        watchPixelRatio();
        scheduleResize();
      },
      { once: true }
    );
  }
  watchPixelRatio();

  return {
    methods,
    resize,
    setField(nextField, nextDensity) {
      field = nextField;
      density = nextDensity;
      lastWidth = atlasEl.clientWidth;
      lastHeight = atlasEl.clientHeight;
      for (const frame of frames) frame.resize();
      drawStreamPanels();
      methods.particles.setField(field, density);
      methods.glyphs.setField(field, density);
      methods.ibfv.setField(field, density);
    },
    update(dt) {
      if (!field) return;
      for (const [id] of PANELS) methods[id].update(dt);
    },
  };
}
