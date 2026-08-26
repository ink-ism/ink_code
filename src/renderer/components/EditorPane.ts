import { monaco } from '../services/monaco';
import { fileIconSvg } from '../services/icons';
import { findImportBlock } from '../services/java-language';
import { ContextMenu } from './ContextMenu';

interface OpenFile {
  path: string;
  name: string;
  model: monaco.editor.ITextModel | null; // 懒创建：延迟 tab 首次激活前为 null；关闭时立即 dispose 防泄漏
  dirty: boolean;
  viewState: monaco.editor.ICodeEditorViewState | null;
}

export class EditorPane {
  private tabBar: HTMLElement;
  private editor: monaco.editor.IStandaloneCodeEditor;
  private openFiles: OpenFile[] = [];
  // Tab 右键菜单（关闭当前/其他/已保存/全部）
  private tabContextMenu = new ContextMenu();
  private activeFileIndex: number = -1;

  public onFileChange?: (filePath: string) => void;
  public onSave?: (filePath: string, content: string) => Promise<boolean>;
  public onCursorChange?: (line: number, column: number) => void;
  public onTabsChange?: () => void;
  public onAllClosed?: () => void;
  // tab 关闭时回调（用于通知 LSP 文档关闭）
  public onCloseFile?: (filePath: string) => void;
  // 活动文件内容变化（用于 Markdown 实时预览；回调侧按需拉取内容，避免每键全量拷贝）
  public onContentChange?: () => void;
  // 延迟 tab 首次激活时按需加载内容创建 TextModel
  public onLoadContent?: (path: string) => Promise<string | null>;
  // 编辑器滚动事件（用于双栏预览滚动同步）
  public onDidScroll?: (info: { scrollTop: number; scrollHeight: number; height: number }) => void;
  // 跨文件跳转请求（LSP 定义跳转/Peek 打开其他文件时触发）
  public onOpenFileRequest?: (filePath: string, line?: number) => void;

  // 自动保存配置
  private autoSaveMode: 'off' | 'afterDelay' | 'onFocusChange' = 'off';
  private autoSaveDelay: number = 1000;
  private autoSaveTimer: number | undefined;

  constructor(tabBar: HTMLElement, editorContainer: HTMLElement, options?: { theme?: string; fontSize?: number }) {
    this.tabBar = tabBar;

    // Tab 栏垂直滚轮转横向滚动（标签多时方便浏览）
    this.tabBar.addEventListener('wheel', (e) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      this.tabBar.scrollLeft += e.deltaY;
    }, { passive: false });

