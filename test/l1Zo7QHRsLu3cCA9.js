import{d as FALLBACK_THUMBNAIL}from"./dsC_r5j-ZkVMT4Rx.js";

/* =======================================================================
 * fnOS 相册 —— 地图底图由「腾讯地图」替换为「Google Maps」
 *
 * 本模块替换原来的 l1Zo7QHRsLu3cCA9.js（原版是腾讯地图 TMap 加载器）。
 *
 * 实现方式：不改动相册已压缩的 React 组件（主地图 / 编辑位置 / 预览小地图
 * 都直接调用 TMap.*），而是用 Leaflet + Google 栅格瓦片实现一个
 * 「TMap API 兼容层」，让 window.TMap 指向它。
 * 这样前端组件代码一行都不用改，升级相册时也只需重新套用同一个补丁。
 *
 * 坐标说明：
 *   fnOS 相册存的是照片 EXIF 里的原始 WGS-84 坐标，并没有做 GCJ-02 纠偏
 *   （飞牛官方论坛已确认，见 club.fnnas.com/archiver/?tid-48802.html）。
 *   所以在 Google Maps（WGS-84）上直接使用原始坐标即为真实位置。
 *   若你手上的相册库坐标已经是 GCJ-02，把配置里的 coordinateMode 改成
 *   "gcj02" 即可自动反算。
 * ===================================================================== */

/* ------------------------------------------------------------------
 * 一、配置（可用同目录 gmaps-config.js 覆盖，无需改本文件）
 * ---------------------------------------------------------------- */
const DEFAULTS = {
  /* 亮色底图：Google 道路地图栅格瓦片 */
  tileUrl: "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=zh-CN",
  /* 卫星底图备用 */
  satelliteTileUrl: "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=zh-CN",
  /* 瓦片加载失败时的降级底图 */
  fallbackTileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  subdomains: ["mt0", "mt1", "mt2", "mt3"],
  attribution: '&copy; <a href="https://www.google.com/maps" target="_blank" rel="noreferrer">Google</a>',
  maxZoom: 20,
  /* 深色模式：把亮色瓦片反相，得到暗色底图（只作用于瓦片层，不影响照片标记） */
  darkTileFilter: "invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.92)",
  /* "wgs84" = 原始 GPS 坐标直接使用；"gcj02" = 先把 GCJ-02 反算为 WGS-84 */
  coordinateMode: "wgs84",
  /* 聚合网格尺寸（像素），对应原版 gridSize: 100 */
  clusterGridSize: 100
};

let CONFIG = Object.assign({}, DEFAULTS);

function loadConfig() {
  try {
    const raw = window.__GMAPS_CONFIG__;
    if (raw && typeof raw === "object") Object.assign(CONFIG, raw);
  } catch (e) { /* ignore */ }
  return CONFIG;
}

/* ------------------------------------------------------------------
 * 二、GCJ-02 <-> WGS-84 坐标换算（eviltransform 经典算法）
 * ---------------------------------------------------------------- */
const GCJ_A = 6378245.0;
const GCJ_EE = 0.00669342162296594323;

function transformLat(x, y) {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  ret += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
  ret += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
  return ret;
}

function transformLng(x, y) {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  ret += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
  ret += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
  return ret;
}

/** 判断是否在中国境外（境外无需做 GCJ 偏移） */
function outOfChina(lat, lng) {
  return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
}

/** GCJ-02 -> WGS-84（迭代逼近，误差厘米级） */
function gcj02ToWgs84(lat, lng) {
  if (outOfChina(lat, lng)) return { lat: lat, lng: lng };
  let dLat = 0.00669342162296594323 * 0, dLng = 0, mLat = lat, mLng = lng;
  let wLat = lat, wLng = lng;
  for (let i = 0; i < 30; i++) {
    const d = gcjDelta(mLat, mLng);
    dLat = d.lat; dLng = d.lng;
    wLat = lat - dLat; wLng = lng - dLng;
    const d2 = gcjDelta(wLat, wLng);
    if (Math.abs(d2.lat - dLat) < 1e-7 && Math.abs(d2.lng - dLng) < 1e-7) break;
    mLat = wLat; mLng = wLng;
  }
  return { lat: wLat, lng: wLng };
}

