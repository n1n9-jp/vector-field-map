import { createCanvasLayer, createProjector } from './canvas-layer';
import { createEarthFieldAnimator, drawArrowSegment } from './earth-animate';

export function createGlyphMethod(container) {
  const layer = createCanvasLayer(container, 'flow-layer');
  const project = createProjector(layer);
  const animator = createEarthFieldAnimator(layer, project, {
    multiplier: 4.2,
    lineWidth: 1.1,
    drawSegment: drawArrowSegment,
  });
  let hasField = false;
  let density = 1;

  return {
    setField(next, d = 1) {
      density = d;
      hasField = true;
      layer.resize();
      animator.setField(next, d);
    },
    resize() {
      if (!hasField) return;
      layer.resize();
      animator.resize(density);
    },
    update(dt) {
      animator.update(dt);
    },
  };
}