    // 初始化 Monaco Editor
    this.editor = monaco.editor.create(editorContainer, {
      value: '// 打开文件开始编辑\n',
      language: 'java',
      theme: options?.theme || 'ink-java-dark',
      automaticLayout: true,
      fontSize: options?.fontSize || 14,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      // 括号配对高亮
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true }
    });

    // 绑定 Ctrl+S 保存
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      await this.saveCurrentFile();
    });

    // 监听内容变化（标记未保存）
    this.editor.onDidChangeModelContent(() => {
      this.markFileDirty();
      // 通知活动文件内容变更（预览侧按需拉取并防抖渲染）
      this.onContentChange?.();
      // 自动保存（afterDelay 模式）
      this.scheduleAutoSave();
    });

    // 监听光标位置（状态栏显示）
    this.editor.onDidChangeCursorPosition((e) => {
      this.onCursorChange?.(e.position.lineNumber, e.position.column);
    });

    // 监听滚动（双栏预览同步）
    this.editor.onDidScrollChange((e) => {
      this.onDidScroll?.({
        scrollTop: e.scrollTop,
        scrollHeight: e.scrollHeight,
        height: this.editor.getLayoutInfo().height
      });
    });

    // 拦截跨文件跳转（Ctrl+Click / F12 跳到未打开的文件）：交给应用自己的 tab 系统打开
    // 同文件内的跳转必须放行（返回 false），否则光标不会移动
    monaco.editor.registerEditorOpener({
      openCodeEditor: (_source, resource, selectionOrPosition) => {
        const currentModel = this.editor.getModel();
        if (currentModel && currentModel.uri.toString() === resource.toString()) {
          return false;
        }
        const filePath = resource.fsPath;
        let line: number | undefined;
        if (selectionOrPosition && monaco.Range.isIRange(selectionOrPosition)) {
          line = (selectionOrPosition as monaco.IRange).startLineNumber;
        } else if (selectionOrPosition && monaco.Position.isIPosition(selectionOrPosition)) {
          line = (selectionOrPosition as monaco.IPosition).lineNumber;
        }
        this.onOpenFileRequest?.(filePath, line);
        return true;
      }
    });
  }

  openFile(path: string, name: string, content: string) {
    // 检查是否已打开（含延迟 tab：就地补充内容实例化）
    const existingIndex = this.openFiles.findIndex(f => f.path.toLowerCase() === path.toLowerCase());
    if (existingIndex >= 0) {
      const existing = this.openFiles[existingIndex];
      if (!existing.model) {
        existing.model = monaco.editor.createModel(content, this.getLanguage(name), monaco.Uri.file(existing.path));
      }
      void this.activateTab(existingIndex);
      return;
    }

    // 创建新的 TextModel（带文件 URI，LSP 依赖它关联 didOpen 文档）
    const language = this.getLanguage(name);
    const model = monaco.editor.createModel(content, language, monaco.Uri.file(path));
    
    this.openFiles.push({ path, name, model, dirty: false, viewState: null });
    this.renderTabs();
    void this.activateTab(this.openFiles.length - 1);
  }

  // 延迟 tab：仅登记元数据，不创建 TextModel（会话恢复用，点击时再加载）
  addTabDeferred(path: string, name: string) {
    if (this.openFiles.some(f => f.path === path)) return;
    this.openFiles.push({ path, name, model: null, dirty: false, viewState: null });
    this.renderTabs();
  }

  // 按需加载内容并创建 TextModel，失败返回 null
  private async ensureModel(file: OpenFile): Promise<monaco.editor.ITextModel | null> {
    if (file.model) return file.model;
    const content = await this.onLoadContent?.(file.path);
    if (content == null) return null;
    if (!file.model) {
      file.model = monaco.editor.createModel(content, this.getLanguage(file.name), monaco.Uri.file(file.path));
    }
    return file.model;
  }

  // 保存当前显示 model 对应 tab 的视图状态（光标/滚动/折叠）
  private saveCurrentViewState() {
    const model = this.editor.getModel();
    if (!model) return;
    const file = this.openFiles.find(f => f.model === model);
    if (file) {
      file.viewState = this.editor.saveViewState();
    }
  }

  private async activateTab(index: number) {
    // 切换 tab 前触发 onFocusChange 自动保存
    this.triggerAutoSaveOnFocusChange();
    this.saveCurrentViewState();
    this.activeFileIndex = index;
    const file = this.openFiles[index];

    const model = await this.ensureModel(file);
    // await 期间用户可能切走/关 tab，仅当仍是活动项时才挂载
    if (!model || this.openFiles[this.activeFileIndex] !== file) return;

    this.editor.setModel(model);
    if (file.viewState) {
      // 恢复折叠/滚动/光标状态
      this.editor.restoreViewState(file.viewState);
    } else {
      // 首次打开：Java 文件自动折叠 import 块
      this.autoFoldImports(file);
    }
    this.renderTabs();
    this.onFileChange?.(file.path);
  }

  // 自动折叠 import 块（延迟等待折叠范围计算完成）
  private autoFoldImports(file: OpenFile) {
    if (this.getLanguage(file.name) !== 'java' || !file.model) return;
    const block = findImportBlock(file.model);
    if (!block) return;
    setTimeout(() => {
      if (this.editor.getModel() !== file.model) return;
      this.editor.trigger('auto-fold-imports', 'editor.fold', {
        selectionLines: [block.start - 1],
        direction: 'up'
      });
    }, 120);
  }

  async closeTab(index: number, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    // 未保存文件关闭前确认
    const file = this.openFiles[index];
    if (file.dirty && !confirm(`“${file.name}” 有未保存的修改，确定关闭吗？`)) {
      return;
    }

    await this.removeTab(index);
  }

  // 内部：直接关闭指定下标的 tab（无未保存确认，由调用方保证）
  private async removeTab(index: number) {
    const file = this.openFiles[index];
    const prevActive = this.activeFileIndex >= 0 ? this.openFiles[this.activeFileIndex] : null;
    this.saveCurrentViewState();
    this.openFiles.splice(index, 1);

    // 通知外部文件已关闭（LSP didClose）
    this.onCloseFile?.(file.path);

    if (this.openFiles.length === 0) {
      this.activeFileIndex = -1;
      this.editor.setModel(null);
    } else if (index <= this.activeFileIndex) {
      this.activeFileIndex = Math.max(0, this.activeFileIndex - 1);
      const next = this.openFiles[this.activeFileIndex];
      const model = await this.ensureModel(next);
      // await 后目标 tab 仍是活动项才挂载
      if (model && this.openFiles[this.activeFileIndex] === next) {
        this.editor.setModel(model);
        if (next.viewState) {
          this.editor.restoreViewState(next.viewState);
        }
      }
    }

    // 编辑器已卸载旧 model 后释放 TextModel，避免开关 tab 泄漏累积
    file.model?.dispose();

    this.renderTabs();
    // 仅当活动文件实际变化时通知（批量关闭时避免重复重算大纲）
    const newActive = this.activeFileIndex >= 0 ? this.openFiles[this.activeFileIndex] : null;
    if (!newActive) {
      this.onAllClosed?.();
    } else if (newActive !== prevActive) {
      this.onFileChange?.(newActive.path);
    }
  }

  // 批量关闭 tab（下标集合），含未保存文件时整体确认一次
  private async bulkCloseTabs(indexes: number[]) {
    if (indexes.length === 0) return;
    const dirtyCount = indexes.filter(i => this.openFiles[i]?.dirty).length;
    if (dirtyCount > 0 && !confirm(`有 ${dirtyCount} 个文件未保存，确定关闭吗？`)) return;
    // 降序关闭避免下标偏移
    for (const i of [...indexes].sort((a, b) => b - a)) {
      await this.removeTab(i);
    }
  }

  // 关闭其他（保留指定 tab）
  private async closeOthers(index: number) {
    const indexes = this.openFiles.map((_, i) => i).filter(i => i !== index);
    await this.bulkCloseTabs(indexes);
  }

  // 关闭所有已保存的 tab
  private async closeSavedTabs() {
    const indexes = this.openFiles.flatMap((f, i) => f.dirty ? [] : [i]);
    await this.bulkCloseTabs(indexes);
  }

  // 关闭全部 tab
  private async closeAllTabs() {
    await this.bulkCloseTabs(this.openFiles.map((_, i) => i));
  }

  // Tab 右键菜单
  private showTabContextMenu(index: number, x: number, y: number) {
    const hasSaved = this.openFiles.some(f => !f.dirty);
    this.tabContextMenu.show(x, y, [
      { label: '关闭当前', action: () => { void this.closeTab(index); } },
      { label: '关闭其他', disabled: this.openFiles.length <= 1, action: () => { void this.closeOthers(index); } },
      { separator: true },
      { label: '关闭已保存', disabled: !hasSaved, action: () => { void this.closeSavedTabs(); } },
      { label: '关闭全部', action: () => { void this.closeAllTabs(); } }
    ]);
  }

  private async saveCurrentFile() {
    if (this.activeFileIndex < 0) return;
    
    const file = this.openFiles[this.activeFileIndex];
    if (!file.model) return;
    const content = file.model.getValue();
    
    if (this.onSave) {
      const success = await this.onSave(file.path, content);
      if (success) {
        this.markFileClean();
      }
    }
  }

  private markFileDirty() {
    if (this.activeFileIndex >= 0) {
      this.openFiles[this.activeFileIndex].dirty = true;
    }
    this.renderTabs();
  }

  private markFileClean() {
    if (this.activeFileIndex >= 0) {
      this.openFiles[this.activeFileIndex].dirty = false;
    }
    this.renderTabs();
  }

  goToLine(line: number) {
    this.editor.revealLineInCenter(line);
    this.editor.setPosition({ lineNumber: line, column: 1 });
    this.editor.focus();
  }

  // 切换主题
  setTheme(theme: string) {
    monaco.editor.setTheme(theme);
  }

  // 调整字体大小
  setFontSize(size: number) {
    this.editor.updateOptions({ fontSize: size });
  }

  // 获取会话状态（用于启动恢复）
  getSessionState() {
    return {
      openFiles: this.openFiles.map(f => ({ path: f.path, name: f.name })),
      activeFile: this.activeFileIndex >= 0 ? this.openFiles[this.activeFileIndex].path : null
    };
  }

  // 当前文件总行数
  getLineCount(): number {
    return this.editor.getModel()?.getLineCount() ?? 0;
  }

  /**
   * 获取当前活动文件信息（用于预览等外部组件）
   * 无活动文件时返回 null
   */
  getActiveFileInfo(): { path: string; name: string; language: string; content: string } | null {
    if (this.activeFileIndex < 0) return null;
    const file = this.openFiles[this.activeFileIndex];
    return {
      path: file.path,
      name: file.name,
      language: this.getLanguage(file.name),
      content: file.model?.getValue() ?? ''
    };
  }

  // 当前活动文件语言（轻量，不读取内容）
  getActiveLanguage(): string | null {
    if (this.activeFileIndex < 0) return null;
    return this.getLanguage(this.openFiles[this.activeFileIndex].name);
  }

  // 当前活动文件路径（轻量，不读取内容）
  getActivePath(): string | null {
    if (this.activeFileIndex < 0) return null;
    return this.openFiles[this.activeFileIndex].path;
  }

  // 设置编辑器滚动位置（预览同步用）
  setScrollTop(top: number) {
    this.editor.setScrollTop(top);
  }

  // 编辑器滚动度量（预览同步用）
  getScrollMetrics(): { scrollTop: number; scrollHeight: number; height: number } {
    return {
      scrollTop: this.editor.getScrollTop(),
      scrollHeight: this.editor.getScrollHeight(),
      height: this.editor.getLayoutInfo().height
    };
  }

  // 设置自动保存模式
  setAutoSave(mode: 'off' | 'afterDelay' | 'onFocusChange', delay?: number) {
    this.autoSaveMode = mode;
    if (delay !== undefined) this.autoSaveDelay = delay;
  }

  // 调度自动保存（afterDelay 模式）
  private scheduleAutoSave() {
    if (this.autoSaveMode !== 'afterDelay') return;
    window.clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = window.setTimeout(() => {
      void this.saveCurrentFile();
    }, this.autoSaveDelay);
  }

  // 失焦时触发自动保存（onFocusChange 模式）
  triggerAutoSaveOnFocusChange() {
    if (this.autoSaveMode === 'onFocusChange') {
      void this.saveCurrentFile();
    }
  }

  // 重新加载当前文件内容（外部变更检测用）
  async reloadContent(content: string) {
    const model = this.editor.getModel();
    if (!model || this.activeFileIndex < 0) return;
    model.setValue(content);
    this.markFileClean();
  }

  // 获取当前活动文件路径
  getActiveFilePath(): string | null {
    if (this.activeFileIndex < 0) return null;
    return this.openFiles[this.activeFileIndex].path;
  }

  // 获取当前光标信息（路径/行列/光标处单词，用于查找引用）
  getCursorInfo(): { path: string; line: number; column: number; word: string } | null {
    if (this.activeFileIndex < 0) return null;
    const pos = this.editor.getPosition();
    const model = this.editor.getModel();
    if (!pos || !model) return null;
    const word = model.getWordAtPosition(pos)?.word || '';
    return {
      path: this.openFiles[this.activeFileIndex].path,
      line: pos.lineNumber,
      column: pos.column,
      word
    };
  }

  // 当前文件是否未保存
  isDirty(): boolean {
    if (this.activeFileIndex < 0) return false;
    return this.openFiles[this.activeFileIndex].dirty;
  }

  // 设置 Tab 缩进宽度
  setTabSize(size: number) {
    this.editor.updateOptions({ tabSize: size });
  }

  // 设置自动换行
  setWordWrap(wrap: 'off' | 'on') {
    this.editor.updateOptions({ wordWrap: wrap });
  }

  // 设置小地图显隐
  setMinimap(enabled: boolean) {
    this.editor.updateOptions({ minimap: { enabled } });
  }

  // 检查文件是否已打开（大小写不敏感，LSP 跳转返回的路径盘符可能小写）
  isFileOpen(filePath: string): boolean {
    return this.openFiles.some(f => f.path.toLowerCase() === filePath.toLowerCase());
  }

  // 检查指定文件是否有未保存修改
  isFileDirty(filePath: string): boolean {
    const file = this.openFiles.find(f => f.path.toLowerCase() === filePath.toLowerCase());
    return file?.dirty ?? false;
  }

  // 重新加载指定文件内容（外部变更检测用）
  async reloadFile(filePath: string) {
    const file = this.openFiles.find(f => f.path.toLowerCase() === filePath.toLowerCase());
    if (!file || !file.model) return;
    const content = await this.onLoadContent?.(filePath);
    if (content != null) {
      file.model.setValue(content);
      file.dirty = false;
      this.renderTabs();
    }
  }

  // 设置当前活动文件内容（编码切换用）
  setContent(content: string) {
    const model = this.editor.getModel();
    if (model) {
      model.setValue(content);
    }
  }

  // 获取当前活动文件内容
  getContent(): string {
    return this.editor.getModel()?.getValue() ?? '';
  }

  // 保存当前活动文件
  async saveActiveFile() {
    await this.saveCurrentFile();
  }

  // 保存所有文件
  async saveAllFiles() {
    for (let i = 0; i < this.openFiles.length; i++) {
      const file = this.openFiles[i];
      if (file.dirty && file.model) {
        const content = file.model.getValue();
        if (this.onSave) {
          const success = await this.onSave(file.path, content);
          if (success) {
            file.dirty = false;
          }
        }
      }
    }
    this.renderTabs();
  }

  private renderTabs() {
    this.tabBar.replaceChildren();
    
    this.openFiles.forEach((file, index) => {
      const tab = document.createElement('div');
      tab.className = 'tab' + (index === this.activeFileIndex ? ' active' : '') + (file.dirty ? ' dirty' : '');

      const icon = document.createElement('span');
      icon.className = 'tab-icon';
      icon.innerHTML = fileIconSvg(file.name);
      tab.appendChild(icon);

      const name = document.createElement('span');
      name.className = 'tab-name';
      name.textContent = file.name;
      name.title = file.path;
      tab.appendChild(name);

      const closeBtn = document.createElement('span');
      closeBtn.className = 'tab-close';
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', (e) => { void this.closeTab(index, e); });
      tab.appendChild(closeBtn);

      tab.addEventListener('click', () => { void this.activateTab(index); });
      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showTabContextMenu(index, e.clientX, e.clientY);
      });
      this.tabBar.appendChild(tab);
    });

    // 活动标签滚入可见区域（标签过多时避免当前文件标签藏在视野外）
    const activeTab = this.tabBar.children[this.activeFileIndex] as HTMLElement | undefined;
    activeTab?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  private getLanguage(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'java': return 'java';
      case 'js': return 'javascript';
      case 'ts': return 'typescript';
      case 'json': return 'json';
      case 'xml': return 'xml';
      case 'html': return 'html';
      case 'css': return 'css';
      case 'md': return 'markdown';
      case 'markdown': return 'markdown';
      case 'sql': return 'sql';
      case 'py': return 'python';
      case 'go': return 'go';
      case 'bat': return 'bat';
      case 'cmd': return 'bat';
      case 'sh': return 'shell';
      case 'bash': return 'shell';
      case 'ps1': return 'powershell';
      case 'yml': return 'yaml';
      case 'yaml': return 'yaml';
      case 'properties': return 'properties';
      case 'ini': return 'ini';
      case 'conf': return 'ini';
      default: return 'plaintext';
    }
  }
}
