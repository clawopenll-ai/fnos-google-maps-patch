# fnOS 相簿 — 底圖改為 Google Maps

把 **飛牛 fnOS 相簿**（`trim.photos`）的底圖從「騰訊地圖」換成「Google Maps」，
保留原本所有地圖功能：主地圖、編輯照片位置、預覽側欄小地圖、照片聚合。

> ⚠️ **非官方補丁。** 本專案與飛牛／fnOS／騰訊／Google 無任何關聯或背書。
> 請自行從官方取得 fnOS 與相簿 app。本專案不含任何飛牛的前端原始碼。

---

## 為什麼要改？

原版相冊使用 **騰訊地圖 GL JS**（`https://map.qq.com/api/gljs`）。

更重要的是——**原版顯示的照片位置本來就是錯的**：

- 相片儲存的是照片 EXIF 裡的原始 **WGS-84** 座標
- 騰訊地圖是中國境內強制使用的 **GCJ-02**（火星座標）底圖
- 飛牛相冊**沒有對 GPS 座標做 GCJ-02 糾偏**，於是標記在騰訊地圖上整體偏移 100–700 公尺

（此問題在飛牛官方社群〈相册地图位置偏移〉已有用戶回報，管理方亦回覆確認是「相冊應用未對 gps 位置進行糾偏」。）

換成 Google Maps（WGS-84）之後，照片標記會**直接落在真實位置**，等於順手修掉這個既有問題。

---

## 實作原理：換 SDK，不改元件

相簿的三個地圖元件都是**已壓縮**的 React 程式碼，直接改它們風險極高。
本方案改成**替換底層地圖 SDK**：

```
原版                                    現在
────────────────────────────────    ──────────────────────────────────────
window.TMap = 騰訊 TMap GL JS      →   window.TMap = Leaflet + Google 瓦片（相容層）
PhotoDomOverlay extends            →   PhotoDomOverlay = Leaflet Marker
  TMap.DOMOverlay                       + 相簿原本的 DOM 結構
```

相容層完整實作了原件使用到的 API：

| 類別 | 實作的成員 |
|---|---|
| `TMap.Map` | `getBounds` `getCenter` `getZoom` `setZoom` `setCenter` `zoomTo` `easeTo` `on` `getControl` `removeControl` `setMapStyleId` `projectToContainer` `destroy` |
| `TMap.LatLng` / `LatLngBounds` | `getLat` `getLng` `getNorthEast` `getSouthWest` |
| `TMap.MarkerCluster` | `add` `getClusters` `on('cluster_changed')` `destroy` |
| `TMap.constants` | `DEFAULT_CONTROL_ID` `CONTROL_POSITION` |
| `PhotoDomOverlay` | `on('click')` `destroy()` `updateCount()` `updateURL()` |

模組的**匯出名完全不變**（`a c d i l n o r s t u`），所以相簿前端元件**一行都不用改**。

深色模式沿用相簿原本的 `style1` / `style2` 切換機制，對瓦片層套用反相濾鏡，照片標記不受影響。

---

## 適用範圍

- fnOS 相簿 `trim.photos` **v0.9.14**（其他版本請先自行比對檔名是否一致）
- 前端資源目錄：`/usr/local/apps/@appcenter/trim.photos/static/assets/`
- 目標檔案：`l1Zo7QHRsLu3cCA9.js`（騰訊地圖載入器）
- 適用架構：x86_64（其他架構請自行確認）

> 相簿升級後 `static/` 會被整包替換，補丁會失效——升級後請重新套用（步驟相同，備份檔請保留）。

---

## 安裝

### 前置條件

1. 相片 app 已安裝並可正常開啟
2. 能以 `root` 權限寫入相簿前端目錄（fnOS 終端機或 SSH）

### 步驟

```bash
# 1. 把補丁包放到 NAS 的 /tmp/gmaps-patch/
#    （包含 l1Zo7QHRsLu3cCA9.js / leaflet.js / leaflet.css / gmaps-config.js）

# 2. 執行安裝腳本（會自動備份原檔）
sudo bash /tmp/gmaps-patch/deploy-on-nas.sh install /tmp/gmaps-patch

# 3. 回到瀏覽器，開啟相冊的地圖頁，按 Ctrl+Shift+R 強制重新整理
```

Windows 用戶可改用 `deploy/deploy.ps1`（用 `scp` 上傳並自動執行）：

```powershell
.\deploy\deploy.ps1 -NasIp <你的NAS_IP> -NasUser admin
```

### 驗證

瀏覽器控制台執行：

