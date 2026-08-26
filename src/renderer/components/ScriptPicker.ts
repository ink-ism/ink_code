import { TaskScriptEntry } from '../../common/types';

/**
 * 脚本选择弹窗：配置了多个编译/运行脚本时，执行前弹出列表供选择。
 * 支持鼠标点击、上下方向键 + Enter 确认、Esc / 点击遮罩取消。
 */
export class ScriptPicker {
  private overlay: HTMLElement;
  private listEl: HTMLElement;
  private titleEl: HTMLElement;
  private entries: TaskScriptEntry[] = [];
  private selectedIndex = 0;
  private resolver: ((entry: TaskScriptEntry | null) => void) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'script-picker-overlay';
    this.overlay.hidden = true;
    this.overlay.innerHTML = `
      <div class="script-picker-dialog">
        <div class="script-picker-title">选择脚本</div>
        <div class="script-picker-list"></div>
        <div class="script-picker-footer">Enter 确认 · Esc 取消</div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    this.titleEl = this.overlay.querySelector('.script-picker-title')!;
    this.listEl = this.overlay.querySelector('.script-picker-list')!;

    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.resolve(null);
    });
  }

  /**
   * 弹出选择列表，返回选中的条目；取消返回 null
   * @param kindLabel 标题前缀（如"编译"/"运行"）
   * @param entries 候选脚本列表（长度 > 1 时才会调用本方法）
   * @param displayName 条目展示名解析（名称为空时回退文件名）
   */
  pick(kindLabel: string, entries: TaskScriptEntry[], displayName: (e: TaskScriptEntry) => string): Promise<TaskScriptEntry | null> {
    this.entries = entries;
    this.selectedIndex = 0;
    this.titleEl.textContent = `选择${kindLabel}脚本`;

    this.listEl.innerHTML = '';
    entries.forEach((entry, index) => {
      const item = document.createElement('div');
      item.className = 'script-picker-item';
      const nameEl = document.createElement('div');
      nameEl.className = 'script-picker-item-name';
      nameEl.textContent = displayName(entry);
      const pathEl = document.createElement('div');
      pathEl.className = 'script-picker-item-path';
      pathEl.textContent = entry.script;
      item.appendChild(nameEl);
      item.appendChild(pathEl);
      item.addEventListener('click', () => this.resolve(entry));
      item.addEventListener('mousemove', () => this.setSelected(index));
      this.listEl.appendChild(item);
    });
    this.setSelected(0);

    this.overlay.hidden = false;
    document.addEventListener('keydown', this.onKeyDown, true);

    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.resolve(null);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      this.resolve(this.entries[this.selectedIndex] ?? null);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.setSelected(Math.min(this.selectedIndex + 1, this.entries.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.setSelected(Math.max(this.selectedIndex - 1, 0));
    }
  };

  private setSelected(index: number) {
    this.selectedIndex = index;
    this.listEl.querySelectorAll('.script-picker-item').forEach((el, i) => {
      el.classList.toggle('selected', i === index);
      if (i === index) el.scrollIntoView({ block: 'nearest' });
    });
  }

  private resolve(entry: TaskScriptEntry | null) {
    document.removeEventListener('keydown', this.onKeyDown, true);
    this.overlay.hidden = true;
    const resolver = this.resolver;
    this.resolver = null;
    resolver?.(entry);
  }
}
