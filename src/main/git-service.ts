// Git 服务：通过系统 git CLI 执行操作（不引入额外依赖，避免打包体积与依赖白名单问题）
import { execFile, spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { existsSync, watch, FSWatcher } from 'fs';
import { join } from 'path';
import { decodeBuffer } from './encoding';
import { GitBranchInfo, GitCommitFile, GitDiffContent, GitDiffMode, GitLogEntry, GitStatusInfo } from '../common/types';

// 环境变量：禁止 git 在凭据缺失时等待终端输入（无 TTY 场景快速失败而非挂起）
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0' };

// 执行 git 命令，失败时抛出携带 stderr 的 Error
function runGit(repoPath: string, args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: timeoutMs,
      windowsHide: true,
      env: GIT_ENV
    }, (error, stdout, stderr) => {
      if (error) {
        reject(toGitError(error, stderr));
        return;
      }
      resolve(stdout);
    });
  });
}

// 以原始字节读取 git 输出（blob 内容可能为 GBK 或二进制）
function runGitBuffer(repoPath: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile('git', args, {
      cwd: repoPath,
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60_000,
      windowsHide: true,
      env: GIT_ENV
    }, (error, stdout, stderr) => {
      if (error) {
        reject(toGitError(error, stderr));
        return;
      }
      resolve(stdout as unknown as Buffer);
    });
  });
}

function toGitError(error: unknown, stderr: unknown): Error {
  const err = error as NodeJS.ErrnoException;
  if (err?.code === 'ENOENT') {
    return new Error('未检测到 git，请先安装 Git 并确保其在 PATH 中');
  }
  const message = String(stderr ?? err?.message ?? error ?? '').trim();
  return new Error(message || 'git 命令执行失败');
}

// 流式执行（fetch/pull/push 等网络操作）：stderr 逐行回调进度，超时时间更长
function runGitStreamed(repoPath: string, args: string[], onLine: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: repoPath, windowsHide: true, env: GIT_ENV });
    let stdout = '';
    let stderrBuf = '';
    let pending = '';

    const report = (chunk: string) => {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const l of lines) {
        const t = l.replace(/\r$/, '').trim();
        if (t) onLine(t);
      }
    };

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d: Buffer) => {
      const text = d.toString('utf8');
      stderrBuf += text;
      report(text);
    });
    child.on('error', (err) => reject(toGitError(err, '')));

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('操作超时（120 秒），已中止'));
    }, 120_000);

    child.on('close', (code) => {
      clearTimeout(timer);
      const tail = pending.replace(/\r$/, '').trim();
      if (tail) onLine(tail);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderrBuf.trim() || `git 退出码 ${code}`));
      }
    });
  });
}

// 判断错误信息是否为「非 git 仓库」
function isNotRepoError(error: unknown): boolean {
  return /not a git repository/i.test(String((error as Error)?.message ?? error));
}

const EMPTY_STATUS: GitStatusInfo = {
  isRepo: false, branch: '', upstream: null, ahead: 0, behind: 0,
  staged: [], changes: [], untracked: [], conflicts: [], mergeInProgress: false
};

// 未合并状态码组合（DD/AU/UD/UA/DU/AA/UU）
function isUnmerged(x: string, y: string): boolean {
  return x === 'U' || y === 'U' || (x === 'D' && y === 'D') || (x === 'A' && y === 'A');
}

