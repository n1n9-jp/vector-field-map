import vtkCoordinate from '@kitware/vtk.js/Rendering/Core/Coordinate';

function vtkCanvasEl(container) {
  return container?.querySelector(':scope > canvas:not(.flow-layer):not(.flow-bg)');
}

export function createCanvasLayer(container, className = 'flow-layer') {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: true });
  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize() {
    const vtkCanvas = vtkCanvasEl(container);
    if (vtkCanvas?.clientWidth > 0 && vtkCanvas.clientHeight > 0) {
      canvas.width = vtkCanvas.width;
      canvas.height = vtkCanvas.height;
      width = vtkCanvas.clientWidth;
      height = vtkCanvas.clientHeight;
      dpr = canvas.width / width;
    } else {
      const rect = container.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clear() {
    ctx.clearRect(0, 0, width, height);
  }

  function fade(amount = 0.06) {
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0, 0, 0, ${amount})`;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = prev;
  }

  return {
    canvas,
    ctx,
    resize,
    clear,
    fade,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get dpr() {
      return dpr;
    },
  };
}

export function createProjector(renderer, container) {
  const coord = vtkCoordinate.newInstance();
  coord.setCoordinateSystemToWorld();

  function ratios() {
    const vtkCanvas = vtkCanvasEl(container);
    if (vtkCanvas?.clientWidth > 0 && vtkCanvas.clientHeight > 0) {
      return {
        x: vtkCanvas.width / vtkCanvas.clientWidth,
        y: vtkCanvas.height / vtkCanvas.clientHeight,
      };
    }
    const view = renderer.getRenderWindow().getViews()[0];
    const r = view.getComputedDevicePixelRatio();
    return { x: r, y: r };
  }

  function sync() {
    renderer.getRenderWindow().render();
  }

  function project(lon, lat) {
    coord.setValue(lon, lat, 0);
    const d = coord.getComputedLocalDisplayValue(renderer);
    const r = ratios();
    return [d[0] / r.x, d[1] / r.y];
  }

  project.sync = sync;
  return project;
}

export function inView(x, y, w, h, pad = 16) {
  return Number.isFinite(x) && Number.isFinite(y)
    && x >= -pad && x <= w + pad && y >= -pad && y <= h + pad;
}
