import { createCanvasLayer, createProjector } from './canvas-layer';
import { createEarthFieldAnimator, drawArrowSegment } from './earth-animate';

export function createGlyphMethod(container, getRenderer) {
  const layer = createCanvasLayer(container, 'flow-layer');
  let animator = null;
  let density = 1;

  function bind() {
    const project = createProjector(getRenderer(), container);
    project.sync();
    animator = createEarthFieldAnimator(layer, project, {
      multiplier: 4.2,
      lineWidth: 1.1,
      drawSegment: drawArrowSegment,
    });
  }

  return {
    setField(next, d = 1) {
      density = d;
      layer.resize();
      bind();
      animator.setField(next, d);
    },
    resize() {
      if (!animator) return;
      layer.resize();
      bind();
      animator.resize(density);
    },
    update(dt) {
      animator?.update(dt);
    },
  };
}
