import { GitFileChange, GitLogEntry, GitStatusInfo } from '../../common/types';

interface GitPanelOptions {
  // 点击变更文件时回调（相对仓库根的路径）
  onOpenFile?: (relPath: string) => void;
  // 状态刷新后回调（用于更新状态栏分支信息）
  onStatusUpdate?: (status: GitStatusInfo | null) => void;
}

interface GitActionResult {
  success: boolean;
  error?: string;
}

// Git 面板：分支信息、提交、暂存/取消暂存、丢弃、拉取/推送、最近提交
export class GitPanel {
  private container: HTMLElement;
  private branchBadge: HTMLElement;
  private options: GitPanelOptions;
  private repoPath: string | null = null;
  private status: GitStatusInfo | null = null;
  private logEntries: GitLogEntry[] = [];
  private commitMessage = '';
  private busy = false;
  private msgEl: HTMLElement | null = null;
  private msgTimer: number | undefined;

  constructor(container: HTMLElement, branchBadge: HTMLElement, options: GitPanelOptions = {}) {
    this.container = container;
    this.branchBadge = branchBadge;
    this.options = options;
  }

  // 切换项目时重置面板
  setProject(repoPath: string | null) {
    this.repoPath = repoPath;
    this.status = null;
    this.logEntries = [];
    this.commitMessage = '';
    this.updateBranchBadge(null);
    if (!repoPath) {
      this.renderEmpty('未打开项目');
    }
  }

  // 拉取仓库状态与提交记录并渲染
  async refresh() {
    if (!this.repoPath) {
      this.options.onStatusUpdate?.(null);
      return;
    }
    const res = await window.electronAPI.gitStatus(this.repoPath);
    if (!res.success || !res.status) {
      this.status = null;
      this.logEntries = [];
      this.updateBranchBadge(null);
      this.renderEmpty(res.error || '获取 Git 状态失败');
      this.options.onStatusUpdate?.(null);
      return;
    }
    this.status = res.status;
    this.options.onStatusUpdate?.(res.status);
    this.updateBranchBadge(res.status);
    if (!res.status.isRepo) {
      this.logEntries = [];
      this.renderEmpty('当前项目不是 Git 仓库');
      return;
    }
    const logRes = await window.electronAPI.gitLog(this.repoPath);
    this.logEntries = logRes.success && logRes.entries ? logRes.entries : [];
    this.render();
  }

  // ============ 渲染 ============