// 解析 git status 输出，得到分支、同步状态与变更文件列表
export async function getGitStatus(repoPath: string): Promise<GitStatusInfo> {
  let out: string;
  try {
    out = await runGit(repoPath, ['-c', 'core.quotepath=false', 'status', '--porcelain', '-b']);
  } catch (error) {
    if (isNotRepoError(error)) return { ...EMPTY_STATUS };
    throw error;
  }

  let branch = 'HEAD';
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  const staged: GitStatusInfo['staged'] = [];
  const changes: GitStatusInfo['changes'] = [];
  const untracked: GitStatusInfo['untracked'] = [];
  const conflicts: GitStatusInfo['conflicts'] = [];

  for (const line of out.split('\n')) {
    if (line.startsWith('## ')) {
      // 形如：## main...origin/main [ahead 1, behind 2]
      const info = line.slice(3);
      const bracket = info.indexOf('[');
      const names = bracket >= 0 ? info.slice(0, bracket).trim() : info.trim();
      if (bracket >= 0) {
        const meta = info.slice(bracket + 1, info.indexOf(']'));
        for (const part of meta.split(',')) {
          const p = part.trim();
          if (p.startsWith('ahead ')) ahead = parseInt(p.slice(6), 10) || 0;
          if (p.startsWith('behind ')) behind = parseInt(p.slice(7), 10) || 0;
        }
      }
      const sep = names.indexOf('...');
      if (sep >= 0) {
        branch = names.slice(0, sep);
        upstream = names.slice(sep + 3);
      } else if (names && !names.startsWith('HEAD')) {
        branch = names;
      }
      continue;
    }
    if (line.length < 4) continue;
    const x = line[0];  // 暂存区状态
    const y = line[1];  // 工作区状态
    let rel = line.slice(3);
    // 重命名：取新路径
    const arrow = rel.indexOf(' -> ');
    if (arrow >= 0) rel = rel.slice(arrow + 4);
    if (x === '?' && y === '?') {
      untracked.push({ path: rel, code: 'U' });
      continue;
    }
    if (isUnmerged(x, y)) {
      conflicts.push({ path: rel, code: x + y });
      continue;
    }
    if (x !== ' ' && x !== '?') staged.push({ path: rel, code: x });
    if (y !== ' ' && y !== '?') changes.push({ path: rel, code: y });
  }

  // merge 进行中：MERGE_HEAD 存在（兼容 .git 为目录的常规场景）
  let mergeInProgress = false;
  try {
    mergeInProgress = existsSync(join(repoPath, '.git', 'MERGE_HEAD'));
  } catch { /* .git 为文件等罕见场景忽略 */ }

  return { isRepo: true, branch, upstream, ahead, behind, staged, changes, untracked, conflicts, mergeInProgress };
}

// 提交记录（分页：skip/limit，多取一条用于判断是否还有更多；空仓库返回空列表）
export async function getGitLog(repoPath: string, skip = 0, limit = 15): Promise<{ entries: GitLogEntry[]; hasMore: boolean }> {
  let out: string;
  try {
    out = await runGit(repoPath, [
      'log', `--skip=${skip}`, `--max-count=${limit + 1}`, '--date=short',
      '--pretty=format:%h%x1f%an%x1f%ad%x1f%s'
    ]);
  } catch (error) {
    // 空仓库（无任何提交）时 git log 报错，视为空列表
    if (/does not have any commits yet|bad default revision/i.test(String((error as Error).message))) {
      return { entries: [], hasMore: false };
    }
    throw error;
  }
  const entries = out.split('\n')
    .map(l => l.trimEnd())
    .filter(l => l.length > 0)
    .map(l => {
      const [hash, author, date, ...rest] = l.split('\x1f');
      return { hash, author, date, message: rest.join('\x1f') };
    });
  const hasMore = entries.length > limit;
  return { entries: hasMore ? entries.slice(0, limit) : entries, hasMore };
}

// 某次提交包含的变更文件
// -m --first-parent：merge 提交默认输出空的 combined diff，加上后按与第一父提交对比，普通提交不受影响
export async function getGitCommitFiles(repoPath: string, hash: string): Promise<GitCommitFile[]> {
  const out = await runGit(repoPath, ['show', '--name-status', '--pretty=format:', '-M', '-m', '--first-parent', hash]);
  const files: GitCommitFile[] = [];
  for (const line of out.split('\n')) {
    const t = line.trimEnd();
    if (!t) continue;
    const parts = t.split('\t');
    if (parts.length < 2) continue;
    const code = parts[0][0];  // R100 -> R
    // 重命名取新路径
    const path = parts.length >= 3 ? parts[2] : parts[1];
    files.push({ code, path });
  }
  return files;
}

// ============ 分支管理 ============

