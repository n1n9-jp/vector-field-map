// 等間隔流線（Jobard & Lefer 1997, https://doi.org/10.1007/978-3-7091-6876-9_5）。
// 座標は地図座標（x = 経度[度], y = 緯度[度]）。正距円筒図法で等方に表示するので、
// 等間隔の判定もこの座標系で行う。経度は 360° 周期として扱う。
import { NX, NY, SPACING } from './field';

const DX = SPACING[0];
const PERIOD = 360;

export const DEFAULTS = {
  density: 1, // スライダー値 0.4〜1.6
  pxPerDeg: 250 / 216, // 画面の倍率 [px/度]。呼び出し側がパネルの実寸から渡す
  dsepPx: 10, // density=1 のときの分離距離 [px]
  dtestRatio: 0.5, // dtest = 0.5 * dsep
  stepPx: 2, // 弧長刻み [px]
  minSpeedRatio: 0.02, // |V| < 0.02 * maxSpeed で打ち切り
  maxArcRatio: 2, // 片方向の最大弧長 = 2 * 360 deg
  minLenRatio: 1, // 全長 < 1 * dsep の線は捨てる
  selfWindowRatio: 2, // 自線の点は弧長差 2*dsep 以内なら判定から除外
  latCorrect: false,
  latClampDeg: 85,
  visibleMaxX: 358, // 358 < x < 360 は描かない（枠の外）
  closeLoops: true, // 閉じた軌道は輪にする
};

/** 双線形補間（経度周期）。out = [ux, uy, |V|物理, |V|地図] */
export function sampleMapVelocity(field, x, y, out, latCorrect, cosMin) {
  if (!(y >= -90 && y <= 90)) return false;
  let xw = x % PERIOD;
  if (xw < 0) xw += PERIOD;
  const fx = xw / DX;
  let fy = (y + 90) / DX;
  let i0 = Math.floor(fx);
  if (i0 >= NX) i0 = NX - 1;
  const i1 = (i0 + 1) % NX; // 358° と 0° をつなぐ
  const tx = fx - i0;
  let j0 = Math.floor(fy);
  if (j0 >= NY - 1) j0 = NY - 2;
  const ty = fy - j0;
  const j1 = j0 + 1;
  const vec = field.vectors;
  const a = (j0 * NX + i0) * 3;
  const b = (j0 * NX + i1) * 3;
  const c = (j1 * NX + i0) * 3;
  const d = (j1 * NX + i1) * 3;
  const u = (vec[a] * (1 - tx) + vec[b] * tx) * (1 - ty) + (vec[c] * (1 - tx) + vec[d] * tx) * ty;
  const v = (vec[a + 1] * (1 - tx) + vec[b + 1] * tx) * (1 - ty) + (vec[c + 1] * (1 - tx) + vec[d + 1] * tx) * ty;
  const s = Math.hypot(u, v);
  let mu = u;
  if (latCorrect) {
    const cl = Math.max(Math.cos((y * Math.PI) / 180), cosMin);
    mu = u / cl;
  }
  out[0] = mu;
  out[1] = v;
  out[2] = s;
  out[3] = Math.hypot(mu, v);
  return true;
}

function wrapX(x) {
  let w = x % PERIOD;
  if (w < 0) w += PERIOD;
  return w;
}

