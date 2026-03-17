/**
 * SkillManager — Skill 加载、过滤、per-agent 隔离
 *
 * 管理全量 skill 列表、learned skills 扫描、per-agent 隔离过滤。
 * 从 Engine 提取，Engine 通过 manager 访问 skill 状态。
 *
 * 支持从 ~/.openclaw/skills/ 目录加载 OpenClaw 兼容 Skills。
 */
import fs from "fs";
import os from "os";
import path from "path";

/** OpenClaw Skills 的默认安装目录 */
const OPENCLAW_SKILLS_DIR = path.join(os.homedir(), ".openclaw", "skills");

export class SkillManager {
  /**
   * @param {object} opts
   * @param {string} opts.skillsDir - 全局 skills 目录（~/.hanako/skills/）
   * @param {string} [opts.openClawSkillsDir] - OpenClaw skills 目录，默认 ~/.openclaw/skills/
   */
  constructor({ skillsDir, openClawSkillsDir }) {
    this.skillsDir = skillsDir;
    this.openClawSkillsDir = openClawSkillsDir || OPENCLAW_SKILLS_DIR;
    this._allSkills = [];
    this._hiddenSkills = new Set();
    this._watcher = null;
    this._openClawWatcher = null;
    this._reloadTimer = null;
    this._reloadDeps = null; // { resourceLoader, agents, onReloaded }
  }

  /** 全量 skill 列表 */
  get allSkills() { return this._allSkills; }

  /**
   * 首次加载：从 resourceLoader 获取内置 skills + 合并所有 agent 的 learned skills + OpenClaw skills
   * @param {object} resourceLoader - Pi SDK DefaultResourceLoader 实例
   * @param {Map} agents - agent Map
   * @param {Set<string>} hiddenSkills - 需要隐藏的 skill name 集合
   */
  init(resourceLoader, agents, hiddenSkills) {
    this._hiddenSkills = hiddenSkills;
    this._allSkills = resourceLoader.getSkills().skills;
    for (const s of this._allSkills) {
      s._hidden = hiddenSkills.has(s.name);
    }
    for (const [, ag] of agents) {
      this._allSkills.push(...this.scanLearnedSkills(ag.agentDir));
    }
    this._allSkills.push(...this.scanOpenClawSkills());
  }

  /** 将 agent 启用的 skill 同步到 agent 的 system prompt */
  syncAgentSkills(agent) {
    const enabled = agent?.config?.skills?.enabled || [];
    const skills = this._allSkills.filter(s => enabled.includes(s.name));
    agent.setEnabledSkills(skills);
  }

  /** 返回全量 skill 列表（供 API 使用），附带指定 agent 的 enabled 状态 */
  getAllSkills(agent) {
    const enabled = agent?.config?.skills?.enabled || [];
    return this._allSkills.map(s => ({
      name: s.name,
      description: s.description,
      filePath: s.filePath,
      baseDir: s.baseDir,
      source: s.source,
      hidden: !!s._hidden,
      enabled: enabled.includes(s.name),
    }));
  }

  /** 按 agent 过滤可用 skills（learned skills 有 per-agent 隔离） */
  getSkillsForAgent(targetAgent) {
    const enabled = targetAgent?.config?.skills?.enabled;
    if (!enabled || enabled.length === 0) {
      return { skills: [], diagnostics: [] };
    }
    const agentId = targetAgent ? path.basename(targetAgent.agentDir) : null;
    return {
      skills: this._allSkills.filter(s =>
        enabled.includes(s.name)
        && (!s._agentId || s._agentId === agentId)
      ),
      diagnostics: [],
    };
  }

  /**
   * 重新加载 skills（安装/删除后调用）
   * @param {object} resourceLoader
   * @param {Map} agents
   */
  async reload(resourceLoader, agents) {
    // 暂时恢复原始 getSkills 以便 reload() 正确扫描
    delete resourceLoader.getSkills;
    await resourceLoader.reload();

    this._allSkills = resourceLoader.getSkills().skills;
    for (const s of this._allSkills) {
      s._hidden = this._hiddenSkills.has(s.name);
    }
    for (const [, ag] of agents) {
      this._allSkills.push(...this.scanLearnedSkills(ag.agentDir));
    }
    this._allSkills.push(...this.scanOpenClawSkills());
  }