// 本地分支列表（含上游与领先/落后），当前分支排前
export async function getGitBranches(repoPath: string): Promise<GitBranchInfo[]> {
  const out = await runGit(repoPath, [
    'for-each-ref', 'refs/heads',
    '--format=%(refname:short)%1f%(upstream:short)%1f%(upstream:track)'
  ]);
  let current = 'HEAD';
  try {
    current = (await runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  } catch { /* 忽略 */ }

  const branches: GitBranchInfo[] = [];
  for (const line of out.split('\n')) {
    const t = line.trimEnd();
    if (!t) continue;
    const [name, upstreamRaw, track] = t.split('\x1f');
    let ahead = 0;
    let behind = 0;
    if (track) {
      const a = track.match(/ahead (\d+)/);
      const b = track.match(/behind (\d+)/);
      if (a) ahead = parseInt(a[1], 10);
      if (b) behind = parseInt(b[1], 10);
    }
    branches.push({
      name,
      upstream: upstreamRaw || null,
      ahead, behind,
      isCurrent: name === current
    });
  }
  branches.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || a.name.localeCompare(b.name));
  return branches;
}

export function gitCheckoutBranch(repoPath: string, name: string): Promise<string> {
  return runGit(repoPath, ['checkout', name]);
}

// 新建分支并切换
export function gitCreateBranch(repoPath: string, name: string): Promise<string> {
  return runGit(repoPath, ['checkout', '-b', name]);
}

export function gitDeleteBranch(repoPath: string, name: string, force: boolean): Promise<string> {
  return runGit(repoPath, ['branch', force ? '-D' : '-d', name]);
}

// ============ 同步操作 ============

export function gitFetch(repoPath: string, onLine: (line: string) => void): Promise<string> {
  return runGitStreamed(repoPath, ['fetch', '--progress', '--prune'], onLine);
}

export function gitPull(repoPath: string, onLine: (line: string) => void): Promise<string> {
  return runGitStreamed(repoPath, ['pull', '--progress'], onLine);
}

export function gitPush(repoPath: string, onLine: (line: string) => void): Promise<string> {
  return runGitStreamed(repoPath, ['push', '--progress'], onLine);
}

// 无上游分支首次推送：push -u origin <branch>
export function gitPushUpstream(repoPath: string, branch: string, onLine: (line: string) => void): Promise<string> {
  return runGitStreamed(repoPath, ['push', '--progress', '-u', 'origin', branch], onLine);
}

// ============ 合并 ============

export interface GitMergeResult {
  ok: boolean;
  conflicts: boolean;   // 产生冲突（merge 未自动完成）
  message: string;
}

// 合并指定分支到当前分支；冲突时不抛错，返回 conflicts 标记
export async function gitMerge(repoPath: string, branch: string): Promise<GitMergeResult> {
  try {
    const out = await runGit(repoPath, ['merge', branch]);
    return { ok: true, conflicts: false, message: out.trim() };
  } catch (error) {
    const message = String((error as Error).message ?? error);
    const conflicts = /CONFLICT|Automatic merge failed/i.test(message);
    return { ok: false, conflicts, message };
  }
}

export function gitMergeAbort(repoPath: string): Promise<string> {
  return runGit(repoPath, ['merge', '--abort']);
}

// 冲突解决完毕后完成合并提交（使用默认合并信息）
export function gitMergeContinue(repoPath: string): Promise<string> {
  return runGit(repoPath, ['commit', '--no-edit']);
}

// ============ 暂存/丢弃 ============

export function gitStage(repoPath: string, paths: string[]): Promise<string> {
  return runGit(repoPath, ['add', '--', ...paths]);
}

export function gitUnstage(repoPath: string, paths: string[]): Promise<string> {
  return runGit(repoPath, ['restore', '--staged', '--', ...paths]);
}

export function gitStageAll(repoPath: string): Promise<string> {
  return runGit(repoPath, ['add', '-A']);
}

