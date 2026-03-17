#!/bin/zsh
# 彻底清理所有 Hanako 相关进程并重新启动开发环境
# 用法：
# 日常重启（前端无改动）
# ./scripts/restart-dev.sh
# 前端有改动时重新构建
# ./scripts/restart-dev.sh --build
#   --build  重新构建前端后再启动（首次或前端有改动时使用）

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HANA_HOME="${HANA_HOME:-$HOME/.hanako}"

echo "🧹 清理残留进程..."
pkill -9 -f "$PROJECT_DIR/node_modules/electron" 2>/dev/null || true
pkill -9 -f "boot.cjs" 2>/dev/null || true
pkill -9 -f "Hanako.app/Contents/MacOS/Hanako" 2>/dev/null || true
sleep 1

echo "🗑  清理 server-info.json..."
rm -f "$HANA_HOME/server-info.json"
rm -f "$HOME/.hanako-dev/server-info.json"

# 检查 dist-renderer 是否存在
DIST_RENDERER="$PROJECT_DIR/desktop/dist-renderer"
NEED_BUILD=false

if [[ "$1" == "--build" ]]; then
  NEED_BUILD=true
elif [[ ! -f "$DIST_RENDERER/index.html" ]]; then
  echo "⚠️  未找到 desktop/dist-renderer/index.html，需要先构建前端"
  NEED_BUILD=true
fi

if [[ "$NEED_BUILD" == "true" ]]; then
  echo "🔨 构建前端（npm run build:renderer）..."
  cd "$PROJECT_DIR"
  npm run build:renderer
  echo "✅ 前端构建完成"
fi

echo "🚀 启动 Hanako 开发环境（HANA_HOME=$HANA_HOME）..."
cd "$PROJECT_DIR"
HANA_HOME="$HANA_HOME" npm run start:dev
