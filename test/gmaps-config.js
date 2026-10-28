/* =====================================================================
 * fnOS 相册 —— Google Maps 底图配置
 *
 * 本文件由 l1Zo7QHRsLu3cCA9.js 自动加载（可选，缺失则使用内置默认值）。
 * 修改后刷新浏览器即可生效，无需重新部署。
 * ===================================================================== */
window.__GMAPS_CONFIG__ = {

  /* ---- 亮色底图：Google 道路地图 ---- */
  tileUrl: "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=zh-CN",

  /* ---- 卫星底图（备用，可通过卫星TileUrl切换） ---- */
  satelliteTileUrl: "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=zh-CN",

  /* ---- Google 瓦片加载失败时的降级底图（留空则不降级，地图会空白） ---- */
  fallbackTileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",

  /* ---- 瓦片服务器池 ---- */
  subdomains: ["mt0", "mt1", "mt2", "mt3"],

  /* ---- 版权署名 ---- */
  attribution: '&copy; <a href="https://www.google.com/maps" target="_blank" rel="noreferrer">Google</a>',

  /* ---- 最大缩放层级 ---- */
  maxZoom: 20,

  /* ---- 深色模式滤镜（只作用于瓦片层，不影响照片标记） ---- */
  darkTileFilter: "invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.92)",

  /* ------------------------------------------------------------------
   * 坐标系：
   *   "wgs84" —— 直接使用相册里的原始 GPS 坐标（飞牛相册存的就是 WGS-84，
   *              没有做 GCJ-02 纠偏，所以这才是真实位置）
   *   "gcj02" —— 假如你的照片库坐标已经被转换成 GCJ-02，改成这个值，
   *              补丁会自动反算回 WGS-84
   * ------------------------------------------------------------------ */
  coordinateMode: "wgs84",

  /* ---- 聚合网格尺寸（像素） ---- */
  clusterGridSize: 100
};
