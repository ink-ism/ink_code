import { ipcMain, dialog, shell } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import { IPC_CHANNELS } from '../common/types';
import { scanDirectory, scanFullTree } from './file-service';
import { indexFile, indexProject, clearCache } from './index-service';
import { loadSettings, saveSettings, loadRecentProjects, loadSession, saveSession } from './config-service';
import { decodeBuffer, encodeContent } from './encoding';
import { listAllFiles, searchProject } from './search-service';

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
      // 将 Map 转换为数组以便 IPC 传输
      const symbolsArray = Array.from(result.entries()).map(([path, symbols]) => ({
        path,
        symbols
      }));
      return { success: true, symbols: symbolsArray };
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
}
