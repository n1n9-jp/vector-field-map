import { seedGrid, stepRK2 } from './field';

const STREAM_STEP = 0.4;

function trace(field, x0, y0, dt, maxSteps) {
  const pts = [];
  let x = x0;
  let y = y0;
  const tmp = [0, 0, 0];
  for (let k = 0; k < maxSteps; k += 1) {
    const next = stepRK2(field, x, y, dt, tmp);
    if (!next) break;
    x = next[0];
    y = next[1];
    pts.push(x, y, 0);
  }
  return pts;
}

/**
 * 種点から前後に積分した流線。
 * 戻り値は流線ごとの Float32Array（x, y, 0 の 3 つ組の並び）の配列。
 */
export function computeStreamlines(field) {
  const seeds = seedGrid(20, 12, 1.8);
  const nSeeds = seeds.length / 3;
  const lines = [];

  for (let s = 0; s < nSeeds; s += 1) {
    const x0 = seeds[s * 3];
    const y0 = seeds[s * 3 + 1];
    const fwd = trace(field, x0, y0, STREAM_STEP, 110);
    const bwd = trace(field, x0, y0, -STREAM_STEP, 110);
    const npts = bwd.length / 3 + 1 + fwd.length / 3;
    if (npts < 12) continue;
    const line = new Float32Array(npts * 3);
    let w = 0;
    for (let i = bwd.length / 3 - 1; i >= 0; i -= 1) {
      line[w] = bwd[i * 3];
      line[w + 1] = bwd[i * 3 + 1];
      w += 3;
    }
    line[w] = x0;
    line[w + 1] = y0;
    w += 3;
    line.set(fwd, w);
    lines.push(line);
  }
  return lines;
}