  private render() {
    const status = this.status;
    if (!status || !status.isRepo) return;

    this.container.replaceChildren();

    // 提交区：提交信息输入 + 提交/拉取/推送
    const commitBox = document.createElement('div');
    commitBox.className = 'git-commit-box';

    const textarea = document.createElement('textarea');
    textarea.className = 'git-commit-input';
    textarea.placeholder = '提交信息（Ctrl+Enter 提交）';
    textarea.value = this.commitMessage;
    textarea.addEventListener('input', () => {
      this.commitMessage = textarea.value;
    });
    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.doCommit();
      }
    });
    commitBox.appendChild(textarea);

    const actions = document.createElement('div');
    actions.className = 'git-commit-actions';
    const btnCommit = this.makeButton('✓ 提交', 'primary', () => this.doCommit());
    btnCommit.disabled = status.staged.length === 0;
    actions.appendChild(btnCommit);
    actions.appendChild(this.makeButton('↓ 拉取', '', () => this.doPull()));
    actions.appendChild(this.makeButton('↑ 推送', '', () => this.doPush()));
    commitBox.appendChild(actions);

    // 操作结果提示行
    this.msgEl = document.createElement('div');
    this.msgEl.className = 'git-msg';

    // 变更列表区（可滚动）
    const scroll = document.createElement('div');
    scroll.className = 'git-scroll';

    if (status.staged.length > 0) {
      scroll.appendChild(this.renderSection(
        `暂存的更改 (${status.staged.length})`, '−', '全部取消暂存',
        () => this.run(() => window.electronAPI.gitUnstageAll(this.repoPath!)),
        status.staged, 'staged'
      ));
    }

    const working: GitFileChange[] = [...status.changes, ...status.untracked];
    if (working.length > 0) {
      scroll.appendChild(this.renderSection(
        `更改 (${working.length})`, '+', '全部暂存',
        () => this.run(() => window.electronAPI.gitStageAll(this.repoPath!)),
        working, 'work'
      ));
    }

    if (status.staged.length === 0 && working.length === 0) {
      const clean = document.createElement('div');
      clean.className = 'git-empty';
      clean.textContent = '工作区干净，无待提交变更';
      scroll.appendChild(clean);
    }

    scroll.appendChild(this.renderLogSection());

    this.container.append(commitBox, this.msgEl, scroll);
  }

  // 变更分组（标题 + 组级操作按钮 + 文件行）
  private renderSection(
    title: string, actionGlyph: string, actionTitle: string,
    action: () => void, files: GitFileChange[], kind: 'staged' | 'work'
  ): HTMLElement {
    const section = document.createElement('div');
    section.className = 'git-section';

    const header = document.createElement('div');
    header.className = 'git-section-header';
    const label = document.createElement('span');
    label.textContent = title;
    header.appendChild(label);
    header.appendChild(this.iconBtn(actionGlyph, actionTitle, action));
    section.appendChild(header);

    for (const f of files) {
      section.appendChild(this.renderFileRow(f, kind));
    }
    return section;
  }

  // 单个变更文件行：状态码 + 路径 + 行内操作
  private renderFileRow(file: GitFileChange, kind: 'staged' | 'work'): HTMLElement {
    const row = document.createElement('div');
    row.className = 'git-file-row';
    row.title = file.path;

    const code = document.createElement('span');
    code.className = `git-file-code git-code-${file.code}`;
    code.textContent = file.code;
    row.appendChild(code);

    const path = document.createElement('span');
    path.className = 'git-file-path';
    path.textContent = file.path;
    row.appendChild(path);

    row.addEventListener('click', () => {
      this.options.onOpenFile?.(file.path);
    });

    const actions = document.createElement('div');
    actions.className = 'git-file-actions';
    if (kind === 'staged') {
      actions.appendChild(this.iconBtn('−', '取消暂存',
        () => this.run(() => window.electronAPI.gitUnstage(this.repoPath!, [file.path]))));
    } else {
      actions.appendChild(this.iconBtn('+', '暂存',
        () => this.run(() => window.electronAPI.gitStage(this.repoPath!, [file.path]))));
      // 未跟踪文件不支持丢弃（git checkout 对未跟踪文件无效）
      if (file.code !== 'U') {
        actions.appendChild(this.iconBtn('↺', '丢弃修改', () => this.discardFile(file)));
      }
    }
    row.appendChild(actions);

    return row;
  }

  // 最近提交列表
  private renderLogSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'git-section';

    const header = document.createElement('div');
    header.className = 'git-section-header';
    const label = document.createElement('span');
    label.textContent = '最近提交';
    header.appendChild(label);
    section.appendChild(header);

    if (this.logEntries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'git-empty';
      empty.textContent = '暂无提交记录';
      section.appendChild(empty);
      return section;
    }

    for (const entry of this.logEntries) {
      const row = document.createElement('div');
      row.className = 'git-log-row';
      row.title = `${entry.hash} ${entry.message}\n${entry.author}，${entry.date}`;

      const hash = document.createElement('span');
      hash.className = 'git-log-hash';
      hash.textContent = entry.hash;
      row.appendChild(hash);

      const message = document.createElement('span');
      message.className = 'git-log-message';
      message.textContent = entry.message;
      row.appendChild(message);

      const meta = document.createElement('span');
      meta.className = 'git-log-meta';
      meta.textContent = entry.date;
      row.appendChild(meta);

      section.appendChild(row);
    }
    return section;
  }

  private renderEmpty(text: string) {
    this.container.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'git-empty';
    empty.textContent = text;
    this.container.appendChild(empty);
  }

  // ============ 操作 ============

  private doCommit() {
    const message = this.commitMessage.trim();
    if (!message) {
      this.showMessage('请输入提交信息', true);
      return;
    }
    if (!this.status || this.status.staged.length === 0) {
      this.showMessage('没有已暂存的变更可提交', true);
      return;
    }
    this.run(
      () => window.electronAPI.gitCommit(this.repoPath!, message),
      () => {
        this.commitMessage = '';
        this.showMessage('提交成功');
      }
    );
  }

  private doPull() {
    this.run(
      () => window.electronAPI.gitPull(this.repoPath!),
      () => this.showMessage('拉取完成')
    );
  }

  private doPush() {
    this.run(
      () => window.electronAPI.gitPush(this.repoPath!),
      () => this.showMessage('推送完成')
    );
  }

  private discardFile(file: GitFileChange) {
    if (!confirm(`确定丢弃 “${file.path}” 的修改吗？此操作不可恢复。`)) return;
    this.run(() => window.electronAPI.gitDiscard(this.repoPath!, file.path));
  }

  // 执行 git 操作：成功后刷新状态，失败显示错误
  private async run(action: () => Promise<GitActionResult>, onSuccess?: () => void) {
    if (this.busy || !this.repoPath) return;
    this.busy = true;
    this.container.classList.add('git-busy');
    try {
      const res = await action();
      if (res.success) {
        onSuccess?.();
        await this.refresh();
      } else {
        this.showMessage(res.error || '操作失败', true);
      }
    } catch (error) {
      this.showMessage(String(error), true);
    } finally {
      this.busy = false;
      this.container.classList.remove('git-busy');
    }
  }

  // ============ 辅助 ============

  // 更新面板头部的分支徽标（分支名 + 领先/落后计数）
  private updateBranchBadge(status: GitStatusInfo | null) {
    if (!status || !status.isRepo) {
      this.branchBadge.hidden = true;
      this.branchBadge.textContent = '';
      return;
    }
    let text = `⎇ ${status.branch}`;
    if (status.ahead > 0) text += ` ↑${status.ahead}`;
    if (status.behind > 0) text += ` ↓${status.behind}`;
    this.branchBadge.textContent = text;
    this.branchBadge.hidden = false;
    this.branchBadge.title = status.upstream ? `上游：${status.upstream}` : '无上游分支';
  }

  private showMessage(text: string, isError = false) {
    if (!this.msgEl) return;
    this.msgEl.textContent = text;
    this.msgEl.className = 'git-msg' + (isError ? ' git-msg-error' : '');
    window.clearTimeout(this.msgTimer);
    this.msgTimer = window.setTimeout(() => {
      if (this.msgEl) this.msgEl.textContent = '';
    }, 6000);
  }

  private makeButton(text: string, variant: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'git-btn' + (variant ? ` ${variant}` : '');
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private iconBtn(glyph: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'git-icon-btn';
    btn.textContent = glyph;
    btn.title = title;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }
}
