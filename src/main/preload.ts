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
  GIT_PUSH: 'git:push',
  GIT_FETCH: 'git:fetch',
  GIT_PUSH_UPSTREAM: 'git:push-upstream',
  GIT_BRANCHES: 'git:branches',
  GIT_CHECKOUT_BRANCH: 'git:checkout-branch',
  GIT_CREATE_BRANCH: 'git:create-branch',
  GIT_DELETE_BRANCH: 'git:delete-branch',
  GIT_MERGE: 'git:merge',
  GIT_MERGE_ABORT: 'git:merge-abort',
  GIT_MERGE_CONTINUE: 'git:merge-continue',
  GIT_DIFF_CONTENT: 'git:diff-content',
  GIT_COMMIT_FILES: 'git:commit-files',
  GIT_CLEAN_FILE: 'git:clean-file',
  GIT_WATCH: 'git:watch',
  MENU_GET_TEMPLATE: 'menu:get-template',
  MENU_INVOKE: 'menu:invoke',
  // 文件操作
  FILE_CREATE: 'file:create',
  FILE_RENAME: 'file:rename',
  FILE_DELETE: 'file:delete',
  FILE_COPY: 'file:copy',
  FILE_CUT: 'file:cut',
  FILE_PASTE: 'file:paste',
  // 搜索替换
  SEARCH_REPLACE: 'search:replace',
  // 终端
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_WRITE: 'terminal:write',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_DESTROY: 'terminal:destroy',
  // LSP
  LSP_DEFINITION: 'lsp:definition',
  LSP_REFERENCES: 'lsp:references',
  LSP_HOVER: 'lsp:hover',
  LSP_FORMAT: 'lsp:format',
  LSP_DID_OPEN: 'lsp:did-open',
  LSP_DID_CHANGE: 'lsp:did-change',
  LSP_DID_CLOSE: 'lsp:did-close',
  LSP_STATUS: 'lsp:status',
  LSP_START: 'lsp:start',
  // 文件监听
  FILE_WATCH: 'file:watch-file',
  FILE_UNWATCH: 'file:unwatch-file',
  // 键盘映射
  CONFIG_GET_KEYBINDINGS: 'config:get-keybindings',
  CONFIG_SAVE_KEYBINDINGS: 'config:save-keybindings',
  // 编译运行任务
  CONFIG_GET_TASKS: 'config:get-tasks',
  CONFIG_SAVE_TASKS: 'config:save-tasks',
  CONFIG_BROWSE_FILE: 'config:browse-file',
  TASK_RUN: 'task:run',
  TASK_STOP: 'task:stop',
  // 编码切换
  FILE_READ_WITH_ENCODING: 'file:read-with-encoding',
  FILE_SET_ENCODING: 'file:set-encoding'
} as const;

