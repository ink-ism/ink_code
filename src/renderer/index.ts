// 渲染进程入口
import { FileTree } from './components/FileTree';
import { EditorPane } from './components/EditorPane';
import { OutlinePanel } from './components/OutlinePanel';
import { SettingsPanel } from './components/SettingsPanel';
import { QuickOpen } from './components/QuickOpen';
import { SearchPanel } from './components/SearchPanel';
import { registerJavaLanguage } from './services/java-language';
import { registerSqlLanguage } from './services/sql-language';
import { registerMarkdownLanguage } from './services/markdown-language';
import { registerJsonLanguage } from './services/json-language';
import { registerPropertiesLanguage } from './services/properties-language';
import { MarkdownPreview } from './components/MarkdownPreview';
import { GitPanel, GitDiffRequest } from './components/GitPanel';
import { DiffViewer, detectLanguage } from './components/DiffViewer';
import { TitleBar } from './components/TitleBar';
import { FileTreeNode, FileSymbol, EditorSettings, SessionState, SearchMatch, GitLogEntry, GitStatusInfo, GitBranchInfo, GitCommitFile, GitDiffContent, GitDiffMode, MenuModelNode, isLightTheme } from '../common/types';

// 类型声明
declare global {
  interface Window {
    electronAPI: {
      openDirectory: () => Promise<string | null>;
      scanTree: (dirPath: string) => Promise<FileTreeNode>;
      scanDirectory: (dirPath: string) => Promise<FileTreeNode[]>;
      readFile: (filePath: string) => Promise<{ success: boolean; content?: string; encoding?: string; error?: string }>;
      saveFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
      indexFile: (filePath: string) => Promise<{ success: boolean; symbols?: FileSymbol[]; error?: string }>;
      indexProject: (projectPath: string) => Promise<{ success: boolean; count?: number; error?: string }>;
      onProjectOpened: (callback: (dirPath: string) => void) => void;
      onOpenSettings: (callback: () => void) => void;
      getSettings: () => Promise<{ success: boolean; settings?: EditorSettings; error?: string }>;
      saveSettings: (settings: EditorSettings) => Promise<{ success: boolean; error?: string }>;
      getRecentProjects: () => Promise<{ success: boolean; error?: string }>;
      browseDir: () => Promise<string | null>;
      getSession: () => Promise<{ success: boolean; session?: SessionState; error?: string }>;
      saveSession: (session: SessionState) => Promise<{ success: boolean; error?: string }>;
      listAllFiles: (root: string) => Promise<{ success: boolean; files?: string[]; error?: string }>;
      searchProject: (root: string, query: string) => Promise<{ success: boolean; matches?: SearchMatch[]; error?: string }>;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      gitStatus: (repoPath: string) => Promise<{ success: boolean; status?: GitStatusInfo; error?: string }>;
      gitLog: (repoPath: string, skip?: number, limit?: number) => Promise<{ success: boolean; entries?: GitLogEntry[]; hasMore?: boolean; error?: string }>;
      gitCommitFiles: (repoPath: string, hash: string) => Promise<{ success: boolean; files?: GitCommitFile[]; error?: string }>;
      gitDiffContent: (repoPath: string, path: string, mode: GitDiffMode, ref?: string) => Promise<{ success: boolean; diff?: GitDiffContent; error?: string }>;
      gitStage: (repoPath: string, paths: string[]) => Promise<{ success: boolean; error?: string }>;
      gitUnstage: (repoPath: string, paths: string[]) => Promise<{ success: boolean; error?: string }>;
      gitStageAll: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
      gitUnstageAll: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
      gitDiscard: (repoPath: string, path: string) => Promise<{ success: boolean; error?: string }>;
      gitCommit: (repoPath: string, message: string) => Promise<{ success: boolean; error?: string }>;
      gitPull: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
      gitPush: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
      gitFetch: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
      gitPushUpstream: (repoPath: string, branch: string) => Promise<{ success: boolean; error?: string }>;
      gitBranches: (repoPath: string) => Promise<{ success: boolean; branches?: GitBranchInfo[]; error?: string }>;
      gitCheckoutBranch: (repoPath: string, name: string) => Promise<{ success: boolean; error?: string }>;
      gitCreateBranch: (repoPath: string, name: string) => Promise<{ success: boolean; error?: string }>;
      gitDeleteBranch: (repoPath: string, name: string, force?: boolean) => Promise<{ success: boolean; error?: string }>;
      gitMerge: (repoPath: string, branch: string) => Promise<{ success: boolean; conflicts?: boolean; error?: string }>;
      gitMergeAbort: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
      gitMergeContinue: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
      gitCleanFile: (repoPath: string, path: string) => Promise<{ success: boolean; error?: string }>;
      gitWatch: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
      onGitProgress: (callback: (line: string) => void) => void;
      onGitRepoChanged: (callback: () => void) => void;
      menuGetTemplate: () => Promise<MenuModelNode[]>;
      menuInvoke: (id: string) => Promise<{ success: boolean }>;
      onMenuUpdated: (callback: () => void) => void;
    };
  }
}

