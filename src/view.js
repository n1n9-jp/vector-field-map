import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import '@kitware/vtk.js/Rendering/Misc/RenderingAPIs';

import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkOutlineFilter from '@kitware/vtk.js/Filters/General/OutlineFilter';

import { applyWindLut } from './color';
import { createParticleMethod } from './particles';
import { computeStreamlines } from './stream';
import {
  createStreamlineMethod,
  createTubeMethod,
  createStreamletMethod,
} from './stream-canvas';
import { createGlyphMethod } from './glyphs';
import { createLicMethod } from './lic';

const BG = [0.043, 0.063, 0.086];
const PANEL_IDS = ['particles', 'streamlines', 'tubes', 'glyphs', 'lic', 'streamlets'];

export function createAtlas() {
  const camera = vtkCamera.newInstance();
  camera.setParallelProjection(true);
  camera.setFocalPoint(179, 0, 0);
  camera.setPosition(179, -28, 260);
  camera.setViewUp(0, 1, 0);
  camera.setParallelScale(108);

  const lut = vtkColorTransferFunction.newInstance();
  const windows = [];
  const renderers = {};
  const methods = {};
  const outlines = [];
  const canvasMethods = [];

  for (const id of PANEL_IDS) {
    const el = document.getElementById(`view-${id}`);
    const grw = vtkGenericRenderWindow.newInstance({ background: BG, listenWindowResize: true });
    grw.setContainer(el);
    const renderer = grw.getRenderer();
    renderer.setActiveCamera(camera);
    renderer.setBackground(...BG);
    windows.push(grw);
    renderers[id] = renderer;

    const outline = vtkOutlineFilter.newInstance();
    const mapper = vtkMapper.newInstance();
    mapper.setInputConnection(outline.getOutputPort());
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setColor(0.28, 0.32, 0.38);
    actor.getProperty().setLineWidth(1);
    renderer.addActor(actor);
    outlines.push(outline);
  }

  const getRenderer = (id) => () => renderers[id];

  methods.particles = createParticleMethod(
    document.getElementById('view-particles'),
    getRenderer('particles')
  );
  methods.streamlines = createStreamlineMethod(
    document.getElementById('view-streamlines'),
    getRenderer('streamlines')
  );
  methods.tubes = createTubeMethod(
    document.getElementById('view-tubes'),
    getRenderer('tubes')
  );
  methods.glyphs = createGlyphMethod(
    document.getElementById('view-glyphs'),
    getRenderer('glyphs')
  );
  methods.lic = createLicMethod(
    document.getElementById('view-lic'),
    getRenderer('lic')
  );
  methods.streamlets = createStreamletMethod(
    document.getElementById('view-streamlets'),
    getRenderer('streamlets')
  );

  canvasMethods.push(
    methods.particles,
    methods.streamlines,
    methods.tubes,
    methods.glyphs,
    methods.lic,
    methods.streamlets
  );

  function resize() {
    for (const grw of windows) grw.resize();
    for (const method of canvasMethods) method.resize?.();
  }

  new ResizeObserver(resize).observe(document.querySelector('.atlas'));

  return {
    lut,
    methods,
    outlines,
    resize,
    render() {
      for (const grw of windows) {
        try {
          grw.getRenderWindow().render();
        } catch (err) {
          console.warn('render skipped', err.message);
        }
      }
    },
    setField(field, density) {
      applyWindLut(lut, field.maxSpeed);
      for (const grw of windows) grw.resize();
      for (const grw of windows) grw.getRenderWindow().render();
      const streamPd = computeStreamlines(field);
      for (const outline of outlines) outline.setInputData(field.image);
      methods.particles.setField(field, density);
      methods.streamlines.setField(field, density, streamPd);
      methods.tubes.setField(field, density, streamPd);
      methods.glyphs.setField(field, density);
      methods.lic.setField(field, density);
      methods.streamlets.setField(field, density, streamPd);
    },
    update(dt) {
      methods.particles.update(dt);
      methods.streamlines.update(dt);
      methods.tubes.update(dt);
      methods.glyphs.update(dt);
      methods.lic.update(dt);
      methods.streamlets.update(dt);
    },
  };
}
