# 風の描き方

同じベクトル場を、6 つの手法で同時に描画して比較するページ。描画はすべて Canvas 2D の自前実装で、外部の描画ライブラリは使っていない。

粒子移流は、格子風の双線形補間で求めた風で粒子を動かし、尾を少しずつ薄くしながら軌跡を残す。積分は RK2（中点法）。

## 表示

```
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開く。

GitHub Pages: https://n1n9-jp.github.io/vector-field-map/（`main` へ push → `gh-pages` ブランチへビルド成果物を載せて公開）

ローカルで Pages と同じパス確認: `npm run preview:pages` → `http://localhost:4173/vector-field-map/`

## 手法

| パネル | 実装 | 何が見えるか |
| --- | --- | --- |
| 粒子移流 | `src/particle-animator.js` | 流れの速さ感と時間変化 |
| 流線 | `src/streamlines.js`（等間隔流線）+ `src/stream-canvas.js` | 場の骨格 |
| 流管 | `src/stream-canvas.js`（速さで幅が変わるリボン） | 速さの太さ |
| 矢印グリフ | `src/glyphs.js`（等間隔の固定点に置いた矢印） | 各点の向きと速さ |
| IBFV | `src/ibfv.js`（[van Wijk 2002](https://www.win.tue.nl/~vanwijk/ibfv/)。明滅するノイズの移流） | 全域の筋目 |
| 流線レット | `src/stream-canvas.js`（流線上の短線分） | 向きの読み取り |

経度・緯度から画面への変換は `src/canvas-layer.js` の `createProjector` が担う（北が上の正距円筒図法）。

流線は [Jobard & Lefer (1997)](https://doi.org/10.1007/978-3-7091-6876-9_5) の等間隔配置で、正規化した場を弧長刻みの RK4 で積分する。流線・流管・流線レットの 3 パネルが同じ流線を使い、密度スライダーは線の間隔に対応する。

実データ（GFS）では、経度 1° ぶんの距離が緯度によって変わるので、東西成分を 1/cos(緯度) 倍して地図上の動きに直している（倍率は `src/field.js` の `eastwardScale`。緯度 85° の値で頭打ち）。粒子移流・矢印グリフ・IBFV は `sampleField`、流線・流管・流線レットは `src/streamlines.js` の `sampleMapVelocity` で風を読み、どちらも同じ倍率を使う。合成場は度の平面の上で定義しているので補正しない。

## 参考と出典

- 実データ：[cambecc/earth](https://github.com/cambecc/earth) 付属の GFS（2014-01-31 地表 10m 風）を 2° に間引いたもの。
- 粒子移流：粒子を流して尾を薄くしていく描き方は [earth.nullschool.net](https://earth.nullschool.net) / cambecc/earth を参考にした。
- 流線：Jobard & Lefer (1997) [Creating Evenly-Spaced Streamlines of Arbitrary Density](https://doi.org/10.1007/978-3-7091-6876-9_5)
- IBFV：van Wijk (2002) [Image Based Flow Visualization](https://www.win.tue.nl/~vanwijk/ibfv/)
