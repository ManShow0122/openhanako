#!/usr/bin/env node

/**
 * 从上游源项目（upstream）同步最新代码到当前 fork 分支。
 *
 * 执行流程：
 *   1. 确认 upstream 远程已配置
 *   2. fetch upstream 最新代码
 *   3. 将 upstream/main 合并到当前分支（保留本地提交）
 */

import { execSync } from 'child_process';

const UPSTREAM_REMOTE = 'upstream';
const UPSTREAM_URL = 'git@github.com:liliMozi/openhanako.git';

function run(command, options = {}) {
  console.log(`\n> ${command}`);
  return execSync(command, { stdio: 'inherit', ...options });
}

function getOutput(command) {
  return execSync(command, { encoding: 'utf-8' }).trim();
}

function ensureUpstreamRemote() {
  const remotes = getOutput('git remote').split('\n');
  if (!remotes.includes(UPSTREAM_REMOTE)) {
    console.log(`[sync] 未找到 upstream 远程，正在添加: ${UPSTREAM_URL}`);
    run(`git remote add ${UPSTREAM_REMOTE} ${UPSTREAM_URL}`);
  } else {
    const currentUrl = getOutput(`git remote get-url ${UPSTREAM_REMOTE}`);
    if (currentUrl !== UPSTREAM_URL) {
      console.warn(`[sync] 警告: upstream 当前指向 ${currentUrl}，期望 ${UPSTREAM_URL}`);
    } else {
      console.log(`[sync] upstream 远程已就绪: ${UPSTREAM_URL}`);
    }
  }
}

function getCurrentBranch() {
  return getOutput('git rev-parse --abbrev-ref HEAD');
}

function hasUncommittedChanges() {
  try {
    getOutput('git diff-index --quiet HEAD --');
    return false;
  } catch {
    return true;
  }
}

async function main() {
  console.log('=== 同步上游源项目代码 ===');

  if (hasUncommittedChanges()) {
    console.error('[sync] 错误: 存在未提交的本地修改，请先 commit 或 stash 后再同步。');
    process.exit(1);
  }

  ensureUpstreamRemote();

  const currentBranch = getCurrentBranch();
  console.log(`[sync] 当前分支: ${currentBranch}`);

  console.log('\n[sync] 正在拉取 upstream 最新代码...');
  run(`git fetch ${UPSTREAM_REMOTE}`);

  const upstreamBranch = `${UPSTREAM_REMOTE}/main`;

  console.log(`\n[sync] 正在将 ${upstreamBranch} 合并到 ${currentBranch}...`);
  try {
    run(`git merge ${upstreamBranch} --no-edit`);
  } catch {
    console.error('\n[sync] 合并时发生冲突，请手动解决冲突后执行 git merge --continue。');
    process.exit(1);
  }

  console.log('\n✅ 同步完成！上游最新代码已合并到当前分支。');
  console.log('   如需推送到远端，请执行: git push origin');
}

main();