// 全局状态
let currentProjectPath: string | null = null;
let fileTree: FileTree | null = null;
let editorPane: EditorPane | null = null;
let outlinePanel: OutlinePanel | null = null;
let settingsPanel: SettingsPanel | null = null;
let quickOpen: QuickOpen | null = null;
let searchPanel: SearchPanel | null = null;
let sessionTimer: number | undefined;
let markdownPreview: MarkdownPreview | null = null;
let gitPanel: GitPanel | null = null;
let diffViewer: DiffViewer | null = null;
let gitPollTimer: number | undefined;
let mdMode: MdMode = 'edit';
let mdRenderTimer: number | undefined;
// 大文件保护：超过该大小不创建 TextModel，避免单文件内存爆张
const MAX_OPEN_FILE_SIZE = 5 * 1024 * 1024;
// 滚动同步锁：防止编辑器 <-> 预览互相触发形成回环
let scrollLock: 'editor' | 'preview' | null = null;
let scrollLockTimer: number | undefined;

// 初始化
async function init() {
  // 注册增强版语法高亮（必须在创建编辑器之前）
  registerJavaLanguage();
  registerSqlLanguage();
  registerMarkdownLanguage();
  registerJsonLanguage();
  registerPropertiesLanguage();

  // 加载配置（主题、字体大小）
  let settings: EditorSettings | null = null;
  try {
    const settingsResult = await window.electronAPI.getSettings();
    if (settingsResult.success && settingsResult.settings) {
      settings = settingsResult.settings;
    }
  } catch (error) {
    console.error('加载配置失败:', error);
  }

  // 外壳 UI 配色随主题同步切换（在创建编辑器前应用，避免闪烁）
  applyUiTheme(settings?.theme);

  // 自绘标题栏菜单栏（原生标题栏已隐藏，窗口按钮为 overlay）
  void new TitleBar(document.getElementById('tb-menubar')!).init();

  // 初始化文件树
  fileTree = new FileTree(document.getElementById('file-tree')!);
  fileTree.onFileClick = async (filePath: string) => {
    await openFile(filePath);
  };

  // 初始化编辑器（应用配置中的主题和字体）
  editorPane = new EditorPane(
    document.getElementById('tab-bar')!,
    document.getElementById('editor')!,
    { theme: settings?.theme, fontSize: settings?.fontSize }
  );
  editorPane.onFileChange = async (filePath: string) => {
    updateBreadcrumb(filePath);
    updateLineCount();
    syncPreviewUI();
    await updateOutline(filePath);
    saveSessionDebounced();
  };
  editorPane.onAllClosed = () => {
    updateBreadcrumb(null);
    syncPreviewUI();
    saveSessionDebounced();
  };
  editorPane.onTabsChange = () => {
    saveSessionDebounced();
  };
  editorPane.onCursorChange = (line: number, column: number) => {
    document.getElementById('status-cursor')!.textContent = `Ln ${line}, Col ${column}`;
    updateLineCount();
  };
  editorPane.onSave = async (filePath: string, content: string) => {
    const result = await window.electronAPI.saveFile(filePath, content);
    if (result.success) {
      // 保存成功后重新索引
      await updateOutline(filePath);
      // 文件落盘后刷新 Git 状态（工作区变更可能变化）
      gitPanel?.refresh();
    }
    return result.success;
  };

  // 延迟 tab 首次激活：按需加载内容创建 TextModel
  editorPane.onLoadContent = async (filePath: string) => {
    const result = await window.electronAPI.readFile(filePath);
    return result.success && result.content != null ? result.content : null;
  };

  // Markdown 实时预览：内容变化防抖刷新（非纯编辑模式且为 md 文件时）
  editorPane.onContentChange = () => {
    if (mdMode === 'edit') return;
    if (editorPane?.getActiveLanguage() !== 'markdown') return;
    // 防抖 200ms：避免每次击键都全量 getValue + 解析 + innerHTML
    window.clearTimeout(mdRenderTimer);
    mdRenderTimer = window.setTimeout(() => renderActiveMarkdown(), 200);
  };

  // Markdown 预览组件、模式切换与滚动同步
  markdownPreview = new MarkdownPreview(document.getElementById('markdown-preview-content')!);
  markdownPreview.onOpenExternal = (url) => {
    window.electronAPI.openExternal(url);
  };
  document.getElementById('btn-mode-edit')!.addEventListener('click', () => setMdMode('edit'));
  document.getElementById('btn-mode-split')!.addEventListener('click', () => setMdMode('split'));
  document.getElementById('btn-mode-preview')!.addEventListener('click', () => setMdMode('preview'));
  initMarkdownScrollSync();

  // 初始化大纲面板
  outlinePanel = new OutlinePanel(document.getElementById('outline-panel')!);
  outlinePanel.onSymbolClick = (line: number) => {
    editorPane?.goToLine(line);
  };

  // 初始化 Git 面板：点击变更文件在编辑器打开，状态变化同步到状态栏，点击文件查看 diff
  gitPanel = new GitPanel(
    document.getElementById('git-panel')!,
    document.getElementById('git-branch')!,
    {
      onOpenFile: (relPath) => {
        if (currentProjectPath) {
          openFile(joinPath(currentProjectPath, relPath));
        }
      },
      onStatusUpdate: (status) => updateGitStatusBar(status),
      onShowDiff: (req) => showDiff(req)
    }
  );
  document.getElementById('btn-git-refresh')!.addEventListener('click', () => {
    gitPanel?.refresh();
  });

  // Diff 查看弹窗（惰性创建 Monaco diff 编辑器）
  diffViewer = new DiffViewer();

  // Git 流式进度（拉取/推送/获取）与外部变更通知（主进程 .git watcher）
  window.electronAPI.onGitProgress((line) => gitPanel?.showProgress(line));
  window.electronAPI.onGitRepoChanged(() => gitPanel?.refresh());

  // 监听菜单栏 Project -> 打开项目 事件
  window.electronAPI.onProjectOpened((dirPath) => {
    console.log('[renderer] 收到 project:opened', dirPath);
    loadProject(dirPath);
  });

  // 设置面板：保存后应用主题和字体
  settingsPanel = new SettingsPanel((newSettings) => {
    applyUiTheme(newSettings.theme);
    editorPane?.setTheme(newSettings.theme);
    editorPane?.setFontSize(newSettings.fontSize);
  });

  // 监听菜单栏 文件 -> 设置 事件
  window.electronAPI.onOpenSettings(() => {
    console.log('[renderer] 收到 open-settings');
    settingsPanel?.show();
  });

  // 活动栏交互（侧边栏/大纲开关、设置入口）
  initActivityBar();
  updateBreadcrumb(null);

  // 快速打开（Ctrl+P）
  quickOpen = new QuickOpen((relPath) => {
    if (currentProjectPath) {
      openFile(joinPath(currentProjectPath, relPath));
    }
  });

  // 全局搜索（Ctrl+Shift+F）
  searchPanel = new SearchPanel(async (file, line) => {
    await openFile(file);
    editorPane?.goToLine(line);
  });

  // 全局快捷键
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (!e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      quickOpen?.show();
    } else if (e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      searchPanel?.show();
    } else if (e.shiftKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      cycleMdMode();
    }
  }, true);

  console.log('[renderer] init 完成，监听已注册');

  // 初始化侧边栏拖拽调整宽度
  initResizer();

  // 恢复上次会话（项目 + 打开的 tab）
  try {
    const sessionResult = await window.electronAPI.getSession();
    if (sessionResult.success && sessionResult.session?.projectPath) {
      loadProject(sessionResult.session.projectPath, sessionResult.session);
    }
  } catch (error) {
    console.error('恢复会话失败:', error);
  }
}