  /**
   * 监听 skillsDir 和 openClawSkillsDir 变化，自动 reload（debounce 1s）
   * @param {object} resourceLoader
   * @param {Map} agents
   * @param {() => void} onReloaded - reload 完成后的回调（用于 syncAllAgentSkills 等）
   */
  watch(resourceLoader, agents, onReloaded) {
    this._reloadDeps = { resourceLoader, agents, onReloaded };

    const scheduleReload = (filename) => {
      if (filename && (/^\./.test(filename) || /[~#]$/.test(filename))) return;
      if (this._reloadTimer) clearTimeout(this._reloadTimer);
      this._reloadTimer = setTimeout(() => this._autoReload(), 1000);
    };

    if (!this._watcher) {
      try {
        this._watcher = fs.watch(this.skillsDir, { recursive: true }, (_event, filename) => {
          scheduleReload(filename);
        });
        this._watcher.on("error", (err) => {
          console.error("[skill-manager] watcher error:", err.message);
        });
      } catch {}
    }

    // 监听 OpenClaw skills 目录（目录不存在时跳过，不报错）
    if (!this._openClawWatcher && fs.existsSync(this.openClawSkillsDir)) {
      try {
        this._openClawWatcher = fs.watch(this.openClawSkillsDir, { recursive: true }, (_event, filename) => {
          scheduleReload(filename);
        });
        this._openClawWatcher.on("error", (err) => {
          console.error("[skill-manager] openclaw watcher error:", err.message);
        });
      } catch {}
    }
  }

  async _autoReload() {
    const deps = this._reloadDeps;
    if (!deps) return;
    try {
      await this.reload(deps.resourceLoader, deps.agents);
      deps.onReloaded?.();
    } catch (err) {
      console.warn("[skill-manager] auto-reload failed:", err.message);
    }
  }

  /** 停止文件监听 */
  unwatch() {
    if (this._watcher) { this._watcher.close(); this._watcher = null; }
    if (this._openClawWatcher) { this._openClawWatcher.close(); this._openClawWatcher = null; }
    if (this._reloadTimer) { clearTimeout(this._reloadTimer); this._reloadTimer = null; }
    this._reloadDeps = null;
  }

  /**
   * 扫描 agentDir/learned-skills/ 下的自学 skills
   * @param {string} agentDir
   */
  scanLearnedSkills(agentDir) {
    const agentId = path.basename(agentDir);
    const learnedDir = path.join(agentDir, "learned-skills");
    if (!fs.existsSync(learnedDir)) return [];
    const results = [];
    for (const entry of fs.readdirSync(learnedDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(learnedDir, entry.name, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;
      try {
        const content = fs.readFileSync(skillFile, "utf-8");
        const descMatch = content.match(/^description:\s*(.+?)\s*$/m);
        const description = descMatch ? descMatch[1].replace(/["']/g, "") : "";
        results.push({
          name: entry.name,
          description,
          filePath: skillFile,
          baseDir: path.join(learnedDir, entry.name),
          source: "learned",
          _agentId: agentId,
          _hidden: false,
        });
      } catch {}
    }
    return results;
  }

  /**
   * 扫描 ~/.openclaw/skills/ 目录，加载 OpenClaw 兼容 Skills。
   *
   * OpenClaw skill 格式与 Hanako 完全兼容（SKILL.md + YAML frontmatter），
   * 但可能包含 Hanako 不支持的额外字段（如 metadata.openclaw.bins、install.brew、os），
   * 这些字段会被忽略，仅提取 name 和 description 用于展示和启用。
   *
   * 若 ~/.openclaw/skills/ 目录不存在，静默返回空数组，不报错。
   *
   * @returns {Array<{name: string, description: string, filePath: string, baseDir: string, source: string, _hidden: boolean}>}
   */
  scanOpenClawSkills() {
    if (!fs.existsSync(this.openClawSkillsDir)) return [];

    const results = [];
    let entries;
    try {
      entries = fs.readdirSync(this.openClawSkillsDir, { withFileTypes: true });
    } catch (err) {
      console.warn("[skill-manager] 无法读取 OpenClaw skills 目录:", err.message);
      return [];
    }

    // 收集已有 skill 名称，避免与内置 / learned skills 重名冲突
    const existingNames = new Set(this._allSkills.map(s => s.name));

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(this.openClawSkillsDir, entry.name, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;

      // 跳过与已有 skill 同名的条目，优先保留内置 / learned skills
      if (existingNames.has(entry.name)) {
        console.warn(`[skill-manager] OpenClaw skill "${entry.name}" 与已有 skill 重名，已跳过`);
        continue;
      }

      try {
        const content = fs.readFileSync(skillFile, "utf-8");
        const descMatch = content.match(/^description:\s*(.+?)\s*$/m);
        const description = descMatch ? descMatch[1].replace(/["']/g, "") : "";
        results.push({
          name: entry.name,
          description,
          filePath: skillFile,
          baseDir: path.join(this.openClawSkillsDir, entry.name),
          source: "openclaw",
          _hidden: false,
        });
        existingNames.add(entry.name);
      } catch (err) {
        console.warn(`[skill-manager] 读取 OpenClaw skill "${entry.name}" 失败:`, err.message);
      }
    }

    return results;
  }
}
