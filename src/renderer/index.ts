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
import { ReplacePanel } from './components/ReplacePanel';
import { TerminalPanel } from './components/TerminalPanel';
import { TaskPanel } from './components/TaskPanel';
import { ScriptPicker } from './components/ScriptPicker';
import { ReferencesPanel, ReferenceItem } from './components/ReferencesPanel';
import { registerLspProviders, notifyDidOpen, notifyDidChange, notifyDidClose, pathToUri, uriToPath } from './services/lsp-client';
import { registerCommand, applyKeybindings } from './services/command-service';
import { FileTreeNode, FileSymbol, EditorSettings, SessionState, SearchMatch, GitLogEntry, GitStatusInfo, GitBranchInfo, GitCommitFile, GitDiffContent, GitDiffMode, MenuModelNode, Keybinding, LspLocation, isLightTheme, TasksConfig, TaskKind, TaskFinishedInfo, TaskScriptEntry, TaskScriptConfig, ProjectTaskConfig } from '../common/types';

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
      // 文件操作
      createFile: (parentDir: string, name: string) => Promise<{ success: boolean; error?: string }>;
      createFolder: (parentDir: string, name: string) => Promise<{ success: boolean; error?: string }>;
      renameItem: (oldPath: string, newName: string) => Promise<{ success: boolean; error?: string }>;
      deleteItem: (path: string) => Promise<{ success: boolean; error?: string }>;
      copyItem: (srcPath: string, destDir: string) => Promise<{ success: boolean; error?: string }>;
      cutItem: (srcPath: string, destDir: string) => Promise<{ success: boolean; error?: string }>;
      pasteItem: (destDir: string) => Promise<{ success: boolean; error?: string }>;
      // 搜索替换
      searchReplace: (root: string, options: unknown) => Promise<{ success: boolean; results?: unknown[]; error?: string }>;
      // 终端
      terminalCreate: (options: unknown) => Promise<{ success: boolean; id?: string; error?: string }>;
      terminalWrite: (id: string, data: string) => Promise<{ success: boolean; error?: string }>;
      terminalResize: (id: string, cols: number, rows: number) => Promise<{ success: boolean; error?: string }>;
      terminalDestroy: (id: string) => Promise<{ success: boolean; error?: string }>;
      onTerminalData: (callback: (id: string, data: string) => void) => void;
      // LSP
      lspDefinition: (uri: string, line: number, character: number) => Promise<{ success: boolean; locations?: unknown; error?: string }>;
      lspReferences: (uri: string, line: number, character: number) => Promise<{ success: boolean; locations?: unknown; error?: string }>;
      lspHover: (uri: string, line: number, character: number) => Promise<{ success: boolean; hover?: unknown; error?: string }>;
      lspFormat: (uri: string) => Promise<{ success: boolean; edits?: unknown; error?: string }>;
      lspDidOpen: (uri: string, languageId: string, version: number, content: string) => Promise<{ success: boolean; error?: string }>;
      lspDidChange: (uri: string, version: number, content: string) => Promise<{ success: boolean; error?: string }>;
      lspDidClose: (uri: string) => Promise<{ success: boolean; error?: string }>;
      lspStatus: () => Promise<{ success: boolean; status?: unknown; error?: string }>;
      lspStart: (projectPath: string) => Promise<{ success: boolean; status?: unknown; error?: string }>;
      onLspStatusChanged: (callback: (status: unknown) => void) => void;
      // 键盘映射
      getKeybindings: () => Promise<{ success: boolean; keybindings?: Keybinding[]; error?: string }>;
      saveKeybindings: (keybindings: unknown) => Promise<{ success: boolean; error?: string }>;
      // 编译运行任务
      getTasksConfig: () => Promise<{ success: boolean; config?: TasksConfig; error?: string }>;
      saveTasksConfig: (config: TasksConfig) => Promise<{ success: boolean; error?: string }>;
      browseFile: () => Promise<string | null>;
      taskRun: (options: unknown) => Promise<{ success: boolean; taskId?: string; error?: string }>;
      taskStop: (taskId: string) => Promise<{ success: boolean; error?: string }>;
      onTaskOutput: (callback: (taskId: string, text: string) => void) => void;
      onTaskFinished: (callback: (info: TaskFinishedInfo) => void) => void;
      // 编码切换
      readFileWithEncoding: (filePath: string, encoding: string) => Promise<{ success: boolean; content?: string; error?: string }>;
      setFileEncoding: (filePath: string, encoding: string) => Promise<{ success: boolean; error?: string }>;
      // 事件监听
      onFileChanged: (callback: (filePath: string) => void) => void;
      onMenuAction: (callback: (action: string) => void) => void;
      watchFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      unwatchFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
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
let replacePanel: ReplacePanel | null = null;
let terminalPanel: TerminalPanel | null = null;
let taskPanel: TaskPanel | null = null;
let scriptPicker: ScriptPicker | null = null;
let referencesPanel: ReferencesPanel | null = null;
let currentSettings: EditorSettings | null = null;
let watchedFilePath: string | null = null;
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
      currentSettings = settings;
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

  // 应用编辑器设置
  if (settings) {
    editorPane.setAutoSave(settings.autoSave ?? 'off', settings.autoSaveDelay ?? 1000);
    editorPane.setTabSize(settings.tabSize ?? 4);
    editorPane.setWordWrap(settings.wordWrap ?? 'off');
    editorPane.setMinimap(settings.minimap !== false);
  }

  editorPane.onFileChange = async (filePath: string) => {
    updateBreadcrumb(filePath);
    updateLineCount();
    syncPreviewUI();
    await updateOutline(filePath);
    saveSessionDebounced();
    // 注册外部变更监听（切换文件时替换 watcher）
    if (watchedFilePath && watchedFilePath !== filePath) {
      void window.electronAPI.unwatchFile(watchedFilePath);
    }
    void window.electronAPI.watchFile(filePath);
    watchedFilePath = filePath;
  };

  // 跨文件跳转（Ctrl+Click / F12 到其他文件）
  editorPane.onOpenFileRequest = async (filePath: string, line?: number) => {
    await openFile(filePath);
    if (line) editorPane?.goToLine(line);
  };
  editorPane.onAllClosed = () => {
    updateBreadcrumb(null);
    syncPreviewUI();
    saveSessionDebounced();
  };
  editorPane.onTabsChange = () => {
    saveSessionDebounced();
  };
  // tab 关闭时通知 LSP 释放文档（避免陈旧内容影响跳转/诊断）
  editorPane.onCloseFile = (filePath: string) => {
    notifyDidClose(filePath);
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
    // 通知 LSP 文档变更
    const filePath = editorPane?.getActiveFilePath();
    if (filePath) {
      const content = editorPane?.getContent() || '';
      notifyDidChange(filePath, content);
    }

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
    currentSettings = newSettings;
    applyUiTheme(newSettings.theme);
    editorPane?.setTheme(newSettings.theme);
    editorPane?.setFontSize(newSettings.fontSize);
    editorPane?.setAutoSave(newSettings.autoSave ?? 'off', newSettings.autoSaveDelay ?? 1000);
    editorPane?.setTabSize(newSettings.tabSize ?? 4);
    editorPane?.setWordWrap(newSettings.wordWrap ?? 'off');
    editorPane?.setMinimap(newSettings.minimap !== false);
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

  // 全局搜索替换（Ctrl+H）
  replacePanel = new ReplacePanel(async (file, line) => {
    await openFile(file);
    editorPane?.goToLine(line);
  });

  // 终端面板
  terminalPanel = new TerminalPanel(
    document.getElementById('terminal-panel')!,
    document.getElementById('terminal-content')!,
    document.getElementById('terminal-tabs')!,
    currentProjectPath || undefined
  );
  // 补同步终端配色（applyUiTheme 先于本实例创建执行，默认值为深色）
  terminalPanel.setTheme(isLightTheme(settings?.theme) ? 'light' : 'dark');

  // 引用查找结果面板
  referencesPanel = new ReferencesPanel(
    document.getElementById('references-panel')!,
    async (filePath, line) => {
      await openFile(filePath);
      editorPane?.goToLine(line);
    }
  );
  // 面板隐藏（✕ 按钮）时同步活动栏引用按钮状态
  referencesPanel.onHide = () => {
    document.getElementById('btn-references')?.classList.remove('active');
  };
  initReferencesResizer();

  // 任务输出面板（编译/运行）
  taskPanel = new TaskPanel(document.getElementById('task-panel')!);
  scriptPicker = new ScriptPicker();
  taskPanel.onStop = (taskId) => {
    void window.electronAPI.taskStop(taskId);
  };
  // 面板内 ✕ 关闭时同步活动栏按钮高亮
  taskPanel.onClose = () => {
    document.getElementById('btn-task-output')?.classList.remove('active');
  };
  window.electronAPI.onTaskOutput((taskId, text) => {
    taskPanel?.appendOutput(taskId, text);
  });
  window.electronAPI.onTaskFinished((info) => {
    taskPanel?.finishTask(info.taskId, info.exitCode, info.killed);
    // 唤醒等待方（编译并运行链式执行）；无等待方则暂存结果防竞态丢失
    const resolver = taskFinishWaiters.get(info.taskId);
    if (resolver) {
      taskFinishWaiters.delete(info.taskId);
      resolver(info.exitCode);
    } else {
      taskFinishedCodes.set(info.taskId, info.exitCode);
    }
  });

  // 注册 LSP Provider
  registerLspProviders();

  // 加载并应用键盘映射
  try {
    const kbResult = await window.electronAPI.getKeybindings();
    if (kbResult.success && kbResult.keybindings) {
      applyKeybindings(kbResult.keybindings);
    }
  } catch (e) {
    console.warn('加载键盘映射失败:', e);
  }

  // 注册命令处理器
  registerCommand('file.save', () => {
    editorPane?.saveActiveFile();
  });
  registerCommand('file.saveAll', () => {
    editorPane?.saveAllFiles();
  });
  registerCommand('view.toggleTerminal', () => {
    toggleTerminalPanel();
  });
  registerCommand('search.replace', () => {
    replacePanel?.show();
  });
  registerCommand('task.build', () => {
    void runTaskKind('build');
  });
  registerCommand('task.run', () => {
    void runTaskKind('run');
  });
  registerCommand('task.buildRun', () => {
    void runBuildThenRun();
  });

  // 查找光标处符号的引用（Shift+F12 / 活动栏引用按钮）
  async function findReferencesAtCursor(): Promise<boolean> {
    const info = editorPane?.getCursorInfo();
    if (!info || !info.word) {
      alert('请先打开文件并将光标放在符号上');
      return false;
    }
    const result = await window.electronAPI.lspReferences(
      pathToUri(info.path), info.line, info.column
    );
    const locations = (result.success && result.locations) ? result.locations as LspLocation[] : [];
    const items: ReferenceItem[] = locations.map(loc => ({
      filePath: uriToPath(loc.uri),
      line: loc.line,
      character: loc.character
    }));
    referencesPanel?.show(items, info.word);
    return true;
  }

  registerCommand('editor.findReferences', () => {
    void findReferencesAtCursor();
  });

  // 活动栏引用按钮
  document.getElementById('btn-references')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLElement;
    const panel = document.getElementById('references-panel')!;
    if (!panel.hidden) {
      referencesPanel?.hide();
      btn.classList.remove('active');
      return;
    }
    const shown = await findReferencesAtCursor();
    btn.classList.toggle('active', shown);
  });

  // 全局快捷键
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      quickOpen?.show();
    } else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      searchPanel?.show();
    } else if (mod && e.shiftKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      cycleMdMode();
    } else if (mod && e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      editorPane?.saveAllFiles();
    } else if (mod && e.shiftKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      replacePanel?.show();
    } else if (mod && e.key === '`') {
      e.preventDefault();
      toggleTerminalPanel();
    }
  }, true);

  console.log('[renderer] init 完成，监听已注册');

  // 文件外部变更检测
  window.electronAPI.onFileChanged(async (filePath) => {
    if (!editorPane?.isFileOpen(filePath)) return;
    if (editorPane?.isFileDirty(filePath)) {
      const fileName = filePath.split(/[\\/]/).pop() || filePath;
      if (confirm(`“${fileName}” 已被外部修改，是否重新加载？`)) {
        await editorPane?.reloadFile(filePath);
      }
    } else {
      await editorPane?.reloadFile(filePath);
    }
  });

  // 菜单动作处理
  window.electronAPI.onMenuAction(async (action) => {
    switch (action) {
      case 'new-file':
        fileTree?.startInlineCreate(currentProjectPath);
        break;
      case 'new-folder':
        fileTree?.startInlineCreate(currentProjectPath, true);
        break;
      case 'save-all':
        editorPane?.saveAllFiles();
        break;
      case 'toggle-terminal':
        toggleTerminalPanel();
        break;
      case 'search-replace':
        replacePanel?.show();
        break;
      case 'task-build':
        void runTaskKind('build');
        break;
      case 'task-run':
        void runTaskKind('run');
        break;
      case 'task-build-run':
        void runBuildThenRun();
        break;
      case 'task-settings':
        void settingsPanel?.show('tasks');
        break;
    }
  });

  // 编译运行工具栏按钮
  document.getElementById('btn-task-build')?.addEventListener('click', () => {
    void runTaskKind('build');
  });
  document.getElementById('btn-task-run')?.addEventListener('click', () => {
    void runTaskKind('run');
  });
  document.getElementById('btn-task-build-run')?.addEventListener('click', () => {
    void runBuildThenRun();
  });

  // 编码切换：状态栏点击
  const encodingEl = document.getElementById('status-encoding');
  if (encodingEl) {
    encodingEl.style.cursor = 'pointer';
    encodingEl.addEventListener('click', () => {
      const filePath = editorPane?.getActiveFilePath();
      if (!filePath) return;
      showEncodingMenu(filePath, encodingEl);
    });
  }

  // 终端面板按钮
  document.getElementById('btn-terminal-new')?.addEventListener('click', () => {
    terminalPanel?.createNewTerminal(currentProjectPath || undefined);
  });
  document.getElementById('btn-terminal-close')?.addEventListener('click', () => {
    toggleTerminalPanel(false);
  });

  // 初始化侧边栏拖拽调整宽度
  initResizer();
  // 底部面板拖拽调高（终端 / 任务输出面板共用逻辑）
  initBottomResizer('terminal-resizer', 'terminal-panel', () => terminalPanel?.fitActive());
  initBottomResizer('task-resizer', 'task-panel');

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