function gcjDelta(lat, lng) {
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((GCJ_A * (1 - (GCJ_A * GCJ_A * magic) / (magic * sqrtMagic)) * Math.PI));
  dLng = (dLng * 180.0) / (GCJ_A / sqrtMagic * Math.cos(radLat) * Math.PI);
  return { lat: dLat, lng: dLng };
}

/**
 * 把相册内部使用的坐标换算成 Google Maps 使用的坐标。
 * 入参/出参均为 { lat, lng }
 */
function toGoogleLatLng(lat, lng) {
  if (CONFIG.coordinateMode !== "gcj02") return { lat: lat, lng: lng };
  const r = gcj02ToWgs84(lat, lng);
  return { lat: r.lat, lng: r.lng };
}

/* ------------------------------------------------------------------
 * 三、加载 Leaflet（本地随包分发，不依赖 CDN）
 * ---------------------------------------------------------------- */
const ASSET_BASE = (() => {
  try { return new URL(".", import.meta.url).href; }
  catch (e) { return "/p/assets/"; }
})();

let leafletPromise = null;

function injectStylesheet(href) {
  return new Promise((resolve, reject) => {
    if (document.querySelector('link[data-gmaps-leaflet-css]')) return resolve();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-gmaps-leaflet-css", "1");
    link.onload = () => resolve();
    link.onerror = () => reject(Error("Leaflet 样式加载失败: " + href));
    document.head.appendChild(link);
  });
}

function injectScript(src) {
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    const s = document.createElement("script");
    s.type = "text/javascript";
    s.async = true;
    s.src = src;
    s.onload = () => resolve(window.L);
    s.onerror = () => reject(Error("Leaflet 脚本加载失败: " + src));
    document.head.appendChild(s);
  });
}

/** 注入本补丁需要的额外样式（深色瓦片滤镜等） */
function injectPatchStyles() {
  if (document.getElementById("gmaps-patch-style")) return;
  const style = document.createElement("style");
  style.id = "gmaps-patch-style";
  style.textContent = [
    "/* 深色底图：只对瓦片层反相，照片标记不受影响 */",
    ".gmaps-dark-style .leaflet-tile-pane{filter:" + CONFIG.darkTileFilter + ";}",
    "/* 相册原有 .photo-cluster 是 64x64，用 border-box 与原视觉保持一致 */",
    ".gmaps-photo-marker{box-sizing:border-box;}",
    ".gmaps-photo-marker .photo-cluster{box-sizing:border-box;}",
    /* 标记底图不吃点击，避免遮挡相册自身的交互层 */
    ".gmaps-photo-marker{background:transparent;border:0;}"
  ].join("\n");
  document.head.appendChild(style);
}

function loadLeaflet() {
  if (leafletPromise) return leafletPromise;
  leafletPromise = (async () => {
    await injectStylesheet(ASSET_BASE + "leaflet.css");
    await injectScript(ASSET_BASE + "leaflet.js");
    if (!window.L) throw Error("Leaflet 未正确加载");
    return window.L;
  })();
  return leafletPromise;
}

/* ------------------------------------------------------------------
 * 四、TMap 兼容层
 * ---------------------------------------------------------------- */
class LatLng {
  constructor(lat, lng) {
    this.lat = Number(lat);
    this.lng = Number(lng);
  }
  getLat() { return this.lat; }
  getLng() { return this.lng; }
  toString() { return this.lat + "," + this.lng; }
}