const MAIN_EVENTS = {
  PROJECT_OPENED: 'project:opened',
  OPEN_SETTINGS: 'ui:open-settings',
  MENU_UPDATED: 'menu:updated',
  GIT_PROGRESS: 'git:progress',
  GIT_REPO_CHANGED: 'git:repo-changed',
  FILE_CHANGED: 'file:changed',
  TERMINAL_DATA: 'terminal:data',
  LSP_STATUS_CHANGED: 'lsp:status-changed',
  MENU_ACTION: 'menu:action',
  TASK_OUTPUT: 'task:output',
  TASK_FINISHED: 'task:finished'
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
  gitLog: (repoPath: string, skip?: number, limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.GIT_LOG, repoPath, skip, limit),
  gitCommitFiles: (repoPath: string, hash: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT_FILES, repoPath, hash),
  gitDiffContent: (repoPath: string, path: string, mode: string, ref?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_DIFF_CONTENT, repoPath, path, mode, ref),
  gitStage: (repoPath: string, paths: string[]) => ipcRenderer.invoke(IPC_CHANNELS.GIT_STAGE, repoPath, paths),
  gitUnstage: (repoPath: string, paths: string[]) => ipcRenderer.invoke(IPC_CHANNELS.GIT_UNSTAGE, repoPath, paths),
  gitStageAll: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_STAGE_ALL, repoPath),
  gitUnstageAll: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_UNSTAGE_ALL, repoPath),
  gitDiscard: (repoPath: string, path: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_DISCARD, repoPath, path),
  gitCleanFile: (repoPath: string, path: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_CLEAN_FILE, repoPath, path),
  gitCommit: (repoPath: string, message: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT, repoPath, message),
  gitPull: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_PULL, repoPath),
  gitPush: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_PUSH, repoPath),
  gitFetch: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_FETCH, repoPath),
  gitPushUpstream: (repoPath: string, branch: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_PUSH_UPSTREAM, repoPath, branch),
  gitBranches: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_BRANCHES, repoPath),
  gitCheckoutBranch: (repoPath: string, name: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_CHECKOUT_BRANCH, repoPath, name),
  gitCreateBranch: (repoPath: string, name: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_CREATE_BRANCH, repoPath, name),
  gitDeleteBranch: (repoPath: string, name: string, force?: boolean) => ipcRenderer.invoke(IPC_CHANNELS.GIT_DELETE_BRANCH, repoPath, name, force),
  gitMerge: (repoPath: string, branch: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_MERGE, repoPath, branch),
  gitMergeAbort: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_MERGE_ABORT, repoPath),
  gitMergeContinue: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_MERGE_CONTINUE, repoPath),
  gitWatch: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_WATCH, repoPath),
  onGitProgress: (callback: (line: string) => void) => {
    ipcRenderer.on(MAIN_EVENTS.GIT_PROGRESS, (_event, line: string) => callback(line));
  },
  onGitRepoChanged: (callback: () => void) => {
    ipcRenderer.on(MAIN_EVENTS.GIT_REPO_CHANGED, () => callback());
  },

  // HTML 菜单栏：拉取菜单模型 / 执行菜单项 / 监听菜单重建
  menuGetTemplate: () => ipcRenderer.invoke(IPC_CHANNELS.MENU_GET_TEMPLATE),
  menuInvoke: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.MENU_INVOKE, id),
  onMenuUpdated: (callback: () => void) => {
    ipcRenderer.on(MAIN_EVENTS.MENU_UPDATED, () => callback());
  },

  // 文件操作
  createFile: (parentDir: string, name: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_CREATE, parentDir, name),
  createFolder: (parentDir: string, name: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_CREATE, parentDir, name, true),
  renameItem: (oldPath: string, newName: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_RENAME, oldPath, newName),
  deleteItem: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_DELETE, path),
  copyItem: (srcPath: string, destDir: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_COPY, srcPath, destDir),
  cutItem: (srcPath: string, destDir: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_CUT, srcPath, destDir),
  pasteItem: (destDir: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_PASTE, destDir),

  // 搜索替换
  searchReplace: (root: string, options: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_REPLACE, root, options),

  // 终端
  terminalCreate: (options: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_CREATE, options),
  terminalWrite: (id: string, data: string) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_WRITE, id, data),
  terminalResize: (id: string, cols: number, rows: number) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESIZE, id, cols, rows),
  terminalDestroy: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_DESTROY, id),
  onTerminalData: (callback: (id: string, data: string) => void) => {
    ipcRenderer.on(MAIN_EVENTS.TERMINAL_DATA, (_event, id: string, data: string) => callback(id, data));
  },

  // LSP
  lspDefinition: (uri: string, line: number, character: number) => ipcRenderer.invoke(IPC_CHANNELS.LSP_DEFINITION, uri, line, character),
  lspReferences: (uri: string, line: number, character: number) => ipcRenderer.invoke(IPC_CHANNELS.LSP_REFERENCES, uri, line, character),
  lspHover: (uri: string, line: number, character: number) => ipcRenderer.invoke(IPC_CHANNELS.LSP_HOVER, uri, line, character),
  lspFormat: (uri: string) => ipcRenderer.invoke(IPC_CHANNELS.LSP_FORMAT, uri),
  lspDidOpen: (uri: string, languageId: string, version: number, content: string) => ipcRenderer.invoke(IPC_CHANNELS.LSP_DID_OPEN, uri, languageId, version, content),
  lspDidChange: (uri: string, version: number, content: string) => ipcRenderer.invoke(IPC_CHANNELS.LSP_DID_CHANGE, uri, version, content),
  lspDidClose: (uri: string) => ipcRenderer.invoke(IPC_CHANNELS.LSP_DID_CLOSE, uri),
  lspStatus: () => ipcRenderer.invoke(IPC_CHANNELS.LSP_STATUS),
  lspStart: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.LSP_START, projectPath),
  onLspStatusChanged: (callback: (status: unknown) => void) => {
    ipcRenderer.on(MAIN_EVENTS.LSP_STATUS_CHANGED, (_event, status: unknown) => callback(status));
  },

  // 键盘映射
  getKeybindings: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_KEYBINDINGS),
  saveKeybindings: (keybindings: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE_KEYBINDINGS, keybindings),

  // 编译运行任务
  getTasksConfig: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_TASKS),
  saveTasksConfig: (config: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE_TASKS, config),
  browseFile: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_BROWSE_FILE),
  taskRun: (options: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TASK_RUN, options),
  taskStop: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.TASK_STOP, taskId),
  onTaskOutput: (callback: (taskId: string, text: string) => void) => {
    ipcRenderer.on(MAIN_EVENTS.TASK_OUTPUT, (_event, taskId: string, text: string) => callback(taskId, text));
  },
  onTaskFinished: (callback: (info: unknown) => void) => {
    ipcRenderer.on(MAIN_EVENTS.TASK_FINISHED, (_event, info: unknown) => callback(info));
  },

  // 编码切换
  readFileWithEncoding: (filePath: string, encoding: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_READ_WITH_ENCODING, filePath, encoding),
  setFileEncoding: (filePath: string, encoding: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_SET_ENCODING, filePath, encoding),

  // 事件监听
  onFileChanged: (callback: (filePath: string) => void) => {
    ipcRenderer.on(MAIN_EVENTS.FILE_CHANGED, (_event, filePath: string) => callback(filePath));
  },

  // 文件外部变更监听
  watchFile: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_WATCH, filePath),
  unwatchFile: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_UNWATCH, filePath),

  // 菜单动作（新建文件/文件夹/终端切换等）
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on(MAIN_EVENTS.MENU_ACTION, (_event, action: string) => callback(action));
  }
});
