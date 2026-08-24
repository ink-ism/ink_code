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
  SHELL_OPEN_EXTERNAL: 'shell:open-external'
} as const;

// 主进程 -> 渲染进程 事件
export const MAIN_EVENTS = {
  PROJECT_OPENED: 'project:opened',
  OPEN_SETTINGS: 'ui:open-settings'
} as const;

// 编辑器配置
export interface EditorSettings {
  configRoot: string;  // 配置文件保存目录
  theme: string;       // 主题配色
  fontSize: number;    // 字体大小
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