class LatLngBounds {
  constructor(a, b) {
    const lat1 = Number(a.getLat()), lng1 = Number(a.getLng());
    const lat2 = Number(b.getLat()), lng2 = Number(b.getLng());
    this.minLat = Math.min(lat1, lat2);
    this.maxLat = Math.max(lat1, lat2);
    this.minLng = Math.min(lng1, lng2);
    this.maxLng = Math.max(lng1, lng2);
  }
  getNorthEast() { return new LatLng(this.maxLat, this.maxLng); }
  getSouthWest() { return new LatLng(this.minLat, this.minLng); }
}

/** 极简事件发射器，替代 TMap 的 Evented */
class Emitter {
  constructor() { this._events = {}; }
  on(type, fn) {
    if (!this._events[type]) this._events[type] = [];
    this._events[type].push(fn);
    return this;
  }
  off(type, fn) {
    const list = this._events[type];
    if (!list) return this;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
    return this;
  }
  emit(type, payload) {
    const list = this._events[type];
    if (!list) return this;
    for (const fn of list.slice()) {
      try { fn(payload); } catch (e) { console.error("[gmaps] 事件处理异常", e); }
    }
    return this;
  }
  removeAllListeners() { this._events = {}; return this; }
}

class TMapMap extends Emitter {
  constructor(container, options) {
    super();
    options = options || {};
    this.options = options;
    this._container = typeof container === "string" ? document.getElementById(container) : container;
    if (!this._container) throw Error("地图容器不存在: " + container);

    const L = window.L;
    const center = options.center instanceof LatLng
      ? options.center
      : (options.center ? new LatLng(options.center.lat, options.center.lng) : null);

    const leafletOpts = {
      zoomControl: false,
      attributionControl: true,
      zoomSnap: 0.25,
      zoomDelta: 1,
      wheelPxPerZoomLevel: 120,
      maxZoom: CONFIG.maxZoom,
      minZoom: options.minZoom != null ? options.minZoom : 1,
      zoom: options.zoom != null ? options.zoom : 3,
      worldCopyJump: false,
      preferCanvas: false
    };
    if (center) leafletOpts.center = [center.getLat(), center.getLng()];
    if (options.draggable === false) leafletOpts.dragging = false;
    if (options.scrollable === false) leafletOpts.scrollWheelZoom = false;
    if (options.touchZoomable === false) leafletOpts.touchZoom = false;
    if (options.doubleClickZoom === false) leafletOpts.doubleClickZoom = false;
    if (options.keyboard === false) leafletOpts.keyboard = false;
    if (options.boundary instanceof LatLngBounds) {
      leafletOpts.maxBounds = [
        [options.boundary.minLat, options.boundary.minLng],
        [options.boundary.maxLat, options.boundary.maxLng]
      ];
    }
    /* 相册主地图创建时不传 center/zoom（稍后用 easeTo 定位），
       但 Leaflet 必须先有视图才能做像素坐标换算，这里兜一个初始视图 */
    if (!leafletOpts.center) leafletOpts.center = [0, 0];
    if (leafletOpts.zoom == null) leafletOpts.zoom = 3;

    this._map = L.map(this._container, leafletOpts);
    this._leaflet = this._map;
    this._styleId = options.mapStyleId || "style1";
    this._tileLayer = null;
    this._destroyed = false;

    this._setupTileLayer();
    this._bindEvents();

    // 容器尺寸变化时重算（相册在不同面板/全屏之间切换）
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => {
        if (!this._destroyed) this._map.invalidateSize();
      });
      this._ro.observe(this._container);
    }
  }

  _setupTileLayer() {
    const L = window.L;
    const url = this._styleId === "style2" ? CONFIG.tileUrl : CONFIG.tileUrl;
    this._tileLayer = L.tileLayer(url, {
      subdomains: CONFIG.subdomains,
      maxZoom: CONFIG.maxZoom + 1,
      attribution: CONFIG.attribution,
      crossOrigin: true,
      keepBuffer: 2
    });
    this._tileLayer.addTo(this._map);
    this._applyStyle(this._styleId);

    // 瓦片连续失败时降级到备用底图，避免整片空白
    let errorCount = 0;
    let switched = false;
    this._tileLayer.on("tileerror", () => {
      errorCount++;
      if (!switched && errorCount >= 8 && CONFIG.fallbackTileUrl) {
        switched = true;
        console.warn("[gmaps] Google 瓦片加载失败，降级到备用底图");
        this._tileLayer.setUrl(CONFIG.fallbackTileUrl);
      }
    });
  }

  _applyStyle(styleId) {
    this._styleId = styleId;
    const dark = styleId === "style2";
    if (this._container && this._container.classList) {
      this._container.classList.toggle("gmaps-dark-style", dark);
    }
  }

  _bindEvents() {
    const L = window.L;
    this._map.on("click", (e) => {
      this.emit("click", { latLng: new LatLng(e.latlng.lat, e.latlng.lng) });
    });
    this._map.on("dragend", () => this.emit("dragend", {}));
    this._map.on("moveend", () => this.emit("bounds_changed", {}));
    this._map.on("zoomend", () => this.emit("bounds_changed", {}));
    this._onTouch = (ev) => this.emit("touchmove", ev);
    if (this._container && this._container.addEventListener) {
      this._container.addEventListener("touchmove", this._onTouch, { passive: true });
    }
  }

  /* ---------- TMap API ---------- */
  getContainer() { return this._container; }

  getBounds() {
    const b = this._map.getBounds();
    return new LatLngBounds(
      new LatLng(b.getSouthWest().lat, b.getSouthWest().lng),
      new LatLng(b.getNorthEast().lat, b.getNorthEast().lng)
    );
  }

  getCenter() {
    const c = this._map.getCenter();
    return new LatLng(c.lat, c.lng);
  }

  getZoom() { return this._map.getZoom(); }

  setZoom(z) {
    /* TMap 的 setZoom 是立即生效的；显式关掉动画，保证行为一致 */
    this._map.setView(this._map.getCenter(), z, { animate: false });
    return this;
  }

  setCenter(latlng) {
    const p = latlng instanceof LatLng ? latlng : new LatLng(latlng.lat, latlng.lng);
    this._map.setView([p.getLat(), p.getLng()], this._map.getZoom(), { animate: false });
    return this;
  }

  zoomTo(z, opts) {
    this._map.setZoom(z, { animate: !!(opts && opts.duration) });
    return this;
  }

  easeTo(opts, animOpts) {
    const c = opts && opts.center;
    const center = c instanceof LatLng ? c : (c ? new LatLng(c.lat, c.lng) : null);
    const zoom = opts && opts.zoom != null ? opts.zoom : this._map.getZoom();
    const duration = animOpts && animOpts.duration ? animOpts.duration : 0;
    if (!center) return this;
    const target = [center.getLat(), center.getLng()];
    if (duration > 0) {
      /* 相册用 duration>0 表示平滑移动（点搜索结果时），Leaflet 用 flyTo 实现 */
      this._map.flyTo(target, zoom, { duration: duration / 1000 });
    } else {
      /* 相册用 duration:0 表示立即跳转 */
      this._map.setView(target, zoom, { animate: false });
    }
    return this;
  }

  setMapStyleId(styleId) { this._applyStyle(styleId); return this; }
  getMapStyleId() { return this._styleId; }

  /** 原版 TMap 的控件体系在 Leaflet 下不适用，统一返回 null 让相册使用自绘控件 */
  getControl() { return null; }
  removeControl() { return this; }

  /** 把经纬度换算到容器像素坐标 */
  projectToContainer(position) {
    const p = position instanceof LatLng ? position : new LatLng(position.lat, position.lng);
    const pt = this._map.latLngToContainerPoint([p.getLat(), p.getLng()]);
    return {
      getX: function () { return pt.x; },
      getY: function () { return pt.y; }
    };
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._ro) { try { this._ro.disconnect(); } catch (e) {} this._ro = null; }
    if (this._container && this._onTouch && this._container.removeEventListener) {
      this._container.removeEventListener("touchmove", this._onTouch);
    }
    try { this._map.remove(); } catch (e) { console.error("[gmaps] 地图销毁异常", e); }
    this.removeAllListeners();
  }
}

