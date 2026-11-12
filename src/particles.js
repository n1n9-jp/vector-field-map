import { createCanvasLayer, createProjector } from './canvas-layer';
import { createEarthFieldAnimator } from './earth-animate';

export function createParticleMethod(container, getRenderer) {
  const layer = createCanvasLayer(container, 'flow-layer');
  let animator = null;
  let density = 1;
  let project = null;

  function bind() {
    project = createProjector(getRenderer(), container);
    project.sync();
    animator = createEarthFieldAnimator(layer, project, {
      multiplier: 7.5,
      lineWidth: 1.05,
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
