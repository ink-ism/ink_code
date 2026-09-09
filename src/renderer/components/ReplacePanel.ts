/**
 * 全局搜索替换面板（Ctrl+H）
 * 在 SearchPanel 基础上扩展替换功能
 */
import { SearchMatch, SearchReplaceOptions, SearchReplaceResult } from '../../common/types';

export class ReplacePanel {
  private overlay: HTMLElement;
  private input: HTMLInputElement;
  private replaceInput: HTMLInputElement;
  private status: HTMLElement;
  private results: HTMLElement;
  private regexToggle: HTMLButtonElement;
  private caseToggle: HTMLButtonElement;
  private wholeWordToggle: HTMLButtonElement;
  private root: string | null = null;
  private debounceTimer: number | undefined;
  private isRegex = false;
  private isCaseSensitive = false;
  private isWholeWord = false;
  private onPick?: (file: string, line: number) => void;

  constructor(onPick: (file: string, line: number) => void) {
    this.onPick = onPick;

    this.overlay = document.createElement('div');
    this.overlay.id = 'search-overlay';
    this.overlay.hidden = true;

    const dialog = document.createElement('div');
    dialog.className = 'search-dialog';

    // 头部
    const header = document.createElement('div');
    header.className = 'search-header';
    header.textContent = '搜索与替换';

    // 搜索输入行
    const searchRow = document.createElement('div');
    searchRow.className = 'search-row';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = '搜索内容';
    this.input.className = 'search-input';

    const toggleGroup = document.createElement('div');
    toggleGroup.className = 'search-toggles';

    this.regexToggle = this.makeToggle('.*', '正则表达式', () => {
      this.isRegex = !this.isRegex;
      this.regexToggle.classList.toggle('active', this.isRegex);
    });
    this.caseToggle = this.makeToggle('Aa', '区分大小写', () => {
      this.isCaseSensitive = !this.isCaseSensitive;
      this.caseToggle.classList.toggle('active', this.isCaseSensitive);
    });
    this.wholeWordToggle = this.makeToggle('ab', '全词匹配', () => {
      this.isWholeWord = !this.isWholeWord;
      this.wholeWordToggle.classList.toggle('active', this.isWholeWord);
    });

    toggleGroup.append(this.regexToggle, this.caseToggle, this.wholeWordToggle);
    searchRow.append(this.input, toggleGroup);

    // 替换输入行
    const replaceRow = document.createElement('div');
    replaceRow.className = 'search-row';

    this.replaceInput = document.createElement('input');
    this.replaceInput.type = 'text';
    this.replaceInput.placeholder = '替换为';
    this.replaceInput.className = 'search-input';

    const replaceBtns = document.createElement('div');
    replaceBtns.className = 'search-replace-btns';

    const replaceAllBtn = document.createElement('button');
    replaceAllBtn.className = 'search-btn';
    replaceAllBtn.textContent = '全部替换';
    replaceAllBtn.addEventListener('click', () => void this.doReplaceAll());

    replaceBtns.appendChild(replaceAllBtn);
    replaceRow.append(this.replaceInput, replaceBtns);

    // 状态
    this.status = document.createElement('div');
    this.status.className = 'search-status';

    // 结果
    this.results = document.createElement('div');
    this.results.className = 'search-results';

    dialog.append(header, searchRow, replaceRow, this.status, this.results);
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
    this.replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
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

  private makeToggle(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'search-toggle-btn';
    btn.textContent = text;
    btn.title = title;
    btn.addEventListener('click', onClick);
    return btn;
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

        item.append(lineNo, text);
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

  private async doReplaceAll() {
    const query = this.input.value.trim();
    const replacement = this.replaceInput.value;
    if (!query || !this.root) return;

    const count = this.results.querySelectorAll('.search-match').length;
    if (count === 0) {
      this.status.textContent = '没有匹配项可替换';
      return;
    }

    if (!confirm(`确定替换全部 ${count} 个匹配项吗？`)) return;

    this.status.textContent = '替换中…';

    const options: SearchReplaceOptions = {
      query,
      replacement,
      isRegex: this.isRegex,
      caseSensitive: this.isCaseSensitive,
      wholeWord: this.isWholeWord
    };

    const result = await window.electronAPI.searchReplace(this.root, options);
    if (!result.success || !result.results) {
      this.status.textContent = `替换失败: ${result.error || '未知错误'}`;
      return;
    }

    const results = result.results as SearchReplaceResult[];
    const totalReplacements = results.reduce((sum, r) => sum + r.count, 0);
    this.status.textContent = `已替换 ${totalReplacements} 处（${results.length} 个文件）`;
    this.results.replaceChildren();

    // 重新搜索以刷新结果
    this.doSearch();
  }
}