/**
 * TMap.MarkerCluster 兼容实现。
 *
 * 原版相册把后端返回的「聚合点」交给 TMap.MarkerCluster 二次聚合，
 * 再通过 getClusters() 取出 [{ id, center, geometries }]，
 * 由相册自己渲染 .photo-cluster 标记。
 */
class MarkerCluster extends Emitter {
  constructor(options) {
    super();
    options = options || {};
    this.options = options;
    this._map = options.map;
    this._geometries = [];
    this._clusters = [];
    this._gridSize = options.gridSize || CONFIG.clusterGridSize;
    this._destroyed = false;

    const self = this;
    const onMove = function () { self._recluster(); };
    if (this._map && this._map._leaflet) {
      this._map._leaflet.on("moveend", onMove);
      this._map._leaflet.on("zoomend", onMove);
      this._offMove = onMove;
    }
  }

  add(geometries) {
    const list = Array.isArray(geometries) ? geometries : [geometries];
    for (const g of list) {
      if (g) this._geometries.push(g);
    }
    this._recluster();
    return this;
  }

  getGeometries() { return this._geometries; }

  getClusters() { return this._clusters; }

  clear() {
    this._geometries = [];
    this._clusters = [];
    this.emit("cluster_changed", {});
    return this;
  }

  _recluster() {
    if (this._destroyed) return;
    const leaf = this._map && this._map._leaflet;
    if (!leaf) return;
    const gs = this._gridSize;
    const buckets = new Map();
    let projectFailed = false;
    for (const g of this._geometries) {
      const pos = g.position;
      if (!pos) continue;
      const lat = typeof pos.getLat === "function" ? pos.getLat() : pos.lat;
      const lng = typeof pos.getLng === "function" ? pos.getLng() : pos.lng;
      let key;
      try {
        const pt = leaf.latLngToContainerPoint([lat, lng]);
        key = Math.floor(pt.x / gs) + ":" + Math.floor(pt.y / gs);
      } catch (err) {
        /* 地图视图尚未就绪时降级为逐点聚合 */
        projectFailed = true;
        key = "g:" + (lat + "," + lng);
      }
      let bucket = buckets.get(key);
      if (!bucket) { bucket = []; buckets.set(key, bucket); }
      bucket.push(g);
    }
    if (projectFailed) { /* 已用逐点 key 降级，无需调整网格尺寸 */ }
    const clusters = [];
    buckets.forEach(function (arr) {
      if (!arr.length) return;
      const first = arr[0];
      clusters.push({
        id: arr.length > 1 ? arr.map(function (x) { return x.id; }).join("|") : first.id,
        center: first.position,
        geometries: arr,
        count: arr.length
      });
    });
    this._clusters = clusters;
    this.emit("cluster_changed", {});
  }

