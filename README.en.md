# fnOS Photo Album — Switch the Basemap to Google Maps

> 📖 **Language / 語言**： [简体中文](README.md) | [English](README.en.md)

Switch the basemap of the **fnOS Photo Album** (`trim.photos`) from Tencent Maps to Google Maps,
while keeping every existing map feature: the main map, the photo-location editor, the small
preview map in the sidebar, and photo clustering.

> ⚠️ **Unofficial patch.** This project is not affiliated with, endorsed by, or supported by
> fnOS / Trim / Tencent / Google. Obtain fnOS and the Photo Album app from official sources.
> This repository contains **no fnOS front-end source code**.

---

## Why switch?

The stock album uses **Tencent Maps GL JS** (`https://map.qq.com/api/gljs`).

More importantly — **the photo positions shown by the stock album were wrong to begin with**:

- Photos store the original **WGS-84** coordinates from the EXIF GPS tag
- Tencent Maps is a **GCJ-02** ("Mars coordinates") basemap, mandatory inside mainland China
- The fnOS album **never applies GCJ-02 correction** to those GPS coordinates, so every marker
  lands 100–700 meters away from where the photo was actually taken

(This has been reported by users on the official fnOS community forum thread
*相册地图位置偏移*, where the maintainers confirmed that "the album application does not perform
gps coordinate correction".)

With Google Maps (WGS-84), the markers land **exactly where they belong** — the patch fixes this
pre-existing bug as a side effect.

---

## How it works: replace the SDK, don't touch the components

All three map components in the album are **minified** React bundles; patching them directly is
extremely risky. Instead this patch **swaps the underlying map SDK**:

```
Before                                    After
────────────────────────────────    ──────────────────────────────────────────────
window.TMap = Tencent TMap GL JS    →   window.TMap = Leaflet + Google tiles (shim)
PhotoDomOverlay extends            →   PhotoDomOverlay = Leaflet Marker
  TMap.DOMOverlay                       + the album's original DOM structure
```

The shim implements every API the original code touches:

| Class | Implemented members |
|---|---|
| `TMap.Map` | `getBounds` `getCenter` `getZoom` `setZoom` `setCenter` `zoomTo` `easeTo` `on` `getControl` `removeControl` `setMapStyleId` `projectToContainer` `destroy` |
| `TMap.LatLng` / `LatLngBounds` | `getLat` `getLng` `getNorthEast` `getSouthWest` |
| `TMap.MarkerCluster` | `add` `getClusters` `on('cluster_changed')` `destroy` |
| `TMap.constants` | `DEFAULT_CONTROL_ID` `CONTROL_POSITION` |
| `PhotoDomOverlay` | `on('click')` `destroy()` `updateCount()` `updateURL()` |

The module's **export names stay exactly the same** (`a c d i l n o r s t u`), so the album's
front-end components need **zero changes**.

Dark mode reuses the album's original `style1` / `style2` mechanism by applying an inversion
filter to the tile layer only — photo markers stay untouched.

---

## Scope

- fnOS Photo Album `trim.photos` **v0.9.14** (for other versions, check that the file name matches)
- Front-end asset directory: `/usr/local/apps/@appcenter/trim.photos/static/assets/`
- Target file: `l1Zo7QHRsLu3cCA9.js` (the Tencent Maps loader)
- Architecture: x86_64 (verify on other architectures yourself)

> A Photo Album upgrade replaces the whole `static/` directory, which wipes the patch — re-apply
> it after upgrading (same steps, keep your backup file).

---

## Installation

### Requirements

1. The Photo Album app is installed and opens normally
2. You can write to the album's front-end directory as `root` (fnOS terminal or SSH)

### Steps

```bash
# 1. Put the patch package in /tmp/gmaps-patch/ on the NAS
#    (contains l1Zo7QHRsLu3cCA9.js / leaflet.js / leaflet.css / gmaps-config.js)

# 2. Run the installer (it backs up the original file automatically)
sudo bash /tmp/gmaps-patch/deploy-on-nas.sh install /tmp/gmaps-patch

# 3. Go back to your browser, open the album's map page, and hard-refresh
```

Windows users can use `deploy/deploy.ps1` instead (uploads via `scp` and runs it for you):

```powershell
.\deploy\deploy.ps1 -NasIp <YOUR_NAS_IP> -NasUser admin
```

### Verify

Run this in the browser console:

```js
__FNOS_GMAPS_PATCH__     // should output "google-maps-v1"
```

The map's bottom-right corner should show `Leaflet | © Google` on a Google road map.

> **A hard refresh is mandatory (`Ctrl+Shift+R`)**: the album's JS assets are served without a
> `Cache-Control` header, so browsers apply heuristic caching and a normal refresh may keep
> loading the old file.

---

## Rollback

```bash
sudo bash /tmp/gmaps-patch/deploy-on-nas.sh rollback
```

Or manually:

```bash
cd /usr/local/apps/@appcenter/trim.photos/static/assets
sudo cp -p l1Zo7QHRsLu3cCA9.js.orig-bak l1Zo7QHRsLu3cCA9.js
sudo rm -f leaflet.js leaflet.css gmaps-config.js
```

Hard-refresh again after rolling back.

---

## Configuration

After installing, edit `static/assets/gmaps-config.js` on the NAS — save and refresh to apply.
**No re-deployment needed**:

```js
window.__GMAPS_CONFIG__ = {
  /* Light basemap: Google road map */
  tileUrl:          "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=zh-CN",
  /* Satellite basemap (swap tileUrl for this line) */
  satelliteTileUrl: "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=zh-CN",
  /* Fallback basemap used when Google fails (leave empty to disable) */
  fallbackTileUrl:  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  subdomains:       ["mt0", "mt1", "mt2", "mt3"],
  maxZoom:          20,
  /* Dark-mode filter, applied to the tile layer only */
  darkTileFilter:   "invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.92)",
  /* Photo library coordinate system:
     "wgs84" = use the raw GPS coordinates as-is (the fnOS album default, correct)
     "gcj02" = the library already stores GCJ-02 — it is converted back to WGS-84 */
  coordinateMode:   "wgs84",
  /* Cluster grid size in pixels, matching the original gridSize: 100 */
  clusterGridSize:  100
};
```

---

## Limitations and caveats

1. **The official Google Maps JS API is not used**, so Street View, Place Search, cloud widgets and
   the map-styling panel are not available. That is the price of not needing an API key.
2. **The Google tile endpoint is not a documented public API** and may be unstable inside mainland
   China. An automatic OpenStreetMap fallback is built in. For a fully compliant setup, switch to
   the Google Maps JS API with your own API key (you would need to rewrite the tile layer of the
   shim).
3. **A Photo Album app upgrade overwrites the patch** — re-apply it afterwards.
4. The `flyTo` animation path does not fire in headless/background tabs because
   `requestAnimationFrame` is throttled there. That is browser behaviour, not a patch bug
   (it works normally in a visible tab).
5. This patch touches the **front end only**; the album's backend and photo database are
   unaffected.

---

## Local test suite

```powershell
# Start the test server (PowerShell)
powershell -ExecutionPolicy Bypass -File test\serve.ps1 -Port 8765
# Open http://127.0.0.1:8765/index.html
```

`test/index.html` simulates the album's three map screens and drives the full `TMap` shim with
mock data, asserting **36** API behaviours.

---

## Repository layout

```
├── README.md                 中文說明（繁體中文）
├── README.en.md              English documentation
├── LICENSE
├── NOTICE
├── assets/                 ★ files to deploy to the NAS
│   ├── l1Zo7QHRsLu3cCA9.js   the shim (replaces the Tencent Maps module)
│   ├── leaflet.js            Leaflet 1.9.4
│   ├── leaflet.css
│   └── gmaps-config.js       tunable options
├── deploy/
│   ├── deploy.ps1            one-click deploy from Windows
│   └── deploy-on-nas.sh      install / rollback on the NAS
└── test/
    ├── index.html            shim test page (36 assertions)
    ├── serve.ps1             local static test server
    └── dsC_r5j-ZkVMT4Rx.js   thumbnail fallback stub for the tests
```

---

## Third-party components

| Component | License | Notes |
|---|---|---|
| [Leaflet](https://leafletjs.com/) 1.9.4 | BSD-2-Clause | Map engine, bundled so there is no CDN dependency |

See [`NOTICE`](./NOTICE) for details.

## Disclaimer

This project is provided "as is" and has no affiliation with fnOS, Tencent Maps or Google.
Assess the risks and back up your data before using it. The author accepts no liability for any
data loss.
