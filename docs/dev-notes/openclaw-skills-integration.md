# OpenClaw Skills 集成支持

> **日期**：2025-03-17  
> **涉及文件**：`core/skill-manager.js`  
> **类型**：功能增强

---

## 背景

Hanako 的 Skill 体系（`SKILL.md` + YAML frontmatter）与 OpenClaw 的 AgentSkills 格式完全兼容。OpenClaw 社区拥有 700+ Skills，覆盖代码辅助、写作、数据分析等场景。本次改造让 Hanako 能够直接加载安装在 `~/.openclaw/skills/` 目录下的 OpenClaw Skills，无需任何格式转换。

---

## 改动说明

### 唯一修改文件：`core/skill-manager.js`

`engine.js` **无需修改**。`SkillManager` 构造函数的 `openClawSkillsDir` 参数有默认值，所有调用链（`init` → `reload` → `watch`）自动生效。

### 具体变更

#### 1. 新增常量与 import

```js
import os from "os";

const OPENCLAW_SKILLS_DIR = path.join(os.homedir(), ".openclaw", "skills");
```

#### 2. 构造函数扩展

新增 `openClawSkillsDir` 可选参数（默认 `~/.openclaw/skills/`）和 `_openClawWatcher` 字段：

```js
constructor({ skillsDir, openClawSkillsDir }) {
  this.openClawSkillsDir = openClawSkillsDir || OPENCLAW_SKILLS_DIR;
  this._openClawWatcher = null;
  // ...
}
```

#### 3. `init()` 和 `reload()` 末尾追加

```js
this._allSkills.push(...this.scanOpenClawSkills());
```

两处均追加，确保首次加载和热重载都能合并 OpenClaw Skills。

#### 4. `watch()` 新增 OpenClaw 目录监听

与 `skillsDir` 共用同一个 debounce 逻辑（1 秒），目录不存在时静默跳过：

```js
if (!this._openClawWatcher && fs.existsSync(this.openClawSkillsDir)) {
  this._openClawWatcher = fs.watch(this.openClawSkillsDir, { recursive: true }, ...);
}
```

#### 5. `unwatch()` 同时关闭 OpenClaw watcher

```js
if (this._openClawWatcher) { this._openClawWatcher.close(); this._openClawWatcher = null; }
```

#### 6. 新增 `scanOpenClawSkills()` 方法

扫描 `~/.openclaw/skills/` 下所有含 `SKILL.md` 的子目录，提取 `name`/`description`，标记 `source: "openclaw"`。

**关键设计决策**：
- 目录不存在 → 静默返回 `[]`，不报错，不影响启动
- 与内置/learned skills **同名冲突** → 跳过 OpenClaw 版本，内置优先
- OpenClaw 特有字段（`metadata.openclaw.bins`、`install.brew`、`os`）→ 忽略，仅提取 `description`

---

## Skill 对象结构

OpenClaw Skills 加载后的对象格式与内置 Skills 一致：

```js
{
  name: "some-skill",          // 目录名
  description: "...",          // SKILL.md frontmatter 中的 description
  filePath: "/path/to/SKILL.md",
  baseDir: "/path/to/skill-dir",
  source: "openclaw",          // 区分来源
  _hidden: false,
}
```

`source` 字段可用于 UI 展示时区分来源（`"builtin"` / `"learned"` / `"openclaw"`）。

---

## 如何安装 OpenClaw Skills

### 方式一：直接复制（推荐）

```bash
mkdir -p ~/.openclaw/skills
cp -r /path/to/some-skill ~/.openclaw/skills/
```

Hanako 运行中新增目录后，**1 秒内热重载**，无需重启。

### 方式二：克隆官方 Skills 仓库

```bash
git clone https://github.com/openclaw/skills ~/.openclaw/skills
# 后续更新
cd ~/.openclaw/skills && git pull
```

### 方式三：软链接（本地开发调试）

```bash
ln -s /path/to/my-skill ~/.openclaw/skills/my-skill
```

### 启用 Skill

安装后在 Hanako Skills 管理界面找到对应 skill（`source` 显示为 `openclaw`），点击启用；或直接编辑 agent 配置：

```json
// ~/.hanako/agents/<agent-id>/config.json
{
  "skills": {
    "enabled": ["skill-name"]
  }
}
```

---

## 兼容性说明

| Skill 类型 | 兼容性 | 说明 |
|---|---|---|
| 纯 prompt 指导型 | ✅ 零改造直接用 | 绝大多数 OpenClaw Skills 属于此类 |
| 依赖外部命令型 | ⚠️ 需手动安装依赖 | `metadata.openclaw.bins` 声明的命令需自行安装到 PATH |
| Channel 集成型 | ❌ 不适用 | 依赖 OpenClaw 特有的 channel 路由，Hanako 不支持 |

---

## 附：Hanako 记忆系统与 OpenClaw 的差异

> 本次调研顺带分析了 OpenClaw 社区流行的 `memory-lancedb-pro` 插件，结论是 **Hanako 不需要安装**。

OpenClaw 默认没有持久化记忆，需要插件补充。Hanako 的记忆系统是**内置核心模块**：

| 组件 | 实现 | 作用 |
|---|---|---|
| `FactStore` | `lib/memory/fact-store.js` (SQLite) | 跨会话持久化事实 |
| `SessionSummaryManager` | `lib/memory/session-summary.js` | 会话摘要 |
| `MemoryTicker` | `lib/memory/memory-ticker.js` | 定时整理，每轮/每次 session 切换触发 |
| `PinnedMemory` | `lib/tools/pinned-memory.js` | 手动钉住重要记忆 |
| `memory.md` | 编译产物 | 注入 system prompt |

`memory-lancedb-pro` 的差异化能力（向量检索、BM25、Weibull 衰减）属于**检索质量提升**，而非解决"失忆症"的必需品。如需引入语义向量检索，应在 `FactStore` 层改造（引入 LanceDB 或 sqlite-vec），而非安装 OpenClaw 插件。
