import { monaco } from '../services/monaco';

export interface DiffViewerRequest {
  title: string;          // 弹窗标题（含路径与对比说明）
  originalLabel: string;  // 左侧标签（如 HEAD / 暂存区）
  modifiedLabel: string;  // 右侧标签（如 工作区 / 提交）
  original: string;
  modified: string;
  language: string;
}

// 按扩展名推断 Monaco 语言（与 EditorPane 保持一致的常用子集）
export function detectLanguage(fileName: string): string {
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
    case 'ini': return 'ini';
    case 'properties': return 'properties';
    default: return 'plaintext';
  }
}

/**
 * Diff 查看弹窗：全屏遮罩 + Monaco diff 编辑器（只读）。
 * 每次打开重建 model，关闭时立即 dispose，避免 TextModel 泄漏。
 */
export class DiffViewer {
  private overlay: HTMLElement;
  private titleEl: HTMLElement;
  private labelEl: HTMLElement;
  private editorEl: HTMLElement;
  private diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;
  private models: monaco.editor.ITextModel[] = [];
  private pendingReq: DiffViewerRequest | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'diff-overlay';
    this.overlay.hidden = true;

    const box = document.createElement('div');
    box.className = 'diff-box';

    const header = document.createElement('div');
    header.className = 'diff-header';

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'diff-title';

    this.labelEl = document.createElement('div');
    this.labelEl.className = 'diff-labels';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'git-icon-btn diff-close';
    closeBtn.textContent = '✕';
    closeBtn.title = '关闭（Esc）';
    closeBtn.addEventListener('click', () => this.hide());

    header.append(this.titleEl, this.labelEl, closeBtn);

    this.editorEl = document.createElement('div');
    this.editorEl.className = 'diff-editor';

    box.append(header, this.editorEl);
    this.overlay.appendChild(box);
    document.body.appendChild(this.overlay);

    // Esc 关闭
    this.overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.hide();
      }
    });
  }

  show(req: DiffViewerRequest) {
    this.titleEl.textContent = req.title;
    this.titleEl.title = req.title;
    this.labelEl.textContent = `${req.originalLabel} ⟷ ${req.modifiedLabel}`;

    // 先显示遮罩，等下一帧容器有实际尺寸后再创建编辑器/设置 model：
    // display:none 下创建 diff 编辑器会因内部 viewModel 未就绪
    // 报 coordinatesConverter 空错，且组件会损坏为空白
    this.pendingReq = req;
    this.overlay.hidden = false;
    this.overlay.tabIndex = -1;
    this.overlay.focus();
    requestAnimationFrame(() => this.applyPending());
  }

  private applyPending() {
    const req = this.pendingReq;
    this.pendingReq = null;
    if (!req || this.overlay.hidden) return;

    if (!this.diffEditor) {
      this.diffEditor = monaco.editor.createDiffEditor(this.editorEl, {
        readOnly: true,
        renderSideBySide: true,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        fontSize: 13
      });
    }

    // 重建 model：先挂新 model 再释放旧的，
    // 避免编辑器引用被 dispose 的 model 导致 viewModel 空错
    const oldModels = this.models;
    const original = monaco.editor.createModel(req.original, req.language);
    const modified = monaco.editor.createModel(req.modified, req.language);
    this.models = [original, modified];
    this.diffEditor.setModel({ original, modified });
    for (const m of oldModels) {
      m.dispose();
    }
    this.diffEditor.layout();
  }

  hide() {
    this.overlay.hidden = true;
    // 先摘除 model 再释放：直接 dispose 会使编辑器 viewModel 置空，
    // 下次显示时 diff 对齐计算报 coordinatesConverter 空错并损坏组件
    this.diffEditor?.setModel(null);
    this.disposeModels();
  }

  private disposeModels() {
    for (const m of this.models) {
      m.dispose();
    }
    this.models = [];
  }
}
