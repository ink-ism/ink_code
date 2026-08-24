// Git 服务：通过系统 git CLI 执行基础操作（不引入额外依赖，避免打包体积与依赖白名单问题）
import { execFile } from 'child_process';
import { GitLogEntry, GitStatusInfo } from '../common/types';

// 执行 git 命令，失败时抛出携带 stderr 的 Error
function runGit(repoPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 60_000,
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
          reject(new Error('未检测到 git，请先安装 Git 并确保其在 PATH 中'));
          return;
        }
        const message = (stderr || err.message || String(error)).trim();
        reject(new Error(message || 'git 命令执行失败'));
        return;
      }
      resolve(stdout);
    });
  });
}

// 解析 git status 输出，得到分支、同步状态与变更文件列表
export async function getGitStatus(repoPath: string): Promise<GitStatusInfo> {
  let out: string;
  try {
    out = await runGit(repoPath, ['-c', 'core.quotepath=false', 'status', '--porcelain', '-b']);
  } catch (error) {
    const msg = String((error as Error).message ?? error);
    if (/not a git repository/i.test(msg)) {
      return { isRepo: false, branch: '', upstream: null, ahead: 0, behind: 0, staged: [], changes: [], untracked: [] };
    }
    throw error;
  }

  let branch = 'HEAD';
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  const staged: GitStatusInfo['staged'] = [];
  const changes: GitStatusInfo['changes'] = [];
  const untracked: GitStatusInfo['untracked'] = [];

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
    if (x !== ' ' && x !== '?') staged.push({ path: rel, code: x });
    if (y !== ' ' && y !== '?') changes.push({ path: rel, code: y });
  }

  return { isRepo: true, branch, upstream, ahead, behind, staged, changes, untracked };
}

// 最近提交记录（仅取字段，避免解析完整对象）
export async function getGitLog(repoPath: string, limit = 15): Promise<GitLogEntry[]> {
  const out = await runGit(repoPath, [
    'log', `--max-count=${limit}`, '--date=short',
    '--pretty=format:%h%x1f%an%x1f%ad%x1f%s'
  ]);
  return out.split('\n')
    .map(l => l.trimEnd())
    .filter(l => l.length > 0)
    .map(l => {
      const [hash, author, date, ...rest] = l.split('\x1f');
      return { hash, author, date, message: rest.join('\x1f') };
    });
}

// 暂存指定文件
export function gitStage(repoPath: string, paths: string[]): Promise<string> {
  return runGit(repoPath, ['add', '--', ...paths]);
}

// 取消暂存指定文件
export function gitUnstage(repoPath: string, paths: string[]): Promise<string> {
  return runGit(repoPath, ['restore', '--staged', '--', ...paths]);
}

// 暂存全部变更（含未跟踪）
export function gitStageAll(repoPath: string): Promise<string> {
  return runGit(repoPath, ['add', '-A']);
}

// 取消暂存全部
export function gitUnstageAll(repoPath: string): Promise<string> {
  return runGit(repoPath, ['restore', '--staged', '.']);
}

// 丢弃工作区修改（仅对已跟踪文件有效）
export function gitDiscard(repoPath: string, path: string): Promise<string> {
  return runGit(repoPath, ['checkout', '--', path]);
}

// 提交已暂存内容
export async function gitCommit(repoPath: string, message: string): Promise<string> {
  return await runGit(repoPath, ['commit', '-m', message]);
}

// 拉取远端
export function gitPull(repoPath: string): Promise<string> {
  return runGit(repoPath, ['pull']);
}

// 推送远端
export function gitPush(repoPath: string): Promise<string> {
  return runGit(repoPath, ['push']);
}