/** 近傍判定用の一様格子（セル = dsep 以上、経度周期）。連結リストで点を保持。 */
class PointGrid {
  constructor(cell, capacity = 1 << 14) {
    this.ncx = Math.max(1, Math.floor(PERIOD / cell));
    this.ncy = Math.max(1, Math.floor(180 / cell));
    this.cw = PERIOD / this.ncx;
    this.ch = 180 / this.ncy;
    this.head = new Int32Array(this.ncx * this.ncy).fill(-1);
    this.cap = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.arc = new Float32Array(capacity);
    this.line = new Int32Array(capacity);
    this.next = new Int32Array(capacity);
    this.cellOf = new Int32Array(capacity);
    this.n = 0;
  }
  cellIndex(xw, y) {
    let cx = Math.floor(xw / this.cw);
    if (cx >= this.ncx) cx = this.ncx - 1;
    let cy = Math.floor((y + 90) / this.ch);
    if (cy < 0) cy = 0;
    if (cy >= this.ncy) cy = this.ncy - 1;
    return cy * this.ncx + cx;
  }
  grow() {
    const cap = this.cap * 2;
    for (const k of ['x', 'y', 'arc', 'line', 'next', 'cellOf']) {
      const old = this[k];
      const nu = new old.constructor(cap);
      nu.set(old);
      this[k] = nu;
    }
    this.cap = cap;
  }
  insert(x, y, lineId, arc) {
    if (this.n >= this.cap) this.grow();
    const k = this.n;
    const xw = wrapX(x);
    const c = this.cellIndex(xw, y);
    this.x[k] = xw;
    this.y[k] = y;
    this.arc[k] = arc;
    this.line[k] = lineId;
    this.cellOf[k] = c;
    this.next[k] = this.head[c];
    this.head[c] = k;
    this.n += 1;
    return k;
  }
  /** 直近に入れた点から count 個を取り消す（不採用の線用） */
  rollback(count) {
    for (let r = 0; r < count; r += 1) {
      this.n -= 1;
      const k = this.n;
      this.head[this.cellOf[k]] = this.next[k];
    }
  }
  /** 半径 r 以内に点があるか。lineId の点は弧長差 < selfWin なら無視 */
  hasNear(x, y, r, lineId = -1, arc = 0, selfWin = 0) {
    const xw = wrapX(x);
    const cx = Math.min(this.ncx - 1, Math.floor(xw / this.cw));
    const cy = Math.min(this.ncy - 1, Math.max(0, Math.floor((y + 90) / this.ch)));
    const r2 = r * r;
    for (let oy = -1; oy <= 1; oy += 1) {
      const yy = cy + oy;
      if (yy < 0 || yy >= this.ncy) continue;
      for (let ox = -1; ox <= 1; ox += 1) {
        if (this.ncx < 3 && ox !== 0) continue;
        const xx = (cx + ox + this.ncx) % this.ncx;
        for (let k = this.head[yy * this.ncx + xx]; k !== -1; k = this.next[k]) {
          if (this.line[k] === lineId && Math.abs(this.arc[k] - arc) < selfWin) continue;
          let dx = this.x[k] - xw;
          if (dx > 180) dx -= PERIOD;
          else if (dx < -180) dx += PERIOD;
          const dy = this.y[k] - y;
          if (dx * dx + dy * dy < r2) return true;
        }
      }
    }
    return false;
  }
  /** 半径 r 以内で最も近い（他線 or 自線の遠い部分の）点までの距離。なければ r */
  nearest(x, y, r, lineId, arc, selfWin) {
    const xw = wrapX(x);
    const cx = Math.min(this.ncx - 1, Math.floor(xw / this.cw));
    const cy = Math.min(this.ncy - 1, Math.max(0, Math.floor((y + 90) / this.ch)));
    let best = r * r;
    let bestK = -1;
    for (let oy = -1; oy <= 1; oy += 1) {
      const yy = cy + oy;
      if (yy < 0 || yy >= this.ncy) continue;
      for (let ox = -1; ox <= 1; ox += 1) {
        if (this.ncx < 3 && ox !== 0) continue;
        const xx = (cx + ox + this.ncx) % this.ncx;
        for (let k = this.head[yy * this.ncx + xx]; k !== -1; k = this.next[k]) {
          if (this.line[k] === lineId && Math.abs(this.arc[k] - arc) < selfWin) continue;
          let dx = this.x[k] - xw;
          if (dx > 180) dx -= PERIOD;
          else if (dx < -180) dx += PERIOD;
          const dy = this.y[k] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < best) {
            best = d2;
            bestK = k;
          }
        }
      }
    }
    return { d: Math.sqrt(best), k: bestK };
  }
}

/**
 * 等間隔流線を作る。
 * 戻り値:
 *   lines: Float32Array[]  … (x, y, 0) の 3 つ組。x は [0, visibleMaxX] に収まる。
 *   attrs: { speed, tau, clear }[] … lines と同じ添字・同じ点数
 *        speed: 物理風速 |V|（場の単位）
 *        tau:   積分時間（流線の始点からの累積, dτ = ds / |V_map|）。継ぎ目で切っても連続
 *        clear: 他の線（自線の遠い部分を含む）までの点間距離 [px]、上限 dsepPx
 *   params: 使った値（deg / px）
 */
