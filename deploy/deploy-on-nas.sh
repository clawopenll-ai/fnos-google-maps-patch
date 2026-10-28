#!/bin/bash
# =====================================================================
# fnOS 相册 —— Google Maps 底图补丁安装 / 回滚脚本（在 NAS 上执行）
#
#   ./deploy-on-nas.sh install   安装补丁（默认）
#   ./deploy-on-nas.sh rollback  回滚到原始腾讯地图
#   ./deploy-on-nas.sh status    查看当前状态
#
# 补丁包需要放在同一个目录下（默认为脚本所在目录），包含：
#   l1Zo7QHRsLu3cCA9.js   替换原腾讯地图加载器（相容层）
#   leaflet.js            Leaflet 1.9.4
#   leaflet.css           Leaflet 样式
#   gmaps-config.js       可选配置（瓦片源、坐标系等）
# =====================================================================
set -u

ACTION="${1:-install}"
PKG_DIR="${2:-$(cd "$(dirname "$0")" && pwd)}"
TARGET="l1Zo7QHRsLu3cCA9.js"
BACKUP_SUFFIX=".orig-bak"

echo "=== fnOS 相册 Google Maps 补丁 ==="
echo "动作: $ACTION    补丁包: $PKG_DIR"

if [ "$(id -u)" != "0" ]; then
  echo "!! 需要 root 权限，请用 sudo 执行"
  exit 5
fi

# ---------- 1. 定位相册前端 assets 目录 ----------
ASSETS_DIR=""
echo "--- 定位包含 $TARGET 的目录 ---"
for cand in \
  /usr/local/apps/@appcenter/trim.photos/static/assets \
  /var/apps/trim.photos/target/static/assets ; do
  if [ -f "$cand/$TARGET" ]; then ASSETS_DIR="$cand"; break; fi
done

# 兜底：全盘搜索
if [ -z "$ASSETS_DIR" ]; then
  FOUND=$(find / -type f -name "$TARGET" -not -path "/proc/*" -not -path "/sys/*" 2>/dev/null | head -1)
  [ -n "$FOUND" ] && ASSETS_DIR="$(dirname "$FOUND")"
fi

if [ -z "$ASSETS_DIR" ]; then
  echo "!! 找不到包含 $TARGET 的目录"
  echo "   请确认相册已安装，且补丁对应的相册版本与本补丁匹配"
  exit 2
fi
echo "目标目录: $ASSETS_DIR"

BACKUP="$ASSETS_DIR/$TARGET$BACKUP_SUFFIX"

# ---------- 2. status ----------
if [ "$ACTION" = "status" ]; then
  if [ -f "$BACKUP" ]; then
    echo "已安装补丁，原始文件备份于: $BACKUP"
    ls -l "$ASSETS_DIR/$TARGET" "$BACKUP"
  else
    echo "未检测到补丁（未找到备份 $BACKUP）"
  fi
  exit 0
fi

# ---------- 3. rollback ----------
if [ "$ACTION" = "rollback" ]; then
  if [ ! -f "$BACKUP" ]; then
    echo "!! 没有找到备份文件 $BACKUP，无法回滚"
    exit 3
  fi
  cp -p "$BACKUP" "$ASSETS_DIR/$TARGET"
  rm -f "$ASSETS_DIR/leaflet.js" "$ASSETS_DIR/leaflet.css" "$ASSETS_DIR/gmaps-config.js"
  echo "已回滚到原始腾讯地图版本。"
  echo "请在浏览器中强制刷新（Ctrl+Shift+R）后确认。"
  exit 0
fi

# ---------- 4. install ----------
if [ "$ACTION" != "install" ]; then
  echo "未知动作: $ACTION（可用: install / rollback / status）"
  exit 1
fi

if [ ! -f "$PKG_DIR/$TARGET" ]; then
  echo "!! 补丁包缺少 $TARGET（请检查 $PKG_DIR）"
  exit 4
fi

# 备份原始文件（只备份一次，避免把补丁版当备份）
if [ ! -f "$BACKUP" ]; then
  cp -p "$ASSETS_DIR/$TARGET" "$BACKUP"
  echo "已备份原始文件 -> $BACKUP"
else
  echo "已存在备份，沿用: $BACKUP"
fi

# 写入补丁文件
cp -f "$PKG_DIR/$TARGET"           "$ASSETS_DIR/$TARGET"
cp -f "$PKG_DIR/leaflet.js"        "$ASSETS_DIR/leaflet.js"
cp -f "$PKG_DIR/leaflet.css"       "$ASSETS_DIR/leaflet.css"
if [ -f "$PKG_DIR/gmaps-config.js" ]; then
  cp -f "$PKG_DIR/gmaps-config.js" "$ASSETS_DIR/gmaps-config.js"
fi

# 保持与原文件一致的所有者与权限
chown --reference="$BACKUP" "$ASSETS_DIR/$TARGET" "$ASSETS_DIR/leaflet.js" "$ASSETS_DIR/leaflet.css" 2>/dev/null
chmod --reference="$BACKUP" "$ASSETS_DIR/$TARGET" "$ASSETS_DIR/leaflet.js" "$ASSETS_DIR/leaflet.css" 2>/dev/null

echo "--- 安装完成 ---"
ls -l "$ASSETS_DIR/$TARGET" "$ASSETS_DIR/leaflet.js" "$ASSETS_DIR/leaflet.css" "$ASSETS_DIR/gmaps-config.js" 2>/dev/null

echo ""
echo "验证方法："
echo "  1) 浏览器打开 http://<NAS_IP>:<相片app端口>/photo/map"
echo "     （默认端口 5666，可用 http://<NAS_IP>:5666/p/map ）"
echo "  2) 按 Ctrl+Shift+R 强制刷新（清除旧缓存）"
echo "  3) 控制台执行 __FNOS_GMAPS_PATCH__  应输出 google-maps-v1"
echo "回滚方法： $0 rollback"