  destroy() {
    this._destroyed = true;
    if (this._offMove && this._map && this._map._leaflet) {
      this._map._leaflet.off("moveend", this._offMove);
      this._map._leaflet.off("zoomend", this._offMove);
    }
    this.removeAllListeners();
  }
}

/** 占位：原版 PhotoDomOverlay 会继承 TMap.DOMOverlay，这里保留同名空实现 */
class DOMOverlay extends Emitter {
  constructor(options) {
    super();
    this.options = options || {};
    this.map = this.options.map;
    this.content = this.options.content;
    this.position = this.options.position;
    this.dom = null;
  }
  destroy() { this.removeAllListeners(); }
}

/* TMap 命名空间 */
const TMap = {
  Map: TMapMap,
  LatLng: LatLng,
  LatLngBounds: LatLngBounds,
  MarkerCluster: MarkerCluster,
  DOMOverlay: DOMOverlay,
  constants: {
    DEFAULT_CONTROL_ID: {
      ZOOM: "zoom",
      ROTATION: "rotation",
      SCALE: "scale",
      POSITION: "position"
    },
    CONTROL_POSITION: {
      BOTTOM_LEFT: "BOTTOM_LEFT",
      BOTTOM_RIGHT: "BOTTOM_RIGHT",
      TOP_LEFT: "TOP_LEFT",
      TOP_RIGHT: "TOP_RIGHT",
      LEFT: "LEFT",
      RIGHT: "RIGHT"
    }
  }
};

