import { createCanvasLayer, createProjector } from './canvas-layer';
import { createEarthFieldAnimator } from './earth-animate';

export function createParticleMethod(container) {
  const layer = createCanvasLayer(container, 'flow-layer');
  const project = createProjector(layer);
  const animator = createEarthFieldAnimator(layer, project, {
    multiplier: 7.5,
    lineWidth: 1.05,
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