export function buildStreamlines(field, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const k = o.pxPerDeg;
  const dsepPx = o.dsepPx / o.density;
  const dsep = dsepPx / k;
  const dtest = dsep * o.dtestRatio;
  const h = o.stepPx / k;
  const vmin = field.maxSpeed * o.minSpeedRatio;
  const maxArc = PERIOD * o.maxArcRatio;
  const minLen = dsep * o.minLenRatio;
  const selfWin = dsep * o.selfWindowRatio;
  const cosMin = Math.cos((o.latClampDeg * Math.PI) / 180);
  const lc = o.latCorrect;

  const grid = new PointGrid(dsep);
  const s1 = [0, 0, 0, 0];
  const s2 = [0, 0, 0, 0];
  const s3 = [0, 0, 0, 0];
  const s4 = [0, 0, 0, 0];
  const stats = { traced: 0, rejectedShort: 0, closedLoops: 0, stop: { close: 0, self: 0, slow: 0, domain: 0, maxlen: 0, flip: 0 } };

  // 正規化した場での RK4（1 歩 = 弧長 h）。成功で [x, y] を out に。
  function rk4(x, y, hs, out) {
    if (!sampleMapVelocity(field, x, y, s1, lc, cosMin) || s1[2] < vmin || s1[3] < 1e-9) return 'slow';
    const ax = s1[0] / s1[3];
    const ay = s1[1] / s1[3];
    if (!sampleMapVelocity(field, x + ax * hs * 0.5, y + ay * hs * 0.5, s2, lc, cosMin)) return 'domain';
    if (s2[3] < 1e-9) return 'slow';
    const bx = s2[0] / s2[3];
    const by = s2[1] / s2[3];
    if (!sampleMapVelocity(field, x + bx * hs * 0.5, y + by * hs * 0.5, s3, lc, cosMin)) return 'domain';
    if (s3[3] < 1e-9) return 'slow';
    const cx = s3[0] / s3[3];
    const cy = s3[1] / s3[3];
    if (!sampleMapVelocity(field, x + cx * hs, y + cy * hs, s4, lc, cosMin)) return 'domain';
    if (s4[3] < 1e-9) return 'slow';
    const dx4 = s4[0] / s4[3];
    const dy4 = s4[1] / s4[3];
    // 向きの反転（臨界点をまたいだ）
    if (ax * bx + ay * by < 0 || ax * cx + ay * cy < 0 || ax * dx4 + ay * dy4 < 0) return 'flip';
    let mx = ax + 2 * bx + 2 * cx + dx4;
    let my = ay + 2 * by + 2 * cy + dy4;
    const m = Math.hypot(mx, my) || 1;
    out[0] = x + (mx / m) * hs; // 弧長を厳密に h にそろえる
    out[1] = y + (my / m) * hs;
    return null;
  }

  // 片方向に伸ばす。点は grid に仮挿入しつつ xs/ys に積む
  function grow(x0, y0, dir, lineId, xs, ys, arcs) {
    let x = x0;
    let y = y0;
    let arc = 0;
    const nxt = [0, 0];
    let inserted = 0;
    lastWhy = 'none';
    for (;;) {
      const why = rk4(x, y, h * dir, nxt);
      if (why) {
        stats.stop[why] += 1;
        lastWhy = why;
        break;
      }
      if (nxt[1] < -90 || nxt[1] > 90) {
        stats.stop.domain += 1;
        break;
      }
      const a = arc + h * dir;
      if (Math.abs(a) > maxArc) {
        stats.stop.maxlen += 1;
        break;
      }
      if (grid.hasNear(nxt[0], nxt[1], dtest, lineId, a, selfWin)) {
        // 他線か、自線の遠い部分（ループ）か
        if (grid.hasNear(nxt[0], nxt[1], dtest, lineId, a, Infinity)) {
          stats.stop.close += 1;
          lastWhy = 'close';
        } else {
          stats.stop.self += 1;
          lastWhy = 'self';
        }
        break;
      }
      x = nxt[0];
      y = nxt[1];
      arc = a;
      grid.insert(x, y, lineId, arc);
      inserted += 1;
      xs.push(x);
      ys.push(y);
      arcs.push(arc);
    }
    return inserted;
  }

  let lastWhy = 'none';
  const raw = []; // { xs, ys, arcs, id, closed }
  function trace(sx, sy) {
    const id = raw.length;
    stats.traced += 1;
    const fx = [];
    const fy = [];
    const fa = [];
    const bx = [];
    const by = [];
    const ba = [];
    grid.insert(sx, sy, id, 0);
    let ins = 1;
    ins += grow(sx, sy, 1, id, fx, fy, fa);
    // 閉じた軌道: 前進方向が自線で止まり、末端が種点の近くなら輪を閉じて後退方向は伸ばさない
    let closed = false;
    if (o.closeLoops && lastWhy === 'self' && fx.length) {
      const lx = fx[fx.length - 1];
      const ly = fy[fy.length - 1];
      let ddx = lx - sx;
      ddx -= PERIOD * Math.round(ddx / PERIOD);
      if (Math.hypot(ddx, ly - sy) < dtest + h) {
        closed = true;
        stats.closedLoops += 1;
        fx.push(lx - ddx); // 種点（展開した経度で連続させる）
        fy.push(sy);
        fa.push(fa[fa.length - 1] + Math.hypot(ddx, ly - sy));
      }
    }
    if (!closed) ins += grow(sx, sy, -1, id, bx, by, ba);
    const len = (fa.length ? fa[fa.length - 1] : 0) - (ba.length ? ba[ba.length - 1] : 0);
    if (len < minLen) {
      grid.rollback(ins);
      stats.rejectedShort += 1;
      return null;
    }
    const n = fx.length + bx.length + 1;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    const arcs = new Float64Array(n);
    let w = 0;
    for (let i = bx.length - 1; i >= 0; i -= 1) {
      xs[w] = bx[i];
      ys[w] = by[i];
      arcs[w] = ba[i];
      w += 1;
    }
    xs[w] = sx;
    ys[w] = sy;
    arcs[w] = 0;
    w += 1;
    for (let i = 0; i < fx.length; i += 1) {
      xs[w] = fx[i];
      ys[w] = fy[i];
      arcs[w] = fa[i];
      w += 1;
    }
    const line = { xs, ys, arcs, id, closed };
    raw.push(line);
    return line;
  }

  function validSeed(x, y) {
    if (y <= -90 || y >= 90) return false;
    if (!sampleMapVelocity(field, x, y, s1, lc, cosMin) || s1[2] < vmin) return false;
    return !grid.hasNear(x, y, dsep);
  }

  // 最初の種点: 最大風速の格子点（決定的）
  let best = -1;
  let bi = 0;
  for (let i = 0; i < NX * NY; i += 1) {
    if (field.speed[i] > best) {
      best = field.speed[i];
      bi = i;
    }
  }
  const queue = [];
  const first = trace((bi % NX) * DX, Math.floor(bi / NX) * DX - 90);
  if (first) queue.push(first);

  // 予備の種点: dsep 間隔の格子を左下から走査（決定的）
  const fbNx = Math.floor(PERIOD / dsep);
  const fbNy = Math.floor(180 / dsep);
  let fbPtr = 0;
  const fbTotal = fbNx * fbNy;

  for (;;) {
    while (queue.length) {
      const L = queue.shift();
      const n = L.xs.length;
      for (let i = 0; i < n; i += 1) {
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(n - 1, i + 1);
        let tx = L.xs[i1] - L.xs[i0];
        let ty = L.ys[i1] - L.ys[i0];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        for (const side of [1, -1]) {
          const cx = L.xs[i] - ty * dsep * side;
          const cy = L.ys[i] + tx * dsep * side;
          if (validSeed(cx, cy)) {
            const nl = trace(cx, cy);
            if (nl) queue.push(nl);
          }
        }
      }
    }
    let found = false;
    while (fbPtr < fbTotal) {
      const gx = ((fbPtr % fbNx) + 0.5) * (PERIOD / fbNx);
      const gy = (Math.floor(fbPtr / fbNx) + 0.5) * (180 / fbNy) - 90;
      fbPtr += 1;
      if (validSeed(gx, gy)) {
        const nl = trace(gx, gy);
        if (nl) {
          queue.push(nl);
          found = true;
          break;
        }
      }
    }
    if (!found) break;
  }

  // 属性（速さ・積分時間・すき間）を継ぎ目で切る前に計算する
  const out = [];
  const attrs = [];
  const sid = [];
  for (const L of raw) {
    const n = L.xs.length;
    const spd = new Float64Array(n);
    const msp = new Float64Array(n);
    const clr = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      sampleMapVelocity(field, L.xs[i], L.ys[i], s1, lc, cosMin);
      spd[i] = s1[2];
      msp[i] = Math.max(s1[3], 1e-9);
      // 閉じた輪は自線を判定から外す（継ぎ目で細くならないように）
      clr[i] = Math.min(grid.nearest(L.xs[i], L.ys[i], dsep, L.id, L.arcs[i], L.closed ? Infinity : selfWin).d, dsep) * k;
    }
    // 曲率半径でも抑える: 全幅 <= 1.8 R（きつい渦で帯が裏返らないように）
    for (let i = 1; i < n - 1; i += 1) {
      const ax = L.xs[i] - L.xs[i - 1];
      const ay = L.ys[i] - L.ys[i - 1];
      const bx = L.xs[i + 1] - L.xs[i];
      const by = L.ys[i + 1] - L.ys[i];
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      const th = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb || 1))));
      if (th > 1e-6) clr[i] = Math.min(clr[i], 1.8 * ((0.5 * (la + lb)) / th) * k);
    }
    const tau = new Float64Array(n);
    for (let i = 1; i < n; i += 1) {
      const ds = Math.abs(L.arcs[i] - L.arcs[i - 1]);
      tau[i] = tau[i - 1] + ds * 0.5 * (1 / msp[i - 1] + 1 / msp[i]);
    }
    splitAtSeam(L, spd, tau, clr, o.visibleMaxX, out, attrs, sid);
  }
  return {
    lines: out,
    attrs,
    streamId: sid,
    params: { dsepPx, dsepDeg: dsep, dtestDeg: dtest, dtestPx: dtest * k, stepDeg: h, vmin },
  };
}