// 侧边栏拖拽拉宽
function initResizer() {
  const resizer = document.getElementById('resizer')!;
  const sidebar = document.getElementById('sidebar')!;
  const MIN_WIDTH = 180;
  const MAX_WIDTH = 600;

  let isResizing = false;
  // 侧边栏左边缘（活动栏之后），拖动开始时记录，避免宽度跳变
  let sidebarLeft = 0;

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    sidebarLeft = sidebar.getBoundingClientRect().left;
    resizer.classList.add('dragging');
    document.body.classList.add('resizing');
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX - sidebarLeft));
    sidebar.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    resizer.classList.remove('dragging');
    document.body.classList.remove('resizing');
  });

  // 双击恢复默认宽度
  resizer.addEventListener('dblclick', () => {
    sidebar.style.width = '280px';
  });
}

// 侧边栏视图：资源管理器 与 Git 互斥切换
type SidebarView = 'explorer' | 'git';
let currentSidebarView: SidebarView = 'explorer';

// 切换到指定视图（同时确保侧边栏可见，并同步活动栏高亮）
function switchSidebarView(view: SidebarView) {
  const explorerView = document.getElementById('explorer-view')!;
  const gitContainer = document.getElementById('git-container')!;
  currentSidebarView = view;
  explorerView.style.display = view === 'explorer' ? 'flex' : 'none';
  gitContainer.style.display = view === 'git' ? 'flex' : 'none';
  document.getElementById('sidebar')!.style.display = 'flex';
  document.getElementById('resizer')!.style.display = 'block';
  document.getElementById('btn-explorer')!.classList.toggle('active', view === 'explorer');
  document.getElementById('btn-git')!.classList.toggle('active', view === 'git');
  if (view === 'git') {
    gitPanel?.refresh();
  }
  updateGitPolling();
}

