# Bug Fix: electron-dev 模式下所有窗口 fallback 到源码导致无法正常显示

## 问题描述

在使用 `npm run start:dev`（即 `electron-dev` 模式）启动应用时：

- **主窗口**：启动后 30 秒超时，显示空白窗口，日志提示 `⚠ 主窗口初始化超时（30s），强制显示`
- **设置窗口**：点击设置按钮后窗口打开但内容空白，无法正常使用

正式版 App（`/Applications/Hanako.app`）不受影响，可以正常使用。

## 根本原因

**文件**：`desktop/main.cjs`

`createMainWindow()` 和 `createSettingsWindow()` 中存在相同的逻辑 Bug。原始代码：

```js
const isDev = process.argv.includes("--dev");
if (isDev && process.env.VITE_DEV_URL) {
    window.loadURL(...)                        // ① Vite dev server 模式
} else {
    if (!isDev && fs.existsSync(builtFile)) {  // ② 问题所在
        window.loadFile(builtFile)             // 构建产物
    } else {
        window.loadFile(src/xxx.html)          // ③ fallback 到源码
    }
}
```

**问题链路**：

1. `npm run start:dev` 通过 `scripts/launch.js` 传入 `electron-dev` 参数
2. `main.cjs` 解析到 `--dev` 参数，`isDev = true`
3. 没有 `VITE_DEV_URL` 环境变量，进入 else 分支
4. `!isDev` 为 `false`，条件永远不成立，**跳过构建产物**
5. 最终 fallback 加载 `desktop/src/index.html` / `desktop/src/settings.html`（TypeScript 源码）
6. 浏览器无法执行 `.tsx` 文件，前端初始化失败

**受影响窗口**：主窗口（`createMainWindow`）、设置窗口（`createSettingsWindow`）

## 修复方案

去掉 `isDev` 对是否加载构建产物的影响，改为**只用 `VITE_DEV_URL` 区分两种模式**：

- 有 `VITE_DEV_URL` → 连接 Vite HMR dev server（`npm run start:vite` 模式）
- 无 `VITE_DEV_URL` → 优先加载 `dist-renderer` 构建产物（`npm run start:dev` 模式）

```js
// 修复后（主窗口和设置窗口统一使用此逻辑）
if (process.env.VITE_DEV_URL) {
    window.loadURL(`${process.env.VITE_DEV_URL}/xxx.html`);
} else {
    const builtFile = path.join(__dirname, "dist-renderer", "xxx.html");
    if (fs.existsSync(builtFile)) {
        window.loadFile(builtFile);
    } else {
        window.loadFile(path.join(__dirname, "src", "xxx.html"));
    }
}
```

## 附：构建产物目录说明

Vite 构建输出目录是 `desktop/dist-renderer/`（不是 `desktop/dist/`），由 `vite.config.ts` 配置：

```ts
build: {
    outDir: '../dist-renderer',
}
```

`start:dev` 模式不会自动构建前端，首次启动或前端代码有改动时需要手动执行：

```bash
npm run build:renderer
```

## 启动方式

使用项目提供的一键重启脚本（自动检测是否需要构建）：

```bash
# 日常重启
./scripts/restart-dev.sh

# 前端有改动时
./scripts/restart-dev.sh --build
```

## 修复时间

2026-03-17