/** 経度の継ぎ目と非表示帯 (visibleMaxX, 360) で区切る。境界点は補間して置く。 */
function splitAtSeam(L, spd, tau, clr, vmax, out, attrs, sid) {
  const n = L.xs.length;
  let cur = null;
  const flush = () => {
    if (cur && cur.x.length >= 2) {
      const m = cur.x.length;
      const f = new Float32Array(m * 3);
      for (let i = 0; i < m; i += 1) {
        f[i * 3] = cur.x[i];
        f[i * 3 + 1] = cur.y[i];
      }
      out.push(f);
      attrs.push({ speed: Float32Array.from(cur.s), tau: Float32Array.from(cur.t), clear: Float32Array.from(cur.c) });
      sid.push(L.id);
    }
    cur = null;
  };
  const push = (x, y, s, t, c) => {
    if (!cur) cur = { x: [], y: [], s: [], t: [], c: [] };
    cur.x.push(x);
    cur.y.push(y);
    cur.s.push(s);
    cur.t.push(t);
    cur.c.push(c);
  };
  for (let i = 0; i < n; i += 1) {
    const xw = wrapX(L.xs[i]);
    const vis = xw <= vmax;
    if (i > 0) {
      const xp = wrapX(L.xs[i - 1]);
      const dx = L.xs[i] - L.xs[i - 1];
      const visP = xp <= vmax;
      const xc = xp + dx; // 前の点の座標系での今の点
      // [前の点の座標系での境界位置, 出る側の x, 入る側の x]
      let cross = null;
      if (visP && !vis) cross = dx > 0 ? [vmax, vmax, null] : [0, 0, null];
      else if (!visP && vis) cross = dx > 0 ? [PERIOD, null, 0] : [vmax, null, vmax];
      else if (visP && vis && xc < 0) cross = [0, 0, Math.min(vmax, PERIOD)];
      else if (visP && vis && xc >= PERIOD) cross = [PERIOD, Math.min(vmax, PERIOD), 0];
      if (cross) {
        const u = (cross[0] - xp) / dx;
        const by = L.ys[i - 1] + (L.ys[i] - L.ys[i - 1]) * u;
        const bs = spd[i - 1] + (spd[i] - spd[i - 1]) * u;
        const bt = tau[i - 1] + (tau[i] - tau[i - 1]) * u;
        const bc = clr[i - 1] + (clr[i] - clr[i - 1]) * u;
        if (cross[1] !== null) {
          push(cross[1], by, bs, bt, bc);
          flush();
        }
        if (cross[2] !== null) push(cross[2], by, bs, bt, bc);
      }
    }
    if (vis) push(xw, L.ys[i], spd[i], tau[i], clr[i]);
  }
  flush();
}
