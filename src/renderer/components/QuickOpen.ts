/**
 * 快速打开文件弹窗（Ctrl+P）
 * 按文件名/路径模糊匹配，↑↓ 选择，Enter 打开，Esc 关闭
 */
export class QuickOpen {
  private overlay: HTMLElement;
  private input: HTMLInputElement;
  private list: HTMLElement;
  private files: string[] = [];
  private filtered: string[] = [];
  private selectedIndex = 0;
  private onPick?: (relPath: string) => void;

  constructor(onPick: (relPath: string) => void) {
    this.onPick = onPick;

    this.overlay = document.createElement('div');
    this.overlay.id = 'quickopen-overlay';
    this.overlay.hidden = true;

    const dialog = document.createElement('div');
    dialog.className = 'quickopen-dialog';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = '按文件名搜索（Ctrl+P）';
    this.input.className = 'quickopen-input';

    this.list = document.createElement('div');
    this.list.className = 'quickopen-list';

    dialog.appendChild(this.input);
    dialog.appendChild(this.list);
    this.overlay.appendChild(dialog);
    document.body.appendChild(this.overlay);

    this.input.addEventListener('input', () => this.update());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filtered.length - 1);
        this.render();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.render();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.pick();
      } else if (e.key === 'Escape') {
        this.hide();
      }
    });

    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.hide();
    });
  }

  setFiles(files: string[]) {
    this.files = files;
  }

  show() {
    this.overlay.hidden = false;
    this.input.value = '';
    this.selectedIndex = 0;
    this.update();
    this.input.focus();
  }

  hide() {
    this.overlay.hidden = true;
  }

  private update() {
    const q = this.input.value.trim();
    if (!q) {
      // 空输入显示前 50 个文件
      this.filtered = this.files.slice(0, 50);
    } else {
      this.filtered = this.files
        .map(f => ({ f, s: this.score(f, q) }))
        .filter(x => x.s >= 0)
        .sort((a, b) => a.s - b.s)
        .slice(0, 50)
        .map(x => x.f);
    }
    this.selectedIndex = 0;
    this.render();
  }

  // 匹配打分，越小越优先；-1 为不匹配
  private score(path: string, q: string): number {
    const lower = path.toLowerCase();
    const ql = q.toLowerCase();
    const base = (path.split('/').pop() || '').toLowerCase();

    if (base.startsWith(ql)) return 0;
    if (base.includes(ql)) return 1;
    if (lower.includes(ql)) return 2;

    // 子序列匹配
    let i = 0;
    for (const ch of lower) {
      if (ch === ql[i]) i++;
      if (i === ql.length) break;
    }
    return i === ql.length ? 3 : -1;
  }

  private pick() {
    const rel = this.filtered[this.selectedIndex];
    if (!rel) return;
    this.hide();
    this.onPick?.(rel);
  }

  private render() {
    this.list.replaceChildren();
    this.filtered.forEach((f, i) => {
      const item = document.createElement('div');
      item.className = 'quickopen-item' + (i === this.selectedIndex ? ' selected' : '');

      const name = document.createElement('span');
      name.className = 'quickopen-item-name';
      name.textContent = f.split('/').pop() || f;

      const path = document.createElement('span');
      path.className = 'quickopen-item-path';
      path.textContent = f;

      item.appendChild(name);
      item.appendChild(path);
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.selectedIndex = i;
        this.pick();
      });
      this.list.appendChild(item);
    });
  }
}
