import { ipcMain, dialog, shell, nativeTheme, BrowserWindow } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import { IPC_CHANNELS, MAIN_EVENTS, isLightTheme } from '../common/types';
import { scanDirectory, scanFullTree } from './file-service';
import { indexFile, indexProject, clearCache } from './index-service';
import { loadSettings, saveSettings, loadRecentProjects, loadSession, saveSession } from './config-service';
import { getMenuModel, invokeMenuAction, applyTitleBarOverlay } from './menu-service';
import { decodeBuffer, encodeContent } from './encoding';
import { listAllFiles, searchProject } from './search-service';
import {
  getGitStatus, getGitLog, getGitCommitFiles, gitStage, gitUnstage, gitStageAll, gitUnstageAll,
  gitDiscard, gitCleanFile, gitCommit, gitPull, gitPush, gitFetch, gitPushUpstream,
  getGitBranches, gitCheckoutBranch, gitCreateBranch, gitDeleteBranch,
  gitMerge, gitMergeAbort, gitMergeContinue, getGitDiffContent, watchRepo
} from './git-service';

// 当前仓库的 .git 目录 watcher（外部变更自动刷新）
let repoWatcherClose: (() => void) | null = null;

// 向所有窗口广播事件（单窗口应用）
function broadcast(channel: string, ...args: unknown[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args);
  }
}