// 取消暂存全部；空仓库（无 HEAD）时 restore 会失败，回退为 rm --cached
export async function gitUnstageAll(repoPath: string): Promise<string> {
  try {
    return await runGit(repoPath, ['restore', '--staged', '.']);
  } catch (error) {
    if (/unknown revision|ambiguous argument/i.test(String((error as Error).message))) {
      return await runGit(repoPath, ['rm', '-r', '--cached', '.']);
    }
    throw error;
  }
}

// 丢弃工作区修改（仅对已跟踪文件有效）
export function gitDiscard(repoPath: string, path: string): Promise<string> {
  return runGit(repoPath, ['checkout', '--', path]);
}

// 删除未跟踪文件（git clean，仅限单个文件路径）
export function gitCleanFile(repoPath: string, path: string): Promise<string> {
  return runGit(repoPath, ['clean', '-f', '--', path]);
}

export function gitCommit(repoPath: string, message: string): Promise<string> {
  return runGit(repoPath, ['commit', '-m', message]);
}

// ============ Diff 内容 ============

// 读取 blob 原始字节；不存在（新文件/根提交的父）返回 null
async function readBlob(repoPath: string, spec: string): Promise<Buffer | null> {
  try {
    return await runGitBuffer(repoPath, ['show', spec]);
  } catch {
    return null;
  }
}

// 粗略二进制检测：前 8KB 内含 NUL 字节
function looksBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8192).includes(0);
}

// 解码 blob；null 视为空内容，二进制返回标记
function decodeBlob(buf: Buffer | null): { text: string; binary: boolean } {
  if (!buf) return { text: '', binary: false };
  if (looksBinary(buf)) return { text: '', binary: true };
  return { text: decodeBuffer(buf).content, binary: false };
}

/**
 * 获取文件 diff 双侧内容：
 * - work：暂存区(:path) vs 工作区磁盘文件
 * - staged：HEAD vs 暂存区(:path)
 * - commit：ref^ vs ref（ref^ 即第一父提交，merge 提交同样适用；根提交无父时读空内容）
 */
export async function getGitDiffContent(
  repoPath: string, path: string, mode: GitDiffMode, ref?: string
): Promise<GitDiffContent> {
  let originalBuf: Buffer | null = null;
  let modifiedBuf: Buffer | null = null;

  if (mode === 'work') {
    originalBuf = await readBlob(repoPath, `:${path}`);
    try {
      modifiedBuf = await readFile(join(repoPath, path));
    } catch {
      modifiedBuf = null;  // 文件已被删除
    }
  } else if (mode === 'staged') {
    originalBuf = await readBlob(repoPath, `HEAD:${path}`);
    modifiedBuf = await readBlob(repoPath, `:${path}`);
  } else {
    const hash = ref ?? 'HEAD';
    originalBuf = await readBlob(repoPath, `${hash}^1:${path}`);
    modifiedBuf = await readBlob(repoPath, `${hash}:${path}`);
  }

  const original = decodeBlob(originalBuf);
  const modified = decodeBlob(modifiedBuf);
  return {
    original: original.text,
    modified: modified.text,
    binary: original.binary || modified.binary
  };
}

// ============ 仓库变更监听 ============

/**
 * 监听 .git 目录（递归），变更防抖后回调。
 * 覆盖命令行 commit/checkout/fetch/merge 等外部操作触发的刷新。
 * 忽略 index 与锁文件：git status 等只读命令会回写 index 的 stat 缓存，
 * 不过滤会形成 刷新 -> 写 index -> watcher -> 刷新 的自触发循环。
 * 返回关闭函数。
 */
export function watchRepo(repoPath: string, onChange: () => void): (() => void) | null {
  const gitDir = join(repoPath, '.git');
  if (!existsSync(gitDir)) return null;
  let watcher: FSWatcher | null = null;
  let timer: NodeJS.Timeout | undefined;
  try {
    watcher = watch(gitDir, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      const name = String(filename);
      if (name === 'index' || name === 'index.lock' || name.endsWith('.lock')) return;
      clearTimeout(timer);
      timer = setTimeout(() => onChange(), 600);
    });
  } catch {
    return null;
  }
  return () => {
    clearTimeout(timer);
    watcher?.close();
  };
}