/* ------------------------------------------------------------------
 * 五、PhotoDomOverlay —— 相册的照片标记（原版继承 TMap.DOMOverlay）
 * ---------------------------------------------------------------- */
class PhotoDomOverlay extends Emitter {
  constructor(options) {
    super();
    options = options || {};
    this.map = options.map;
    this.position = options.position;
    this.content = options.content || {};
    this.dom = null;
    this._marker = null;
    this._destroyed = false;

    const L = window.L;
    const p = this.position;
    const lat = p && typeof p.getLat === "function" ? p.getLat() : (p ? p.lat : 0);
    const lng = p && typeof p.getLng === "function" ? p.getLng() : (p ? p.lng : 0);

    const marker = L.marker([lat, lng], {
      icon: L.divIcon({
        html: "",
        className: "gmaps-photo-marker",
        iconSize: [64, 64],
        iconAnchor: [32, 32]
      }),
      interactive: true,
      keyboard: false,
      riseOnHover: false,
      zIndexOffset: 0
    });
    this._marker = marker;

    if (this.map && this.map._leaflet) {
      this.map._leaflet.addLayer(marker);
    }

    /* 把相册原本的标记 DOM 放进 Leaflet 的图标容器 */
    this.dom = this._buildDOM();
    const el = marker.getElement();
    if (el) {
      el.appendChild(this.dom);
    }
    this._bindDom();
  }

  _buildDOM() {
    const div = document.createElement("div");
    div.classList.add("photo-cluster");
    if (this.content.disabledClick) div.classList.add("disabled-click");

    const img = document.createElement("img");
    img.draggable = false;
    img.classList.add("photo");
    img.onerror = function (ev) { ev.target.src = FALLBACK_THUMBNAIL; };
    img.src = this.content.url;
    div.appendChild(img);

    if (this.content.count > 1) {
      const count = document.createElement("div");
      count.classList.add("photo-count");
      count.textContent = this.content.count.toString();
      div.appendChild(count);
    }
    return div;
  }

  _bindDom() {
    const self = this;
    this.onClick = function () { self.emit("click"); };
    this.onTouchend = function () { self.emit("click"); };
    if (!this.dom) return;
    this.dom.addEventListener("click", this.onClick);
    this.dom.addEventListener("touchend", this.onTouchend);
  }

  updateCount() {
    if (!this.dom) return;
    const el = this.dom.querySelector(".photo-count");
    if (el) el.textContent = this.content.count.toString();
  }

  updateURL(url) {
    if (url && this.content.url && this.content.url !== url) {
      this.content.url = url;
      if (this.dom) {
        const img = this.dom.querySelector(".photo");
        if (img) img.src = url;
      }
    }
  }

  updateDOM() {
    // Leaflet 自行管理标记位置，这里只需同步一次计数
    this.updateCount();
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this.dom) {
      this.dom.removeEventListener("click", this.onClick);
      this.dom.removeEventListener("touchend", this.onTouchend);
    }
    if (this._marker) {
      try {
        if (this.map && this.map._leaflet) this.map._leaflet.removeLayer(this._marker);
        else if (this._marker.remove) this._marker.remove();
      } catch (e) { /* ignore */ }
      this._marker = null;
    }
    this.removeAllListeners();
  }
}

/* ------------------------------------------------------------------
 * 六、加载器 / 安装器（与原版导出语义保持一致）
 * ---------------------------------------------------------------- */
/* ------------------------------------------------------------------
 * 补丁版本标记：浏览器控制台执行  __FNOS_GMAPS_PATCH__  可确认当前跑的是补丁版
 * ------------------------------------------------------------------ */
