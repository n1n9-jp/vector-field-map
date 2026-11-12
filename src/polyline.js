export function parsePolylines(pd) {
  const pts = pd.getPoints().getData();
  const lines = pd.getLines().getData();
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const count = lines[i];
    i += 1;
    const line = new Float32Array(count * 3);
    for (let k = 0; k < count; k += 1) {
      const id = lines[i];
      i += 1;
      line[k * 3] = pts[id * 3];
      line[k * 3 + 1] = pts[id * 3 + 1];
      line[k * 3 + 2] = pts[id * 3 + 2];
    }
    if (count > 6) out.push(line);
  }
  return out;
}
