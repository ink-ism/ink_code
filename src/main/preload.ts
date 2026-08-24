import { contextBridge, ipcRenderer } from 'electron';

// 注意：Electron 20+ 默认沙箱化 preload，不支持 require 本地相对路径模块，
// 因此通道常量必须内联，不能从 ../common/types 导入
const IPC_CHANNELS = {
  FILE_OPEN_DIRECTORY: 'file:open-directory',
  FILE_SCAN_TREE: 'file:scan-tree',
  FILE_READ_CONTENT: 'file:read-content',
  FILE_SAVE_CONTENT: 'file:save-content',
  FILE_SCAN_DIRECTORY: 'file:scan-directory',
  INDEX_FILE: 'index:file',
  INDEX_PROJECT: 'index:project',
  CONFIG_GET_SETTINGS: 'config:get-settings',
  CONFIG_SAVE_SETTINGS: 'config:save-settings',
  CONFIG_GET_RECENT: 'config:get-recent-projects',
  CONFIG_BROWSE_DIR: 'config:browse-dir',
  CONFIG_GET_SESSION: 'config:get-session',
  CONFIG_SAVE_SESSION: 'config:save-session',
  FILE_LIST_ALL: 'file:list-all',
  SEARCH_PROJECT: 'search:project',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
  GIT_STATUS: 'git:status',
  GIT_LOG: 'git:log',
  GIT_STAGE: 'git:stage',
  GIT_UNSTAGE: 'git:unstage',
  GIT_STAGE_ALL: 'git:stage-all',
  GIT_UNSTAGE_ALL: 'git:unstage-all',
  GIT_DISCARD: 'git:discard',
  GIT_COMMIT: 'git:commit',
  GIT_PULL: 'git:pull',
  GIT_PUSH: 'git:push'
} as const;

const MAIN_EVENTS = {
  PROJECT_OPENED: 'project:opened',
  OPEN_SETTINGS: 'ui:open-settings'
} as const;

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 打开目录选择对话框
  openDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.FILE_OPEN_DIRECTORY),
  
  // 扫描文件树
  scanTree: (dirPath: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_SCAN_TREE, dirPath),
  
  // 扫描子目录（懒加载）
  scanDirectory: (dirPath: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_SCAN_DIRECTORY, dirPath),
  
  // 读取文件内容
  readFile: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_READ_CONTENT, filePath),
  
  // 保存文件内容
  saveFile: (filePath: string, content: string) => 
    ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE_CONTENT, filePath, content),
  
  // 索引单个文件
  indexFile: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.INDEX_FILE, filePath),
  
  // 索引整个项目
  indexProject: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.INDEX_PROJECT, projectPath),

  // 监听主进程菜单触发的打开项目事件
  onProjectOpened: (callback: (dirPath: string) => void) => {
    ipcRenderer.on(MAIN_EVENTS.PROJECT_OPENED, (_event, dirPath: string) => callback(dirPath));
  },

  // 监听打开设置页事件
  onOpenSettings: (callback: () => void) => {
    ipcRenderer.on(MAIN_EVENTS.OPEN_SETTINGS, () => callback());
  },

  // 配置相关
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_SETTINGS),
  saveSettings: (settings: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE_SETTINGS, settings),
  getRecentProjects: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_RECENT),
  browseDir: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_BROWSE_DIR),

  // 会话相关
  getSession: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_SESSION),
  saveSession: (session: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE_SESSION, session),

  // 快速打开 / 全局搜索
  listAllFiles: (root: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_LIST_ALL, root),
  searchProject: (root: string, query: string) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_PROJECT, root, query),

  // 用系统默认浏览器打开外部链接
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, url),

  // Git 相关
  gitStatus: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_STATUS, repoPath),
  gitLog: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_LOG, repoPath),
  gitStage: (repoPath: string, paths: string[]) => ipcRenderer.invoke(IPC_CHANNELS.GIT_STAGE, repoPath, paths),
  gitUnstage: (repoPath: string, paths: string[]) => ipcRenderer.invoke(IPC_CHANNELS.GIT_UNSTAGE, repoPath, paths),
  gitStageAll: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_STAGE_ALL, repoPath),
  gitUnstageAll: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_UNSTAGE_ALL, repoPath),
  gitDiscard: (repoPath: string, path: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_DISCARD, repoPath, path),
  gitCommit: (repoPath: string, message: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT, repoPath, message),
  gitPull: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_PULL, repoPath),
  gitPush: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_PUSH, repoPath)
});