// 活动栏按钮：点击当前视图时收起侧边栏，否则切换到对应视图
function toggleSidebarView(view: SidebarView) {
  const sidebar = document.getElementById('sidebar')!;
  if (sidebar.style.display !== 'none' && currentSidebarView === view) {
    sidebar.style.display = 'none';
    document.getElementById('resizer')!.style.display = 'none';
    document.getElementById('btn-explorer')!.classList.remove('active');
    document.getElementById('btn-git')!.classList.remove('active');
    updateGitPolling();
    return;
  }
  switchSidebarView(view);
}

// 活动栏按钮交互
function initActivityBar() {
  const outlineContainer = document.getElementById('outline-container')!;

  document.getElementById('btn-explorer')!.addEventListener('click', () => {
    toggleSidebarView('explorer');
  });

  document.getElementById('btn-git')!.addEventListener('click', () => {
    toggleSidebarView('git');
  });

  document.getElementById('btn-outline')!.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLElement;
    const show = outlineContainer.style.display === 'none';
    outlineContainer.style.display = show ? 'flex' : 'none';
    btn.classList.toggle('active', show);
  });

  document.getElementById('btn-settings')!.addEventListener('click', () => {
    settingsPanel?.show();
  });
}

// 状态栏面包屑：当前文件路径（过长时截断为 … + 末 4 段）
function updateBreadcrumb(filePath: string | null) {
  const el = document.getElementById('status-breadcrumb')!;
  el.replaceChildren();

  const base = filePath ?? currentProjectPath;
  if (!base) {
    const empty = document.createElement('span');
    empty.className = 'crumb';
    empty.textContent = '未打开项目';
    el.appendChild(empty);
    return;
  }

  const parts = base.split(/[/\\]/).filter(Boolean);
  const shown = parts.length > 5 ? ['…', ...parts.slice(-4)] : parts;
  shown.forEach((part, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.textContent = '›';
      el.appendChild(sep);
    }
    const crumb = document.createElement('span');
    crumb.className = 'crumb' + (filePath !== null && i === shown.length - 1 ? ' current' : '');
    crumb.textContent = part;
    el.appendChild(crumb);
  });
}

