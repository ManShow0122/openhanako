/**
 * win32-exec.js — Windows 平台的 bash 执行函数
 *
 * Windows 没有 OS 级沙盒（seatbelt/bwrap），bash 走 Pi SDK 默认实现。
 * 但默认实现的 detached: true 在 Windows 上会设 DETACHED_PROCESS 标志，
 * 导致 MSYS2/Git Bash 的 stdout/stderr pipe 可能收不到数据。
 *
 * 这个模块提供替代的 exec 函数，使用 spawnAndStream（已去掉 Windows detached）。
 * 返回值契约匹配 Pi SDK BashOperations.exec。
 */

import { existsSync } from "fs";
import { delimiter } from "path";
import { spawnSync } from "child_process";
import { spawnAndStream } from "./exec-helper.js";

// ── Shell 查找（轻量版，只在 Windows 上用） ──

let _cachedShell = null;

function findShell() {
  if (_cachedShell) return _cachedShell;

  // 1. Git Bash 标准位置
  const candidates = [];
  if (process.env.ProgramFiles) {
    candidates.push(`${process.env.ProgramFiles}\\Git\\bin\\bash.exe`);
  }
  if (process.env["ProgramFiles(x86)"]) {
    candidates.push(`${process.env["ProgramFiles(x86)"]}\\Git\\bin\\bash.exe`);
  }
  for (const p of candidates) {
    if (existsSync(p)) {
      _cachedShell = { shell: p, args: ["-c"] };
      return _cachedShell;
    }
  }

  // 2. PATH 上找 bash.exe
  try {
    const result = spawnSync("where", ["bash.exe"], { encoding: "utf-8", timeout: 5000 });
    if (result.status === 0 && result.stdout) {
      const first = result.stdout.trim().split(/\r?\n/)[0];
      if (first && existsSync(first)) {
        _cachedShell = { shell: first, args: ["-c"] };
        return _cachedShell;
      }
    }
  } catch {}

  // 3. 兜底 sh
  _cachedShell = { shell: "sh", args: ["-c"] };
  return _cachedShell;
}

function getShellEnv() {
  const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  return { ...process.env, [pathKey]: process.env[pathKey] ?? "" };
}

/**
 * 创建 Windows 平台的 bash exec 函数
 * @returns {(command: string, cwd: string, opts: object) => Promise<{exitCode: number|null}>}
 */
export function createWin32Exec() {
  return (command, cwd, { onData, signal, timeout, env }) => {
    const { shell, args } = findShell();
    return spawnAndStream(shell, [...args, command], {
      cwd,
      env: env ?? getShellEnv(),
      onData,
      signal,
      timeout,
    });
  };
}
