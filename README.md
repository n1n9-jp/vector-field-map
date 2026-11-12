# 風の描き方

同じベクトル場を、6 つの手法で同時に描画して比較するページ。描画はすべて Canvas 2D の自前実装で、外部の描画ライブラリは使っていない。

粒子移流は [earth.nullschool.net](https://earth.nullschool.net) / [cambecc/earth](https://github.com/cambecc/earth) にならい、格子風の双線形補間で求めた風で粒子を動かして軌跡を残す。積分は RK2（中点法）。

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
| 粒子移流 | `src/earth-animate.js` | 流れの速さ感と時間変化 |
| 流線 | `src/stream.js` + `src/stream-canvas.js` | 場の骨格 |
| 流管 | `src/stream-canvas.js`（速さで幅が変わるリボン） | 速さの太さ |
| 矢印グリフ | `src/earth-animate.js`（矢じり付きの線分） | 向き |
| LIC | `src/lic.js`（ノイズの移流） | 全域の筋目 |
| 流線レット | `src/stream-canvas.js`（流線上の短線分） | 向きの読み取り |

経度・緯度から画面への変換は `src/canvas-layer.js` の `createProjector` が担う（北が上の正距円筒図法）。

既定の実データは cambecc/earth 付属 GFS（2014-01-31 地表 10m 風）を 2° に間引いたもの。