// 加载项目
async function loadProject(dirPath: string, restore?: SessionState) {
  console.log('[loadProject] 加载项目:', dirPath);

  currentProjectPath = dirPath;
  searchPanel?.setRoot(dirPath);
  // 项目名显示在侧边栏标题位置
  document.getElementById('project-name')!.textContent = dirPath.split(/[/\\]/).pop() || dirPath;
  updateBreadcrumb(null);

  // 切换项目后刷新 Git 面板（分支、变更、提交记录），并注册仓库变更监听
  gitPanel?.setProject(dirPath);
  gitPanel?.refresh();
  window.electronAPI.gitWatch(dirPath).catch(() => { /* 监听失败不影响主流程 */ });

  try {
    // 加载文件树
    const tree = await window.electronAPI.scanTree(dirPath);
    fileTree?.setTree(tree);

    // 文件列表（快速打开用）
    window.electronAPI.listAllFiles(dirPath).then(result => {
      if (result.success && result.files) {
        quickOpen?.setFiles(result.files);
      }
    });

    // 后台索引项目（主进程侧缓存，仅回传计数）
    window.electronAPI.indexProject(dirPath).then(result => {
      if (result.success) {
        console.log(`项目索引完成，共 ${result.count ?? 0} 个文件`);
      }
    });

    // 恢复上次打开的 tab：仅活动文件立即加载，其余延迟 tab 点击时再加载（降低启动内存）
    if (restore && restore.openFiles.length > 0) {
      for (const f of restore.openFiles) {
        if (f.path !== restore.activeFile) {
          editorPane?.addTabDeferred(f.path, f.name);
        }
      }
      const activePath = restore.activeFile ?? restore.openFiles[0].path;
      await openFile(activePath);
    }

    saveSessionDebounced();
  } catch (error) {
    console.error('[loadProject] 错误:', error);
  }
}

// 打开文件
async function openFile(filePath: string) {
  const result = await window.electronAPI.readFile(filePath);
  if (!result.success || !result.content) {
    console.error('读取文件失败:', result.error);
    return;
  }

  // 大文件保护：不创建超大 TextModel
  if (result.content.length > MAX_OPEN_FILE_SIZE) {
    console.warn('文件过大，未打开:', filePath);
    alert(`“${filePath.split(/[/\\]/).pop()}” 超过 5MB，暂不打开以避免内存占用过高。`);
    return;
  }

  // 状态栏显示文件编码
  document.getElementById('status-encoding')!.textContent = result.encoding || 'UTF-8';

  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  editorPane?.openFile(filePath, fileName, result.content);
  await updateOutline(filePath);
}

