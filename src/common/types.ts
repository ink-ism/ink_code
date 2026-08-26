// 共享类型定义

// 文件树节点
export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  isPackage?: boolean;  // 是否为 Java package 目录
  children?: FileTreeNode[];
}

// 文件符号
export interface FileSymbol {
  name: string;
  kind: 'class' | 'interface' | 'enum' | 'method' | 'field';
  line: number;
  column: number;
  parent?: string;
}

// IPC 通道名称
export const IPC_CHANNELS = {
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

// 主进程 -> 渲染进程 事件
export const MAIN_EVENTS = {
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

// 可序列化菜单模型节点（HTML 菜单栏数据源）
export interface MenuModelNode {
  id?: string;
  label?: string;
  accelerator?: string;
  role?: string;
  separator?: boolean;
  enabled?: boolean;
  submenu?: MenuModelNode[];
}

// 编辑器配置
export interface EditorSettings {
  configRoot: string;  // 配置文件保存目录
  theme: string;       // 主题配色
  fontSize: number;    // 字体大小
  autoSave: 'off' | 'afterDelay' | 'onFocusChange';  // 自动保存模式
  autoSaveDelay: number;   // 自动保存延迟（ms）
  tabSize: number;         // Tab 缩进宽度
  wordWrap: 'off' | 'on'; // 自动换行
  minimap: boolean;        // 小地图开关
  javaServerPath: string;  // JDT LS 路径（空=自动检测）
}

// 浅色主题列表：编辑器使用浅色配色时，外壳 UI / 窗口底色需同步切换
export const LIGHT_THEMES = ['vs-light'];

// 判断是否为浅色主题（主进程与渲染进程共用）
export function isLightTheme(theme: string | null | undefined): boolean {
  return LIGHT_THEMES.includes(theme ?? '');
}

// 最近打开的项目
export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
}

// 全局搜索匹配结果
export interface SearchMatch {
  file: string;   // 绝对路径
  line: number;
  text: string;
}

// 会话状态（启动恢复）
export interface SessionState {
  projectPath: string | null;
  openFiles: Array<{ path: string; name: string }>;
  activeFile: string | null;
}

// Git 变更文件
export interface GitFileChange {
  path: string;   // 相对仓库根的路径（git 风格斜杠）
  code: string;   // M/A/D/R/C/U 等
}

// Git 仓库状态
export interface GitStatusInfo {
  isRepo: boolean;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: GitFileChange[];     // 已暂存
  changes: GitFileChange[];    // 工作区修改（未暂存）
  untracked: GitFileChange[];  // 未跟踪
  conflicts: GitFileChange[];  // 未解决冲突（code 为 XY 两位，如 UU）
  mergeInProgress: boolean;    // 是否处于 merge 中（存在 MERGE_HEAD）
}

// Git 分支信息
export interface GitBranchInfo {
  name: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  isCurrent: boolean;
}

// Git 提交记录
export interface GitLogEntry {
  hash: string;
  author: string;
  date: string;
  message: string;
}

// 提交包含的变更文件
export interface GitCommitFile {
  code: string;   // M/A/D/R 等
  path: string;
}

// diff 查看模式：工作区 vs 暂存区 / 暂存区 vs HEAD / 指定提交 vs 其父提交
export type GitDiffMode = 'work' | 'staged' | 'commit';

// 文件 diff 内容（双侧原文，供 Monaco diff 编辑器使用）
export interface GitDiffContent {
  original: string;
  modified: string;
  binary: boolean;   // 二进制文件不展示文本 diff
}

// ============ 文件操作 ============

// 文件操作剪贴板
export interface FileClipboard {
  path: string;
  mode: 'copy' | 'cut';
}

// ============ 终端 ============

// 终端创建选项
export interface TerminalCreateOptions {
  cwd: string;
  cols?: number;
  rows?: number;
}

// ============ LSP ============

// LSP 位置
export interface LspLocation {
  uri: string;       // 文件 URI
  line: number;      // 1-based
  character: number; // 1-based
}

// LSP 悬停信息
export interface LspHoverResult {
  content: string;
  range?: { startLine: number; startChar: number; endLine: number; endChar: number };
}

// LSP 格式化编辑
export interface LspTextEdit {
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
  newText: string;
}

// LSP 状态
export type LspStatusType = 'stopped' | 'starting' | 'ready' | 'error';

export interface LspStatusInfo {
  status: LspStatusType;
  message: string;
}

// ============ 键盘映射 ============

export interface Keybinding {
  command: string;
  key: string;
}

// ============ 搜索替换 ============

export interface SearchReplaceOptions {
  query: string;
  replacement: string;
  isRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface SearchReplaceResult {
  file: string;
  count: number;
}

// ============ 编译运行任务 ============

// 单条脚本条目（列表形式，用于项目级多脚本配置）
export interface TaskScriptEntry {
  name: string;     // 显示名称（可空，弹窗展示时回退为脚本文件名）
  script: string;   // 脚本路径（绝对路径或相对项目根的路径）
}

// 系统级配置（单条编译 + 单条运行）
export interface TaskScriptConfig {
  buildScript: string;
  runScript: string;
}

// 项目级配置（多脚本列表，编译/运行各自独立）
export interface ProjectTaskConfig {
  buildScripts: TaskScriptEntry[];
  runScripts: TaskScriptEntry[];
}

// 任务配置全集：系统级（global）+ 项目级（projects，项目路径 -> 配置）
// 项目级值兼容旧版单条格式 TaskScriptConfig，读取时归一化为列表
export interface TasksConfig {
  global: TaskScriptConfig;
  projects: Record<string, ProjectTaskConfig | TaskScriptConfig>;
}

// 任务类型
export type TaskKind = 'build' | 'run';

// 启动任务的参数（路径解析由渲染进程完成，主进程只负责执行）
export interface TaskRunOptions {
  kind: TaskKind;
  scriptPath: string;   // 脚本绝对路径
  cwd: string;          // 工作目录（项目根）
  label: string;        // 任务标题（如"编译 @ 14:30:02"）
}

// 任务结束事件载荷
export interface TaskFinishedInfo {
  taskId: string;
  exitCode: number | null;
  killed: boolean;
}
