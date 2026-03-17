# 本地开发启动指南

## 快速启动

**推荐：使用一键重启脚本**（自动清理残留进程 + 按需构建前端）：

```bash
# 日常启动（前端无改动）
./scripts/restart-dev.sh

# 前端有改动时，加 --build 重新构建
./scripts/restart-dev.sh --build
```

脚本会自动完成：清理残留 Electron/Server 进程 → 删除 `server-info.json` → 检测是否需要构建前端 → 启动。

---

**手动启动（了解原理时使用）：**

```bash
# 1. 清理残留进程
pkill -9 -f "myhanako/node_modules/electron" 2>/dev/null; pkill -9 -f "boot.cjs" 2>/dev/null
rm -f ~/.hanako/server-info.json

# 2. 首次或前端有变更时构建（构建产物在 desktop/dist-renderer/）
npm run build:renderer

# 3. 启动
HANA_HOME=~/.hanako npm run start:dev
```

> **注意**：`start:dev` 不会自动构建前端。构建产物目录是 `desktop/dist-renderer/`（不是 `dist/`）。如果该目录不存在，Electron 会 fallback 加载无法运行的 `src/index.html` 源码，30 秒后超时显示空白窗口（日志：`主窗口初始化超时（30s），强制显示`）。

---

## 背景说明

### 数据目录隔离

项目有两套数据目录：

| 目录 | 用途 |
|------|------|
| `~/.hanako` | 生产数据目录，正式版 App（`/Applications/Hanako.app`）使用 |
| `~/.hanako-dev` | 开发数据目录，`npm run start:dev` 默认使用 |

`scripts/launch.js` 默认将 `HANA_HOME` 设为 `~/.hanako-dev`，因此不指定 `HANA_HOME` 时会读取开发目录（全新空目录），触发 Onboarding 向导。

通过 `HANA_HOME=~/.hanako` 显式指定后，`launch.js` 会跳过覆盖，直接使用你已配置好的生产数据。

### Onboarding 触发条件

`desktop/main.cjs` 中的判断逻辑：

```
isSetupComplete()     → 读 ~/.hanako/user/preferences.json 的 setupComplete 字段
  true  → 直接打开主窗口（正常）
  false → hasExistingConfig() → 有 api_key → 跳到教程页
                              → 无 api_key → 完整 Onboarding 向导
```

---

## 注意事项

### 启动前确认没有残留进程

如果之前用过正式版 App 或开发版，Server 进程可能仍在后台运行。新启动会复用旧 Server（包括旧 Server 的 `HANA_HOME`），导致数据目录不符合预期。

启动前可以检查：

```bash
ps aux | grep "boot.cjs" | grep -v grep | cat
```

如果有残留进程，清理方式：

```bash
# 杀掉所有 Hanako 相关进程
pkill -9 -f "Hanako.app"
pkill -9 -f "boot.cjs"

# 删除 server-info.json（避免复用检测误判）
rm -f ~/.hanako/server-info.json ~/.hanako-dev/server-info.json
```

### 正式版 App 与开发版不能同时运行

正式版 `/Applications/Hanako.app` 和开发版共用同一个 `server-info.json`（位于 `HANA_HOME` 下），启动时会互相复用对方的 Server。开发前请先完全退出正式版 App（从菜单栏托盘选择"退出"，而非直接关窗口）。

---

## 所有启动命令

| 命令 | 说明 |
|------|------|
| `HANA_HOME=~/.hanako npm run start:dev` | **推荐**：开发模式 + 真实配置数据 |
| `npm run start:dev` | 开发模式 + 隔离的开发数据（`~/.hanako-dev`） |
| `npm run start:vite` | 开发模式 + Vite HMR 热更新（需同时运行 `npm run dev:renderer`） |
| `npm start` | 生产模式（先构建前端再启动） |
| `npm run server` | 仅启动 Server，无 Electron GUI |
| `npm run cli` | 纯命令行对话模式 |

---

## 首次在新环境启动

如果是全新克隆的仓库，需要先安装依赖：

```bash
npm install
```

> 安装过程会自动触发 `postinstall` 脚本编译 `better-sqlite3` native 模块，耗时约 3-5 分钟，请耐心等待。
