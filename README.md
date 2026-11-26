# dccool｜大倉酷眼鏡工具集

收錄鏡片模擬、配鏡定位與門市作業工具。網站首頁是員工查詢；要評估染色、鏡片厚度或配戴效果，可直接開啟 [Lens 鏡片模擬工作台](https://crisvictor.github.io/dccool/gradient.html)。

## 鏡片模擬工作台

| 頁籤 | 可以做什麼 |
| --- | --- |
| 01 染色評估 | 選擇色系、深度、染色比例與方向，設定片坯直徑及移心量，預覽並列印。 |
| 02 精修薄評估 | 調整有效光學內徑，查看剖面與 3D 曲率變化。紫色標示精修區。 |
| 03 厚度分析 | 比較裁型後的邊緣厚度、所需片徑與水平、垂直剖面。 |
| 04 配戴模擬 | 調整雙眼處方、框型與實際瞳位，在完整鏡架上查看配戴效果。 |

第一次使用 1:1 取型時，先用實體尺核對畫面的 50 mm 校正尺。若要查詢可訂製的片徑與度數，可從工作台右上角開啟「度數範圍查詢」，再選擇康德或偉星。染色與厚度畫面供模擬比較，實際顏色請對照色板，訂製條件以廠商確認為準。

## 其他常用入口

| 用途 | 頁面 |
| --- | --- |
| 門市作業 | [員工查詢](https://crisvictor.github.io/dccool/) · [檢核與績效細則](https://crisvictor.github.io/dccool/Deta.html) · [鏡框採購分配](https://crisvictor.github.io/dccool/fe.html) |
| 配鏡工具 | [配鏡定位](https://crisvictor.github.io/dccool/optical_fitting_locator.html) · [鏡片厚度模擬器](https://crisvictor.github.io/dccool/Lens.html) |
| 活動與播放 | [抽籤與點名](https://crisvictor.github.io/dccool/cards.html) · [抽籤轉盤](https://crisvictor.github.io/dccool/Turntable.html) · [門市音樂播放器](https://crisvictor.github.io/dccool/company_bgm_player.html) |
| 工具導覽 | [小工具聚合站](https://crisvictor.github.io/dccool/Tool.html) |

## 維護工作台

工作台的入口檔是 `gradient.html`。更新 GitHub Pages 時，下列檔案需要保留在同一層，檔名大小寫也要一致。

| 檔案 | 用途 |
| --- | --- |
| `Old_gradient.html` | 工作台開啟的列印、廠商度數查詢與進階設定頁 |
| `three.min.js`、`OrbitControls.js` | 3D 鏡片、鏡架與視角操作 |
| `positive-lens.js` | 鏡片曲面與厚度計算 |
| `three-LICENSE.txt` | 隨附的 Three.js 授權聲明 |

部署後可開啟工作台，確認 3D 鏡片正常顯示，再點選「度數範圍查詢」與「列印」，檢查工具頁是否能載入。
