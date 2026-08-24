import { ipcMain, dialog, shell } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import { IPC_CHANNELS } from '../common/types';
import { scanDirectory, scanFullTree } from './file-service';
import { indexFile, indexProject, clearCache } from './index-service';
import { loadSettings, saveSettings, loadRecentProjects, loadSession, saveSession } from './config-service';
import { decodeBuffer, encodeContent } from './encoding';
import { listAllFiles, searchProject } from './search-service';
import {
  getGitStatus, getGitLog, gitStage, gitUnstage, gitStageAll, gitUnstageAll,
  gitDiscard, gitCommit, gitPull, gitPush
} from './git-service';

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
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
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

  // 最近提交记录
  ipcMain.handle(IPC_CHANNELS.GIT_LOG, async (_event, repoPath: string) => {
    try {
      return { success: true, entries: await getGitLog(repoPath) };
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

  // 拉取
  ipcMain.handle(IPC_CHANNELS.GIT_PULL, async (_event, repoPath: string) => {
    try {
      const output = await gitPull(repoPath);
      return { success: true, output };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });

  // 推送
  ipcMain.handle(IPC_CHANNELS.GIT_PUSH, async (_event, repoPath: string) => {
    try {
      const output = await gitPush(repoPath);
      return { success: true, output };
    } catch (error) {
      return { success: false, error: String((error as Error).message ?? error) };
    }
  });
}