```js
__FNOS_GMAPS_PATCH__     // 應輸出 "google-maps-v1"
```

地圖右下角應顯示 `Leaflet | © Google`，底圖為 Google 道路地圖（中文標注）。

> **必須強制重新整理（`Ctrl+Shift+R`）**：相簿的 JS 資源沒有 `Cache-Control` 標頭，
> 瀏覽器會套用啟發式快取，普通重新整理可能仍載入舊檔。

---

## 回滾

```bash
sudo bash /tmp/gmaps-patch/deploy-on-nas.sh rollback
```

或手動：

```bash
cd /usr/local/apps/@appcenter/trim.photos/static/assets
sudo cp -p l1Zo7QHRsLu3cCA9.js.orig-bak l1Zo7QHRsLu3cCA9.js
sudo rm -f leaflet.js leaflet.css gmaps-config.js
```

回滾後同樣需要 `Ctrl+Shift+R`。

---

## 自訂設定

安裝後可直接編輯 NAS 上的 `static/assets/gmaps-config.js`，存檔後重新整理即可生效
（**不需要重新部署**）：

```js
window.__GMAPS_CONFIG__ = {
  /* 亮色底圖：Google 道路地圖 */
  tileUrl:          "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=zh-CN",
  /* 衛星底圖（把 tileUrl 換成這行即可） */
  satelliteTileUrl: "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=zh-CN",
  /* Google 掛掉時的降級底圖（留空則不降級） */
  fallbackTileUrl:  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  subdomains:       ["mt0", "mt1", "mt2", "mt3"],
  maxZoom:          20,
  /* 深色模式濾鏡，只作用於瓦片層 */
  darkTileFilter:   "invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.92)",
  /* 相片庫座標系：
     "wgs84" = 原始 GPS 座標直接使用（飛牛相簿的預設行為，正確）
     "gcj02" = 若你的照片庫座標已被轉成 GCJ-02，會自動反算回 WGS-84 */
  coordinateMode:   "wgs84",
  /* 聚合網格尺寸（像素），對應原版 gridSize: 100 */
  clusterGridSize:  100
};
```

---

## 限制與注意事項

1. **沒有使用 Google Maps JS API**，因此不含街景（Street View）、Place 搜尋、
   雲端小工具、地圖樣式面板等功能。這是為了免除 API Key 設定。
2. **Google 圖磚端點非官方公開 API**，中國境內連線可能不穩定。
   已內建 OpenStreetMap 自動降級。若要完全合規，請改用
   Google Maps JS API + 自有 API Key（需改寫相容層的瓦圖層）。
3. **相簿 app 升級會覆蓋補丁**，需重新套用。
4. `flyTo` 動畫路徑在無頭/背景分頁中因 `requestAnimationFrame` 被節流而不生效，
   這是瀏覽器行為，非補丁問題（可見分頁正常）。
5. 本補丁僅改動**前端**，不影響相簿後端與照片資料庫。

---

## 本機測試

```powershell
# 啟動測試伺服器（PowerShell）
powershell -ExecutionPolicy Bypass -File test\serve.ps1 -Port 8765
# 開啟 http://127.0.0.1:8765/index.html
```

`test/index.html` 會模擬相冊的三個地圖畫面，用 mock 資料驅動完整的
`TMap` 相容層，逐一驗證 36 項 API 行為。

---

## 檔案結構

```
├── README.md
├── LICENSE
├── NOTICE
├── assets/                 ★ 要部署到 NAS 的檔案
│   ├── l1Zo7QHRsLu3cCA9.js   相容層（替換騰訊地圖模組）
│   ├── leaflet.js            Leaflet 1.9.4
│   ├── leaflet.css
│   └── gmaps-config.js       可調參數
├── deploy/
│   ├── deploy.ps1            Windows 一鍵部署
│   └── deploy-on-nas.sh      NAS 端安裝 / 回滾
└── test/
    ├── index.html            相容層測試頁（36 項斷言）
    ├── serve.ps1             本機測試用靜態伺服器
    └── dsC_r5j-ZkVMT4Rx.js   測試用縮圖兜底 stub
```

---

## 第三方元件

| 元件 | 授權 | 說明 |
|---|---|---|
| [Leaflet](https://leafletjs.com/) 1.9.4 | BSD-2-Clause | 地圖引擎，隨包發佈以免依賴 CDN |

詳見 [`NOTICE`](./NOTICE)。

## 免責聲明

本專案以「現況提供」方式發佈，與飛牛 fnOS、騰訊地圖、Google 無任何關聯。
使用前請自行評估風險並備份資料。本專案作者不對任何資料損失負責。
