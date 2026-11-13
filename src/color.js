// 配色。パネルは白地で、速いほど濃く描く。

// IBFV の色。薄い黄から濃い紺へ進む（ColorBrewer の YlGnBu、6 段）。
export const WIND_STOPS = [
  [0, 1.0, 1.0, 0.8],
  [0.2, 0.78, 0.914, 0.706],
  [0.4, 0.498, 0.804, 0.733],
  [0.6, 0.255, 0.714, 0.769],
  [0.8, 0.173, 0.498, 0.722],
  [1, 0.145, 0.204, 0.58],
];

export function speedToRgb(t) {
  const x = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < WIND_STOPS.length - 2 && x > WIND_STOPS[i + 1][0]) i += 1;
  const a = WIND_STOPS[i];
  const b = WIND_STOPS[i + 1];
  const u = (x - a[0]) / (b[0] - a[0] || 1);
  return [
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
    a[3] + (b[3] - a[3]) * u,
  ];
}

/** 速さ（0〜1）→ 灰色の濃さ。遅い所は薄く、速い所はほぼ黒。粒子移流と流線レットに使う。 */
export function speedGray(t) {
  return Math.round(175 - 160 * Math.min(1, Math.max(0, t)));
}

/**
 * 上に濃いハイライトを重ねるパネル（流線・流管・矢印グリフ）用の、控えめな濃さ。
 * 下地が黒に近づくとハイライトが見えなくなるので、中間の灰色で止める。
 */
export function speedGraySoft(t) {
  return Math.round(185 - 100 * Math.min(1, Math.max(0, t)));
}

/** ハイライトの色（r, g, b）。rgba() の中に入れて使う。 */
export const HIGHLIGHT_RGB = '11, 16, 22';

/** 風場の範囲を示す外枠の色。 */
export const FRAME_COLOR = 'rgb(200, 204, 208)';

/** 粒子の色の段。速さの小さい順に並び、後ろほど濃い。 */
export function createWindColorStyles(count, maxIntensity) {
  const styles = [];
  for (let i = 0; i < count; i += 1) {
    const g = speedGray(i / (count - 1));
    styles.push(`rgb(${g}, ${g}, ${g})`);
  }
  return {
    styles,
    indexFor(m) {
      return Math.floor(Math.min(Math.max(m, 0), maxIntensity) / maxIntensity * (styles.length - 1));
    },
  };
}