// 更新大纲
async function updateOutline(filePath: string) {
  const result = await window.electronAPI.indexFile(filePath);
  if (result.success && result.symbols) {
    outlinePanel?.setSymbols(result.symbols);
  }
}

// ============ Markdown 预览（纯编辑 / 双栏 / 纯预览） ============

type MdMode = 'edit' | 'split' | 'preview';

// 根据当前活动文件同步模式切换器可见性与布局
function syncPreviewUI() {
  const switcher = document.getElementById('md-mode-switch')!;
  const isMarkdown = editorPane?.getActiveLanguage() === 'markdown';
  switcher.hidden = !isMarkdown;
  if (!isMarkdown) {
    // 非 md 文件：恢复纯编辑布局
    document.getElementById('markdown-preview')!.hidden = true;
    document.getElementById('editor-area')!.classList.remove('mode-split', 'mode-preview');
    return;
  }
  applyMdMode();
}

// 应用当前 Markdown 模式（布局类 + 面板显隐 + 按钮状态 + 渲染）
function applyMdMode() {
  const area = document.getElementById('editor-area')!;
  const pane = document.getElementById('markdown-preview')!;
  area.classList.toggle('mode-split', mdMode === 'split');
  area.classList.toggle('mode-preview', mdMode === 'preview');
  pane.hidden = mdMode === 'edit';
  document.getElementById('btn-mode-edit')!.classList.toggle('active', mdMode === 'edit');
  document.getElementById('btn-mode-split')!.classList.toggle('active', mdMode === 'split');
  document.getElementById('btn-mode-preview')!.classList.toggle('active', mdMode === 'preview');
  if (mdMode !== 'edit') {
    renderActiveMarkdown();
  }
}

// 设置模式（仅对 Markdown 文件生效）
function setMdMode(mode: MdMode) {
  if (editorPane?.getActiveLanguage() !== 'markdown') return;
  mdMode = mode;
  applyMdMode();
}

// Ctrl+Shift+V 循环切换：纯编辑 -> 双栏 -> 纯预览
function cycleMdMode() {
  if (editorPane?.getActiveLanguage() !== 'markdown') return;
  mdMode = mdMode === 'edit' ? 'split' : mdMode === 'split' ? 'preview' : 'edit';
  applyMdMode();
}

// 渲染当前活动 Markdown 并对齐预览滚动位置
function renderActiveMarkdown() {
  const info = editorPane?.getActiveFileInfo();
  if (info && info.language === 'markdown') {
    markdownPreview?.render(info.content, info.path);
    syncPreviewScrollFromEditor();
  }
}

// 双栏滚动同步：编辑器与预览按比例联动，共用编辑器滚动条
function initMarkdownScrollSync() {
  const previewContent = document.getElementById('markdown-preview-content')!;

  // 编辑器滚动 -> 预览跟随
  editorPane!.onDidScroll = (info) => {
    if (mdMode !== 'split' || scrollLock === 'preview') return;
    lockScroll('editor');
    const max = info.scrollHeight - info.height;
    const ratio = max > 0 ? Math.min(1, info.scrollTop / max) : 0;
    previewContent.scrollTop = ratio * (previewContent.scrollHeight - previewContent.clientHeight);
  };

  // 预览滚动（滚轮/触摸板）-> 编辑器跟随
  previewContent.addEventListener('scroll', () => {
    if (mdMode !== 'split' || scrollLock === 'editor') return;
    lockScroll('preview');
    const max = previewContent.scrollHeight - previewContent.clientHeight;
    const ratio = max > 0 ? previewContent.scrollTop / max : 0;
    const em = editorPane?.getScrollMetrics();
    if (em) editorPane?.setScrollTop(ratio * (em.scrollHeight - em.height));
  });
}

// 滚动同步锁：记录触发源，短暂窗口内忽略对方事件
function lockScroll(source: 'editor' | 'preview') {
  scrollLock = source;
  window.clearTimeout(scrollLockTimer);
  scrollLockTimer = window.setTimeout(() => {
    scrollLock = null;
  }, 80);
}

