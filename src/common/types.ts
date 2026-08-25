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
  MENU_INVOKE: 'menu:invoke'
} as const;

// 主进程 -> 渲染进程 事件
export const MAIN_EVENTS = {
  PROJECT_OPENED: 'project:opened',
  OPEN_SETTINGS: 'ui:open-settings',
  MENU_UPDATED: 'menu:updated',
  GIT_PROGRESS: 'git:progress',
  GIT_REPO_CHANGED: 'git:repo-changed'
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
