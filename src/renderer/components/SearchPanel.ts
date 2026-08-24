import { SearchMatch } from '../../common/types';

/**
 * 全局搜索弹窗（Ctrl+Shift+F）
 * 跨文件包含匹配，结果按文件分组，点击跳转
 */
export class SearchPanel {
  private overlay: HTMLElement;
  private input: HTMLInputElement;
  private status: HTMLElement;
  private results: HTMLElement;
  private root: string | null = null;
  private debounceTimer: number | undefined;
  private onPick?: (file: string, line: number) => void;

  constructor(onPick: (file: string, line: number) => void) {
    this.onPick = onPick;

    this.overlay = document.createElement('div');
    this.overlay.id = 'search-overlay';
    this.overlay.hidden = true;

    const dialog = document.createElement('div');
    dialog.className = 'search-dialog';

    const header = document.createElement('div');
    header.className = 'search-header';
    header.textContent = '全局搜索';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = '在项目文件中搜索（Enter 立即搜索）';
    this.input.className = 'search-input';

    this.status = document.createElement('div');
    this.status.className = 'search-status';

    this.results = document.createElement('div');
    this.results.className = 'search-results';

    dialog.appendChild(header);
    dialog.appendChild(this.input);
    dialog.appendChild(this.status);
    dialog.appendChild(this.results);
    this.overlay.appendChild(dialog);
    document.body.appendChild(this.overlay);

    // 输入防抖搜索
    this.input.addEventListener('input', () => {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => this.doSearch(), 400);
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        window.clearTimeout(this.debounceTimer);
        this.doSearch();
      } else if (e.key === 'Escape') {
        this.hide();
      }
    });

    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.hide();
    });
  }

  setRoot(root: string | null) {
    this.root = root;
  }

  show() {
    this.overlay.hidden = false;
    this.input.focus();
    this.input.select();
  }

  hide() {
    this.overlay.hidden = true;
  }

  private async doSearch() {
    const query = this.input.value.trim();
    if (!query || !this.root) {
      this.results.replaceChildren();
      this.status.textContent = '';
      return;
    }

    this.status.textContent = '搜索中…';
    this.results.replaceChildren();

    const result = await window.electronAPI.searchProject(this.root, query);
    if (!result.success || !result.matches) {
      this.status.textContent = `搜索失败: ${result.error || '未知错误'}`;
      return;
    }

    const matches = result.matches as SearchMatch[];
    this.status.textContent = `${matches.length} 个匹配`;

    // 按文件分组
    const groups = new Map<string, SearchMatch[]>();
    for (const m of matches) {
      const arr = groups.get(m.file) || [];
      arr.push(m);
      groups.set(m.file, arr);
    }

    this.results.replaceChildren();
    for (const [file, fileMatches] of groups) {
      const group = document.createElement('div');
      group.className = 'search-group';

      const title = document.createElement('div');
      title.className = 'search-group-title';
      title.textContent = `${file.split(/[/\\]/).pop()}  (${fileMatches.length})`;
      title.title = file;
      group.appendChild(title);

      for (const m of fileMatches) {
        const item = document.createElement('div');
        item.className = 'search-match';

        const lineNo = document.createElement('span');
        lineNo.className = 'search-match-line';
        lineNo.textContent = String(m.line);

        const text = document.createElement('span');
        text.className = 'search-match-text';
        text.textContent = m.text;

        item.appendChild(lineNo);
        item.appendChild(text);
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.hide();
          this.onPick?.(m.file, m.line);
        });
        group.appendChild(item);
      }

      this.results.appendChild(group);
    }
  }
}