export function registerIpcHandlers() {
  // 打开目录选择对话框
  ipcMain.handle(IPC_CHANNELS.FILE_OPEN_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (result.canceled) {
      return null;
    }
    return result.filePaths[0];
  });

  // 扫描完整文件树
  ipcMain.handle(IPC_CHANNELS.FILE_SCAN_TREE, async (_event, dirPath: string) => {
    return await scanFullTree(dirPath);
  });

  // 扫描子目录（懒加载）
  ipcMain.handle(IPC_CHANNELS.FILE_SCAN_DIRECTORY, async (_event, dirPath: string) => {
    return await scanDirectory(dirPath);
  });

  // 读取文件内容（自动识别 UTF-8/GBK）
  ipcMain.handle(IPC_CHANNELS.FILE_READ_CONTENT, async (_event, filePath: string) => {
    try {
      const buf = await readFile(filePath);
      const { content, encoding } = decodeBuffer(buf, filePath);
      return { success: true, content, encoding };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 保存文件内容（保持原编码写回）
  ipcMain.handle(IPC_CHANNELS.FILE_SAVE_CONTENT, async (_event, filePath: string, content: string) => {
    try {
      await writeFile(filePath, encodeContent(content, filePath));
      // 保存后清除索引缓存，触发重新索引
      clearCache(filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 索引单个文件
  ipcMain.handle(IPC_CHANNELS.INDEX_FILE, async (_event, filePath: string) => {
    try {
      const symbols = indexFile(filePath);
      return { success: true, symbols };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 索引整个项目
  ipcMain.handle(IPC_CHANNELS.INDEX_PROJECT, async (_event, projectPath: string) => {
    try {
      const result = await indexProject(projectPath);
      // 仅回传计数，全量符号不再经 IPC 传输（渲染进程只用于日志）
      return { success: true, count: result.size };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 读取编辑器配置
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET_SETTINGS, async () => {
    try {
      return { success: true, settings: await loadSettings() };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 保存编辑器配置
  ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE_SETTINGS, async (_event, settings) => {
    try {
      await saveSettings(settings);
      // 原生窗口按钮 / 对话框配色随主题即时同步
      nativeTheme.themeSource = isLightTheme(settings.theme) ? 'light' : 'dark';
      const light = isLightTheme(settings.theme);
      for (const win of BrowserWindow.getAllWindows()) {
        applyTitleBarOverlay(win, light);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // HTML 菜单栏：拉取菜单模型
  ipcMain.handle(IPC_CHANNELS.MENU_GET_TEMPLATE, () => {
    return getMenuModel();
  });

  // HTML 菜单栏：执行菜单项动作
  ipcMain.handle(IPC_CHANNELS.MENU_INVOKE, (_event, id: string) => {
    invokeMenuAction(id);
    return { success: true };
  });

  // 读取最近项目
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET_RECENT, async () => {
    try {
      return { success: true, projects: await loadRecentProjects() };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 浏览选择目录（用于设置页）
  ipcMain.handle(IPC_CHANNELS.CONFIG_BROWSE_DIR, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled) {
      return null;
    }
    return result.filePaths[0];
  });

  // 读取会话状态
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET_SESSION, async () => {
    try {
      return { success: true, session: await loadSession() };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 保存会话状态
  ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE_SESSION, async (_event, session) => {
    try {
      await saveSession(session);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 列出项目所有文件（快速打开）
  ipcMain.handle(IPC_CHANNELS.FILE_LIST_ALL, async (_event, root: string) => {
    try {
      return { success: true, files: await listAllFiles(root) };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 全局搜索
  ipcMain.handle(IPC_CHANNELS.SEARCH_PROJECT, async (_event, root: string, query: string) => {
    try {
      return { success: true, matches: await searchProject(root, query) };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 用系统默认浏览器打开外部链接（仅允许 http/https/mailto）
  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, async (_event, url: string) => {
    try {
      if (!/^(https?:|mailto:)/i.test(url)) {
        return { success: false, error: '不支持的链接类型' };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ============ Git ============

  // 仓库状态（分支、同步、变更文件）
  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async (_event, repoPath: string) => {
    try {
      return { success: true, status: await getGitStatus(repoPath) };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 最近提交记录（分页）
  ipcMain.handle(IPC_CHANNELS.GIT_LOG, async (_event, repoPath: string, skip?: number, limit?: number) => {
    try {
      const { entries, hasMore } = await getGitLog(repoPath, skip ?? 0, limit);
      return { success: true, entries, hasMore };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 提交包含的变更文件
  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT_FILES, async (_event, repoPath: string, hash: string) => {
    try {
      return { success: true, files: await getGitCommitFiles(repoPath, hash) };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 文件 diff 双侧内容
  ipcMain.handle(IPC_CHANNELS.GIT_DIFF_CONTENT, async (
    _event, repoPath: string, path: string, mode: 'work' | 'staged' | 'commit', ref?: string
  ) => {
    try {
      return { success: true, diff: await getGitDiffContent(repoPath, path, mode, ref) };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 本地分支列表
  ipcMain.handle(IPC_CHANNELS.GIT_BRANCHES, async (_event, repoPath: string) => {
    try {
      return { success: true, branches: await getGitBranches(repoPath) };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 切换分支
  ipcMain.handle(IPC_CHANNELS.GIT_CHECKOUT_BRANCH, async (_event, repoPath: string, name: string) => {
    try {
      await gitCheckoutBranch(repoPath, name);
      return { success: true };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 新建分支并切换
  ipcMain.handle(IPC_CHANNELS.GIT_CREATE_BRANCH, async (_event, repoPath: string, name: string) => {
    try {
      await gitCreateBranch(repoPath, name);
      return { success: true };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 删除分支
  ipcMain.handle(IPC_CHANNELS.GIT_DELETE_BRANCH, async (_event, repoPath: string, name: string, force?: boolean) => {
    try {
      await gitDeleteBranch(repoPath, name, force ?? false);
      return { success: true };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 拉取远端（fetch，带进度回传）
  ipcMain.handle(IPC_CHANNELS.GIT_FETCH, async (_event, repoPath: string) => {
    try {
      await gitFetch(repoPath, (line) => broadcast(MAIN_EVENTS.GIT_PROGRESS, line));
      return { success: true };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 合并分支
  ipcMain.handle(IPC_CHANNELS.GIT_MERGE, async (_event, repoPath: string, branch: string) => {
    try {
      const result = await gitMerge(repoPath, branch);
      return { success: result.ok, conflicts: result.conflicts, error: result.ok ? undefined : result.message };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 中止合并
  ipcMain.handle(IPC_CHANNELS.GIT_MERGE_ABORT, async (_event, repoPath: string) => {
    try {
      await gitMergeAbort(repoPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 完成合并提交（冲突解决后）
  ipcMain.handle(IPC_CHANNELS.GIT_MERGE_CONTINUE, async (_event, repoPath: string) => {
    try {
      await gitMergeContinue(repoPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 删除未跟踪文件
  ipcMain.handle(IPC_CHANNELS.GIT_CLEAN_FILE, async (_event, repoPath: string, path: string) => {
    try {
      await gitCleanFile(repoPath, path);
      return { success: true };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 监听仓库 .git 目录变更（外部操作自动刷新）
  ipcMain.handle(IPC_CHANNELS.GIT_WATCH, async (_event, repoPath: string) => {
    try {
      repoWatcherClose?.();
      repoWatcherClose = watchRepo(repoPath, () => broadcast(MAIN_EVENTS.GIT_REPO_CHANGED)) ?? null;
      return { success: true };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 暂存指定文件
  ipcMain.handle(IPC_CHANNELS.GIT_STAGE, async (_event, repoPath: string, paths: string[]) => {
    try {
      await gitStage(repoPath, paths);
      return { success: true };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 取消暂存指定文件
  ipcMain.handle(IPC_CHANNELS.GIT_UNSTAGE, async (_event, repoPath: string, paths: string[]) => {
    try {
      await gitUnstage(repoPath, paths);
      return { success: true };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 暂存全部
  ipcMain.handle(IPC_CHANNELS.GIT_STAGE_ALL, async (_event, repoPath: string) => {
    try {
      await gitStageAll(repoPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 取消暂存全部
  ipcMain.handle(IPC_CHANNELS.GIT_UNSTAGE_ALL, async (_event, repoPath: string) => {
    try {
      await gitUnstageAll(repoPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 丢弃工作区修改
  ipcMain.handle(IPC_CHANNELS.GIT_DISCARD, async (_event, repoPath: string, path: string) => {
    try {
      await gitDiscard(repoPath, path);
      return { success: true };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 提交
  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT, async (_event, repoPath: string, message: string) => {
    try {
      await gitCommit(repoPath, message);
      return { success: true };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 拉取（带进度回传）
  ipcMain.handle(IPC_CHANNELS.GIT_PULL, async (_event, repoPath: string) => {
    try {
      const output = await gitPull(repoPath, (line) => broadcast(MAIN_EVENTS.GIT_PROGRESS, line));
      return { success: true, output };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 推送（带进度回传）
  ipcMain.handle(IPC_CHANNELS.GIT_PUSH, async (_event, repoPath: string) => {
    try {
      const output = await gitPush(repoPath, (line) => broadcast(MAIN_EVENTS.GIT_PROGRESS, line));
      return { success: true, output };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 首次推送无上游分支：push -u origin <branch>
  ipcMain.handle(IPC_CHANNELS.GIT_PUSH_UPSTREAM, async (_event, repoPath: string, branch: string) => {
    try {
      await gitPushUpstream(repoPath, branch, (line) => broadcast(MAIN_EVENTS.GIT_PROGRESS, line));
      return { success: true };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });
}
