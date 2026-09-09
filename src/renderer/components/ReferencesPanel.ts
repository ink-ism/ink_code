/**
 * 引用查找结果面板
 * 展示 Find All References 的结果
 */
import { LspLocation } from '../../common/types';

export interface ReferenceItem {
  filePath: string;
  line: number;
  character: number;
  context?: string;  // 上下文行内容
}

export class ReferencesPanel {
  private container: HTMLElement;
  private titleEl: HTMLElement;
  private listEl: HTMLElement;
  // 拖拽分隔条：约定为面板在 DOM 中的前一个兄弟元素（见 index.html）
  private resizer: HTMLElement | null;
  private onPick?: (filePath: string, line: number) => void;
  // 面板隐藏时的回调（用于同步活动栏按钮状态）
  public onHide?: () => void;

  constructor(container: HTMLElement, onPick?: (filePath: string, line: number) => void) {
    this.container = container;
    this.onPick = onPick;
    this.resizer = container.previousElementSibling instanceof HTMLElement
      ? container.previousElementSibling
      : null;

    const header = document.createElement('div');
    header.className = 'panel-header references-header';

    this.titleEl = document.createElement('span');
    this.titleEl.textContent = '引用';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'git-icon-btn';
    closeBtn.textContent = '✕';
    closeBtn.title = '关闭';
    closeBtn.addEventListener('click', () => this.hide());

    header.append(this.titleEl, closeBtn);

    this.listEl = document.createElement('div');
    this.listEl.className = 'references-list';

    this.container.append(header, this.listEl);
    this.container.hidden = true;
  }

  show(references: ReferenceItem[], symbolName: string) {
    this.container.hidden = false;
    if (this.resizer) this.resizer.hidden = false;
    this.titleEl.textContent = `引用 (${references.length}) — ${symbolName}`;
    this.render(references);
  }

  hide() {
    this.container.hidden = true;
    if (this.resizer) this.resizer.hidden = true;
    this.onHide?.();
  }

  private render(references: ReferenceItem[]) {
    this.listEl.replaceChildren();

    if (references.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'references-empty';
      empty.textContent = '未找到引用';
      this.listEl.appendChild(empty);
      return;
    }

    // 按文件分组
    const groups = new Map<string, ReferenceItem[]>();
    for (const ref of references) {
      const arr = groups.get(ref.filePath) || [];
      arr.push(ref);
      groups.set(ref.filePath, arr);
    }

    for (const [filePath, refs] of groups) {
      const group = document.createElement('div');
      group.className = 'references-group';

      const fileHeader = document.createElement('div');
      fileHeader.className = 'references-file';
      fileHeader.textContent = filePath.split(/[\\/]/).pop() || filePath;
      fileHeader.title = filePath;
      group.appendChild(fileHeader);

      for (const ref of refs) {
        const row = document.createElement('div');
        row.className = 'references-row';

        const lineNo = document.createElement('span');
        lineNo.className = 'references-line';
        lineNo.textContent = `${ref.line}:${ref.character}`;

        const context = document.createElement('span');
        context.className = 'references-context';
        context.textContent = ref.context || '';

        row.append(lineNo, context);
        row.addEventListener('click', () => {
          this.onPick?.(ref.filePath, ref.line);
        });

        group.appendChild(row);
      }

      this.listEl.appendChild(group);
    }
  }
}
