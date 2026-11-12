import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import { seedGrid, sampleField, stepRK2 } from './field';

const STREAM_STEP = 0.4;

function trace(field, x0, y0, dt, maxSteps) {
  const pts = [];
  const spd = [];
  let x = x0;
  let y = y0;
  const tmp = [0, 0, 0];
  for (let k = 0; k < maxSteps; k += 1) {
    const next = stepRK2(field, x, y, dt, tmp);
    if (!next) break;
    x = next[0];
    y = next[1];
    pts.push(x, y, 0);
    spd.push(next[2]);
  }
  return { pts, spd };
}

function integrateOnCpu(field) {
  const seeds = seedGrid(20, 12, 1.8);
  const nSeeds = seeds.length / 3;
  const polylines = [];
  const tmp = [0, 0, 0];

  for (let s = 0; s < nSeeds; s += 1) {
    const x0 = seeds[s * 3];
    const y0 = seeds[s * 3 + 1];
    sampleField(field, x0, y0, tmp);
    const fwd = trace(field, x0, y0, STREAM_STEP, 110);
    const bwd = trace(field, x0, y0, -STREAM_STEP, 110);
    const pts = [];
    const spd = [];
    for (let i = bwd.spd.length - 1; i >= 0; i -= 1) {
      pts.push(bwd.pts[i * 3], bwd.pts[i * 3 + 1], 0);
      spd.push(bwd.spd[i]);
    }
    pts.push(x0, y0, 0);
    spd.push(tmp[2]);
    for (let i = 0; i < fwd.spd.length; i += 1) {
      pts.push(fwd.pts[i * 3], fwd.pts[i * 3 + 1], 0);
      spd.push(fwd.spd[i]);
    }
    if (spd.length >= 12) polylines.push({ pts, spd });
  }

  let npts = 0;
  for (const line of polylines) npts += line.spd.length;
  const points = new Float32Array(npts * 3);
  const speed = new Float32Array(npts);
  const cells = [];
  let w = 0;
  for (const line of polylines) {
    const n = line.spd.length;
    cells.push(n);
    for (let i = 0; i < n; i += 1) {
      points[w * 3] = line.pts[i * 3];
      points[w * 3 + 1] = line.pts[i * 3 + 1];
      points[w * 3 + 2] = 0;
      speed[w] = line.spd[i];
      cells.push(w);
      w += 1;
    }
  }

  const pd = vtkPolyData.newInstance();
  pd.getPoints().setData(points, 3);
  pd.getLines().setData(Uint32Array.from(cells));
  pd.getPointData().setScalars(vtkDataArray.newInstance({ name: 'speed', values: speed }));
  return pd;
}

export function computeStreamlines(field) {
  return integrateOnCpu(field);
}