// 按编辑器当前滚动比例对齐预览（渲染后调用，避免位置漂移）
function syncPreviewScrollFromEditor() {
  if (mdMode !== 'split') return;
  const em = editorPane?.getScrollMetrics();
  if (!em) return;
  const el = document.getElementById('markdown-preview-content')!;
  const max = em.scrollHeight - em.height;
  const ratio = max > 0 ? Math.min(1, em.scrollTop / max) : 0;
  lockScroll('editor');
  el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
}

// 状态栏行数
function updateLineCount() {
  const el = document.getElementById('status-lines')!;
  const count = editorPane?.getLineCount() ?? 0;
  el.textContent = count > 0 ? `${count} 行` : '';
}

// 状态栏 Git 分支信息
function updateGitStatusBar(status: GitStatusInfo | null) {
  const el = document.getElementById('status-git')!;
  if (!status || !status.isRepo) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  let text = `⎇ ${status.branch}`;
  const dirty = status.staged.length + status.changes.length + status.untracked.length;
  if (dirty > 0) text += ` · ${dirty} 变更`;
  if (status.conflicts.length > 0) text += ` · ⚠${status.conflicts.length} 冲突`;
  el.textContent = text;
  el.hidden = false;
}

// 查看文件 diff：拉取双侧内容后交给 DiffViewer 展示
async function showDiff(req: GitDiffRequest) {
  if (!currentProjectPath) return;
  const res = await window.electronAPI.gitDiffContent(currentProjectPath, req.path, req.mode, req.ref);
  if (!res.success || !res.diff) {
    alert(res.error || '获取 diff 内容失败');
    return;
  }
  if (res.diff.binary) {
    alert(`“${req.path}” 为二进制文件，无法展示文本差异`);
    return;
  }
  const name = req.path.split(/[\\/]/).pop() || req.path;
  let originalLabel: string;
  let modifiedLabel: string;
  if (req.mode === 'work') {
    originalLabel = '暂存区';
    modifiedLabel = '工作区';
  } else if (req.mode === 'staged') {
    originalLabel = 'HEAD';
    modifiedLabel = '暂存区';
  } else {
    const short = (req.ref ?? '').slice(0, 7);
    originalLabel = `${short}^`;
    modifiedLabel = short;
  }
  diffViewer?.show({
    title: name,
    originalLabel,
    modifiedLabel,
    original: res.diff.original,
    modified: res.diff.modified,
    language: detectLanguage(name)
  });
}

// Git 视图可见时兜底轮询（主进程 watcher 之外的双保险，覆盖 watcher 失效场景）
function updateGitPolling() {
  window.clearInterval(gitPollTimer);
  gitPollTimer = undefined;
  const sidebar = document.getElementById('sidebar')!;
  if (currentSidebarView === 'git' && sidebar.style.display !== 'none') {
    gitPollTimer = window.setInterval(() => gitPanel?.refresh(), 15000);
  }
}

// 路径拼接（项目根 + 相对路径）
function joinPath(root: string, rel: string): string {
  return root.replace(/[\\/]+$/, '') + '\\' + rel.replace(/\//g, '\\');
}

// 同步外壳 UI 配色：通过 :root[data-theme] 切换 CSS 变量，与编辑器主题保持一致
function applyUiTheme(theme: string | undefined) {
  document.documentElement.setAttribute('data-theme', isLightTheme(theme) ? 'light' : 'dark');
}

// 防抖保存会话状态
function saveSessionDebounced() {
  window.clearTimeout(sessionTimer);
  sessionTimer = window.setTimeout(() => {
    const state = editorPane?.getSessionState();
    window.electronAPI.saveSession({
      projectPath: currentProjectPath,
      openFiles: state?.openFiles ?? [],
      activeFile: state?.activeFile ?? null
    });
  }, 500);
}

// 启动
init();
