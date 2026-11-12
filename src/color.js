export const WIND_STOPS = [
  [0, 0.078, 0.141, 0.227],
  [0.22, 0.114, 0.42, 0.478],
  [0.45, 0.357, 0.722, 0.604],
  [0.66, 0.886, 0.765, 0.42],
  [0.84, 0.878, 0.478, 0.282],
  [1, 0.608, 0.173, 0.173],
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

/** earth.nullschool と同じ、速さ→グレースケールの粒子色 */
export function createWindColorStyles(step = 8, maxIntensity) {
  const styles = [];
  for (let j = 85; j <= 255; j += step) {
    styles.push(`rgb(${j}, ${j}, ${j})`);
  }
  return {
    styles,
    indexFor(m) {
      return Math.floor(Math.min(Math.max(m, 0), maxIntensity) / maxIntensity * (styles.length - 1));
    },
  };
}

export function windGray(speed, maxSpeed) {
  const t = Math.min(1, Math.max(0, speed / Math.max(maxSpeed, 1e-6)));
  const g = Math.round(85 + t * 170);
  return `rgb(${g}, ${g}, ${g})`;
}

export function windGrayAlpha(speed, maxSpeed, alpha) {
  const t = Math.min(1, Math.max(0, speed / Math.max(maxSpeed, 1e-6)));
  const g = Math.round(85 + t * 170);
  return `rgba(${g}, ${g}, ${g}, ${alpha})`;
}

export function fract(x) {
  return x - Math.floor(x);
}

/** 流線上を滑る彗星。頭が明るく、尾が長い。線全体は消さない。 */
export function flowComet(s, time, pulses = 1.85) {
  const tail = 1 - fract(s * pulses - time);
  return tail * tail;
}

export function ageEnvelope(age, maxAge, fadeIn = 10, fadeOut = 16) {
  const a = Math.max(0, Math.min(1, age / fadeIn));
  const b = Math.max(0, Math.min(1, (maxAge - age) / fadeOut));
  return a * a * (3 - 2 * a) * (b * b * (3 - 2 * b));
}
