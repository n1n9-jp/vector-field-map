# 風の描き方

同じベクトル場を、[vtk.js](https://github.com/Kitware/vtk-js) で6手法同時に描画して比較するページ。

粒子移流は [earth.nullschool.net](https://earth.nullschool.net) / [cambecc/earth](https://github.com/cambecc/earth) と同じ原理（格子風の双線形補間 → RK2 移流 → 軌跡）を vtkPolyData の折れ線で実装している。流線・流管・グリフ・LIC は vtk.js の公式フィルタ／マッパを使う。

## 表示

```
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開く。各パネルはカメラを共有する。ドラッグで傾けると流管の立体が読みやすい。

GitHub Pages: https://n1n9-jp.github.io/vector-field-map/（`main` へ push で自動デプロイ）

ローカルで Pages と同じパス確認: `npm run preview:pages` → `http://localhost:4173/vector-field-map/`

## 手法

| パネル | vtk.js | 何が見えるか |
| --- | --- | --- |
| 粒子移流 | 自前の移流 + vtkPolyData | 流れの速さ感と時間変化 |
| 流線 | `vtkImageStreamline` | 場の骨格 |
| 流管 | `vtkTubeFilter` | 速さの太さ |
| 矢印グリフ | `vtkGlyph3DMapper` | 格子点の向き |
| LIC | `vtkSurfaceLICMapper` | 全域の筋目 |
| 流線レット | 流線上の短線分 | 向きの読み取り |

既定の実データは cambecc/earth 付属 GFS（2014-01-31 地表 10m 風）を 2° に間引いたもの。