// 引用面板拖拽调宽（面板在右侧，向左拖变宽）
function initReferencesResizer() {
  const resizer = document.getElementById('references-resizer');
  const panel = document.getElementById('references-panel');
  if (!resizer || !panel) return;
  const MIN_WIDTH = 200;
  const MAX_WIDTH = 640;

  let isResizing = false;
  // 面板右边缘，拖动开始时记录，避免宽度跳变
  let panelRight = 0;

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    panelRight = panel.getBoundingClientRect().right;
    resizer.classList.add('dragging');
    document.body.classList.add('resizing');
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, panelRight - e.clientX));
    panel.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    resizer.classList.remove('dragging');
    document.body.classList.remove('resizing');
  });

  // 双击恢复默认宽度
  resizer.addEventListener('dblclick', () => {
    panel.style.width = '';
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

  document.getElementById('btn-terminal')!.addEventListener('click', () => {
    toggleTerminalPanel();
  });

  // 输出面板按钮（与终端面板互斥）
  document.getElementById('btn-task-output')!.addEventListener('click', () => {
    toggleTaskPanel();
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
  // 同步项目路径给设置面板（编译运行的项目级配置需要）
  if (settingsPanel) {
    settingsPanel.projectPath = dirPath;
  }
  searchPanel?.setRoot(dirPath);
  replacePanel?.setRoot(dirPath);
  terminalPanel?.setCwd(dirPath);
  // 项目名显示在侧边栏标题位置
  document.getElementById('project-name')!.textContent = dirPath.split(/[/\\]/).pop() || dirPath;
  updateBreadcrumb(null);

  // 启动 Language Server（后台异步，未安装 JDT LS 时自动降级为符号索引）
  window.electronAPI.lspStart(dirPath).then(result => {
    if (!result.success) {
      const msg = (result.status as { message?: string } | undefined)?.message;
      console.warn(`[LSP] 未启动，使用符号索引降级方案${msg ? `：${msg}` : ''}`);
    }
  }).catch(() => { /* 忽略 */ });

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

  // 通知 LSP 文档打开
  const languageId = getLanguageIdFromPath(filePath);
  if (languageId) {
    notifyDidOpen(filePath, languageId, result.content);
  }
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

// 根据文件路径获取语言 ID
function getLanguageIdFromPath(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'java': return 'java';
    case 'js': case 'mjs': return 'javascript';
    case 'ts': case 'mts': return 'typescript';
    case 'json': return 'json';
    case 'md': return 'markdown';
    case 'sql': return 'sql';
    case 'properties': return 'properties';
    case 'xml': case 'html': case 'htm': return 'xml';
    default: return null;
  }
}

// 同步外壳 UI 配色：通过 :root[data-theme] 切换 CSS 变量，与编辑器主题保持一致
function applyUiTheme(theme: string | undefined) {
  const light = isLightTheme(theme);
  document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
  // 终端配色跟随外壳主题（浅色白底黑字 / 深色黑底白字）
  terminalPanel?.setTheme(light ? 'light' : 'dark');
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

// 底部面板拖拽调高（终端/输出面板共用：面板在底部，向上拖变高）
function initBottomResizer(resizerId: string, panelId: string, onDrag?: () => void) {
  const resizer = document.getElementById(resizerId);
  const panel = document.getElementById(panelId);
  if (!resizer || !panel) return;
  const MIN_HEIGHT = 100;

  let isResizing = false;
  // 面板下边缘与最大高度，拖动开始时记录（限幅随窗口尺寸变化）
  let panelBottom = 0;
  let maxHeight = 0;

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    panelBottom = panel.getBoundingClientRect().bottom;
    // 面板位于主内容区底部：最大高度 = 容器高度 - 保留给编辑器的最小空间
    const containerHeight = panel.parentElement?.clientHeight ?? window.innerHeight;
    maxHeight = Math.max(MIN_HEIGHT, containerHeight - 150);
    document.body.classList.add('resizing-y');
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newHeight = Math.min(maxHeight, Math.max(MIN_HEIGHT, panelBottom - e.clientY));
    panel.style.height = newHeight + 'px';
    onDrag?.();
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.classList.remove('resizing-y');
  });

  // 双击恢复默认高度
  resizer.addEventListener('dblclick', () => {
    panel.style.height = '';
    onDrag?.();
  });
}

// ============ 编译运行任务 ============

// 任务结束等待表（编译并运行链式执行：等编译结束再运行）
const taskFinishWaiters = new Map<string, (exitCode: number | null) => void>();
// 无等待方时暂存的结束码（防止事件先于等待注册到达导致丢失）
const taskFinishedCodes = new Map<string, number | null>();

// 读取任务配置并按 项目级 > 系统级 逐字段合并，取指定类型的脚本路径
// 归一化项目级配置为列表格式（兼容旧版单条 buildScript/runScript 格式）
function normalizeProjectScripts(cfg: ProjectTaskConfig | TaskScriptConfig): { build: TaskScriptEntry[]; run: TaskScriptEntry[] } {
  const next = cfg as ProjectTaskConfig;
  if (Array.isArray(next.buildScripts) || Array.isArray(next.runScripts)) {
    return {
      build: (next.buildScripts || []).filter((e) => e && e.script && e.script.trim()),
      run: (next.runScripts || []).filter((e) => e && e.script && e.script.trim())
    };
  }
  const legacy = cfg as TaskScriptConfig;
  return {
    build: legacy.buildScript && legacy.buildScript.trim() ? [{ name: '', script: legacy.buildScript.trim() }] : [],
    run: legacy.runScript && legacy.runScript.trim() ? [{ name: '', script: legacy.runScript.trim() }] : []
  };
}

// 取指定类型的生效脚本列表：项目级列表非空优先，否则回退系统级单条
async function getEffectiveTaskScripts(kind: TaskKind): Promise<TaskScriptEntry[]> {
  const result = await window.electronAPI.getTasksConfig();
  if (!result.success || !result.config) return [];
  const cfg = result.config;
  // 项目路径键大小写不敏感匹配（Windows 盘符大小写差异）
  const key = currentProjectPath
    ? Object.keys(cfg.projects).find(k => k.toLowerCase() === currentProjectPath!.toLowerCase())
    : undefined;
  const project = key ? cfg.projects[key] : undefined;
  if (project) {
    const lists = normalizeProjectScripts(project);
    const list = kind === 'build' ? lists.build : lists.run;
    if (list.length > 0) return list;
  }
  const field = kind === 'build' ? 'buildScript' : 'runScript';
  const raw = (cfg.global[field] || '').trim();
  return raw ? [{ name: '', script: raw }] : [];
}

// 条目展示名：优先配置的名称，为空时回退脚本文件名
function entryDisplayName(entry: TaskScriptEntry): string {
  if (entry.name && entry.name.trim()) return entry.name.trim();
  return entry.script.split(/[\\/]/).pop() || entry.script;
}

// 解析脚本路径：绝对路径直接用，相对路径基于项目根拼接
function resolveScriptPath(raw: string): string | null {
  if (/^([a-zA-Z]:[\\/]|\\\\|\/)/.test(raw)) return raw;
  if (!currentProjectPath) return null;
  return `${currentProjectPath}\\${raw.replace(/^[\\/]+/, '')}`;
}

// 等待指定任务结束（兼容已结束的情况，先查暂存表）
function waitForTaskFinish(taskId: string): Promise<number | null> {
  if (taskFinishedCodes.has(taskId)) {
    const code = taskFinishedCodes.get(taskId) ?? null;
    taskFinishedCodes.delete(taskId);
    return Promise.resolve(code);
  }
  return new Promise((resolve) => {
    taskFinishWaiters.set(taskId, resolve);
  });
}

// 启动单条脚本条目的任务，返回 taskId；启动失败时本地创建任务记录展示错误
async function startTaskEntry(kind: TaskKind, entry: TaskScriptEntry, multiple: boolean): Promise<string | null> {
  const scriptPath = resolveScriptPath(entry.script.trim());
  if (!scriptPath) {
    alert('脚本路径无效，请检查编译运行配置');
    return null;
  }
  const kindLabel = kind === 'build' ? '编译' : '运行';
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  // 多脚本时在标签中带上脚本名以便区分
  const label = multiple ? `${kindLabel} ${entryDisplayName(entry)} @ ${time}` : `${kindLabel} @ ${time}`;

  // 输出面板与终端面板互斥
  toggleTaskPanel(true);

  const res = await window.electronAPI.taskRun({ kind, scriptPath, cwd: currentProjectPath!, label });
  if (!res.success || !res.taskId) {
    // 启动失败：本地创建任务记录展示错误
    const localId = `local-${Date.now()}`;
    taskPanel?.addTask(localId, label, kind);
    taskPanel?.failLocal(localId, res.error || '未知错误');
    return null;
  }
  taskPanel?.addTask(res.taskId, label, kind);
  return res.taskId;
}

// 执行单类任务（编译或运行）：多脚本时先弹窗选择；返回 taskId，未配置/取消返回 null
async function runTaskKind(kind: TaskKind): Promise<string | null> {
  if (!currentProjectPath) {
    alert('请先打开项目');
    return null;
  }
  const entries = await getEffectiveTaskScripts(kind);
  if (entries.length === 0) {
    // 未配置脚本：引导到设置面板的编译运行分区
    void settingsPanel?.show('tasks');
    return null;
  }
  let entry = entries[0];
  if (entries.length > 1) {
    const picked = await scriptPicker!.pick(kind === 'build' ? '编译' : '运行', entries, entryDisplayName);
    if (!picked) return null;
    entry = picked;
  }
  // 执行前自动保存所有文件，避免编译旧代码
  await editorPane?.saveAllFiles();
  return startTaskEntry(kind, entry, entries.length > 1);
}

// 编译并运行：依次执行全部编译脚本（逐个等待结束），再依次执行全部运行脚本（无论成败继续）
async function runBuildThenRun(): Promise<void> {
  if (!currentProjectPath) {
    alert('请先打开项目');
    return;
  }
  const builds = await getEffectiveTaskScripts('build');
  const runs = await getEffectiveTaskScripts('run');
  if (builds.length === 0 && runs.length === 0) {
    void settingsPanel?.show('tasks');
    return;
  }
  await editorPane?.saveAllFiles();

  // 编译组：逐个顺序执行，每个等待结束后再启动下一个
  for (const entry of builds) {
    const id = await startTaskEntry('build', entry, builds.length > 1);
    if (id) await waitForTaskFinish(id);
  }
  // 运行组：逐个顺序执行，最后一个无需等待
  for (let i = 0; i < runs.length; i++) {
    const id = await startTaskEntry('run', runs[i], runs.length > 1);
    if (id && i < runs.length - 1) await waitForTaskFinish(id);
  }
}

// 终端面板显隐切换
function toggleTerminalPanel(show?: boolean) {
  const panel = document.getElementById('terminal-panel')!;
  const resizer = document.getElementById('terminal-resizer')!;
  const isVisible = !panel.hidden;
  const shouldShow = show ?? !isVisible;

  if (shouldShow === isVisible) return;

  panel.hidden = !shouldShow;
  resizer.hidden = !shouldShow;
  // 同步活动栏终端按钮高亮（无论开关来源：快捷键/菜单/✕ 按钮）
  document.getElementById('btn-terminal')?.classList.toggle('active', shouldShow);

  // 终端与任务输出面板互斥：打开终端时收起输出面板（同步按钮高亮）
  if (shouldShow) {
    taskPanel?.hide();
    document.getElementById('btn-task-output')?.classList.remove('active');
  }

  if (shouldShow && !terminalPanel?.hasActiveTerminal()) {
    terminalPanel?.createNewTerminal(currentProjectPath || undefined);
  }
  if (shouldShow) {
    terminalPanel?.fitActive();
  }
}

// 任务输出面板显隐切换（与终端面板互斥，同步活动栏按钮高亮）
function toggleTaskPanel(show?: boolean) {
  if (!taskPanel) return;
  const isVisible = taskPanel.isVisible();
  const shouldShow = show ?? !isVisible;

  if (shouldShow === isVisible) return;

  if (shouldShow) {
    // 打开输出面板时收起终端
    toggleTerminalPanel(false);
    taskPanel.show();
  } else {
    taskPanel.hide();
  }
  document.getElementById('btn-task-output')?.classList.toggle('active', shouldShow);
}

// 编码选择菜单
function showEncodingMenu(filePath: string, anchor: HTMLElement) {
  const encodings = ['UTF-8', 'GBK', 'UTF-16 LE', 'UTF-16 BE', 'ISO-8859-1'];
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.position = 'fixed';

  const rect = anchor.getBoundingClientRect();
  menu.style.left = rect.left + 'px';
  menu.style.top = (rect.top - encodings.length * 30) + 'px';

  for (const enc of encodings) {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    item.textContent = enc;
    item.addEventListener('click', async () => {
      menu.remove();
      const result = await window.electronAPI.readFileWithEncoding(filePath, enc);
      if (result.success && result.content !== undefined) {
        editorPane?.setContent(result.content);
        document.getElementById('status-encoding')!.textContent = enc;
        await window.electronAPI.setFileEncoding(filePath, enc);
      } else {
        alert(`读取文件失败: ${result.error || '未知错误'}`);
      }
    });
    menu.appendChild(item);
  }

  document.body.appendChild(menu);
  setTimeout(() => {
    const close = (e: MouseEvent) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('mousedown', close);
      }
    };
    document.addEventListener('mousedown', close);
  }, 0);
}

// 启动
init();