window.__FNOS_GMAPS_PATCH__ = "google-maps-v1";

const n = () => new Promise((resolve, reject) => {
  if (window.TMap && window.TMap.__gmapsReady) { resolve(window.TMap); return; }
  loadLeaflet().then(function () {
    loadConfig();
    injectPatchStyles();
    TMap.__gmapsReady = true;
    window.TMap = TMap;
    resolve(TMap);
  }).catch(function (err) {
    console.error("[gmaps] 地图底图加载失败", err);
    reject(Error("Google 地图脚本加载失败"));
  });
});

function r() {
  if (window.PhotoDomOverlay) return;
  window.PhotoDomOverlay = PhotoDomOverlay;
}

/* ------------------------------------------------------------------
 * 七、原版辅助函数（逐字保留，保证相册逻辑行为不变）
 * ---------------------------------------------------------------- */
function i(e, t, n) {
  if (Math.max(e, t, n) - Math.min(e, t, n) > 180) return !0;
  let r = [e, t, n].some(function (x) { return x > 90; });
  let i2 = [e, t, n].some(function (x) { return x < -90; });
  return r && i2;
}
function a(e) { return `${e.lng},${e.lat}`; }
function o(e) { return e.split(",").map(Number); }

var s = function (e, t) {
  if (!e) return { isOK: !1, error: t("map.validation.emptyGps") };
  if (!/^[-\d.,]+$/.test(e)) return { isOK: !1, error: t("map.validation.onlyNumbersAndComma") };
  let n = e.split(",");
  if (n.length !== 2) return { isOK: !1, error: t("map.validation.formatError") };
  if (n[0].trim() === `` || n[1].trim() === ``) return { isOK: !1, error: t("map.validation.invalidNumber") };
  let r = n.map(Number);
  if (isNaN(r[0]) || isNaN(r[1])) return { isOK: !1, error: t("map.validation.invalidNumber") };
  if (r[0] < -180 || r[0] > 180) return { isOK: !1, error: t("map.validation.longitudeRange") };
  if (r[1] < -90 || r[1] > 90) return { isOK: !1, error: t("map.validation.latitudeRange") };
  return { isOK: !0 };
};

var c = function (e) {
  if (!(e != null && e.length) || e.length === 1) return e;
  return [...e].sort(function (e, t) {
    let n = e.properties.dateTime.replace(/(\d{4}):(\d{2}):(\d{2})/, `$1-$2-$3`);
    let r = t.properties.dateTime.replace(/(\d{4}):(\d{2}):(\d{2})/, `$1-$2-$3`);
    let i2 = new Date(n).getTime();
    let a2 = new Date(r).getTime();
    if (i2 === a2) {
      let n2 = e.properties.id || 0;
      return (t.properties.id || 0) - n2;
    }
    return a2 - i2;
  });
};

var l = function (e, t) {
  if (!e) return e;
  let n = e.split(",");
  if (n.length !== 2) return e;
  let r = n.map(Number);
  if (r[0] >= -180 && r[0] <= 180 && r[1] >= -90 && r[1] <= 90 && s(e, t).isOK) return e;
  if (r[0] >= -90 && r[0] <= 90 && r[1] >= -180 && r[1] <= 180) {
    let e2 = `${r[1]},${r[0]}`;
    if (s(e2, t).isOK) return e2;
  }
  return e;
};

var u = "TIMELINE_STATE";
var d = function (e) {
  let t = sessionStorage.getItem(u + e);
  return t ? JSON.parse(t) : null;
};
var f = function (e, t) {
  sessionStorage.setItem(u + e, JSON.stringify(t));
};

/* ------------------------------------------------------------------
 * 八、导出（与原版模块导出名完全一致，三个调用方无需改动）
 * ---------------------------------------------------------------- */
export {
  i as a,
  f as c,
  d as i,
  c as l,
  r as n,
  n as o,
  a as r,
  o as s,
  l as t,
  s as u,
  d as d
};
