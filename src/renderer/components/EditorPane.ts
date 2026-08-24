import * as monaco from 'monaco-editor';
import { fileIconSvg } from '../services/icons';
import { findImportBlock } from '../services/java-language';

interface OpenFile {
  path: string;
  name: string;
  model: monaco.editor.ITextModel;
  dirty: boolean;
  viewState: monaco.editor.ICodeEditorViewState | null;
}

export class EditorPane {
  private tabBar: HTMLElement;
  private editor: monaco.editor.IStandaloneCodeEditor;
  private openFiles: OpenFile[] = [];
  private activeFileIndex: number = -1;

  public onFileChange?: (filePath: string) => void;
  public onSave?: (filePath: string, content: string) => Promise<boolean>;
  public onCursorChange?: (line: number, column: number) => void;
  public onTabsChange?: () => void;
  public onAllClosed?: () => void;
  // 活动文件内容变化（用于 Markdown 实时预览）
  public onContentChange?: (content: string) => void;
  // 编辑器滚动事件（用于双栏预览滚动同步）
  public onDidScroll?: (info: { scrollTop: number; scrollHeight: number; height: number }) => void;

  constructor(tabBar: HTMLElement, editorContainer: HTMLElement, options?: { theme?: string; fontSize?: number }) {
    this.tabBar = tabBar;

    // 初始化 Monaco Editor
    this.editor = monaco.editor.create(editorContainer, {
      value: '// 打开文件开始编辑\n',
      language: 'java',
      theme: options?.theme || 'ink-java-dark',
      automaticLayout: true,
      fontSize: options?.fontSize || 14,
      minimap: { enabled: true },
      scrollBeyondLastLine: false
    });

    // 绑定 Ctrl+S 保存
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      await this.saveCurrentFile();
    });

    // 监听内容变化（标记未保存）
    this.editor.onDidChangeModelContent(() => {
      this.markFileDirty();
      // 通知活动文件内容变更（预览等场景）
      this.onContentChange?.(this.editor.getModel()?.getValue() ?? '');
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
  }

  openFile(path: string, name: string, content: string) {
    // 检查是否已打开
    const existingIndex = this.openFiles.findIndex(f => f.path === path);
    if (existingIndex >= 0) {
      this.activateTab(existingIndex);
      return;
    }

    // 创建新的 TextModel
    const language = this.getLanguage(name);
    const model = monaco.editor.createModel(content, language);
    
    this.openFiles.push({ path, name, model, dirty: false, viewState: null });
    this.renderTabs();
    this.activateTab(this.openFiles.length - 1);
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

  private activateTab(index: number) {
    this.saveCurrentViewState();
    this.activeFileIndex = index;
    const file = this.openFiles[index];

    this.editor.setModel(file.model);
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
    if (this.getLanguage(file.name) !== 'java') return;
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

  closeTab(index: number, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    // 未保存文件关闭前确认
    const file = this.openFiles[index];
    if (file.dirty && !confirm(`“${file.name}” 有未保存的修改，确定关闭吗？`)) {
      return;
    }

    this.saveCurrentViewState();
    this.openFiles.splice(index, 1);
    
    if (this.openFiles.length === 0) {
      this.activeFileIndex = -1;
      this.editor.setModel(null);
    } else if (index <= this.activeFileIndex) {
      this.activeFileIndex = Math.max(0, this.activeFileIndex - 1);
      const next = this.openFiles[this.activeFileIndex];
      this.editor.setModel(next.model);
      if (next.viewState) {
        this.editor.restoreViewState(next.viewState);
      }
    }

    this.renderTabs();
    if (this.activeFileIndex >= 0) {
      this.onFileChange?.(this.openFiles[this.activeFileIndex].path);
    } else {
      this.onAllClosed?.();
    }
  }

  private async saveCurrentFile() {
    if (this.activeFileIndex < 0) return;
    
    const file = this.openFiles[this.activeFileIndex];
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
      content: file.model.getValue()
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
      closeBtn.addEventListener('click', (e) => this.closeTab(index, e));
      tab.appendChild(closeBtn);

      tab.addEventListener('click', () => this.activateTab(index));
      this.tabBar.appendChild(tab);
    });
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
      default: return 'plaintext';
    }
  }
}
