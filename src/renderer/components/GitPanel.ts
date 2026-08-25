import { GitBranchInfo, GitCommitFile, GitDiffMode, GitFileChange, GitLogEntry, GitStatusInfo } from '../../common/types';

// diff 查看请求（由外层 DiffViewer 承接）
export interface GitDiffRequest {
  path: string;
  mode: GitDiffMode;
  ref?: string;
}

interface GitPanelOptions {
  // 点击冲突文件等需要在编辑器打开时回调（相对仓库根的路径）
  onOpenFile?: (relPath: string) => void;
  // 状态刷新后回调（用于更新状态栏分支信息）
  onStatusUpdate?: (status: GitStatusInfo | null) => void;
  // 请求查看文件 diff
  onShowDiff?: (req: GitDiffRequest) => void;
}

interface GitActionResult {
  success: boolean;
  error?: string;
  conflicts?: boolean;
}

// Git 面板：提交、暂存/丢弃、分支管理、合并、拉取/推送/获取、diff 入口、提交历史
export class GitPanel {
  private container: HTMLElement;
  private branchBadge: HTMLElement;
  private options: GitPanelOptions;
  private repoPath: string | null = null;
  private status: GitStatusInfo | null = null;
  private branches: GitBranchInfo[] = [];
  private logEntries: GitLogEntry[] = [];
  private logHasMore = false;
  private expandedCommit: string | null = null;
  private commitFilesCache = new Map<string, GitCommitFile[]>();
  private commitMessage = '';
  private busy = false;
  private msgEl: HTMLElement | null = null;
  private msgTimer: number | undefined;
  // 面板外壳（提交区/消息行/滚动区）只构建一次，重绘仅替换滚动区内容，
  // 避免展开提交/加载更多/自动刷新时滚动位置重置、输入框丢焦点
  private scrollEl: HTMLElement | null = null;
  private btnCommit: HTMLButtonElement | null = null;

  constructor(container: HTMLElement, branchBadge: HTMLElement, options: GitPanelOptions = {}) {
    this.container = container;
    this.branchBadge = branchBadge;
    this.options = options;
  }

  // 切换项目时重置面板
  setProject(repoPath: string | null) {
    this.repoPath = repoPath;
    this.status = null;
    this.branches = [];
    this.logEntries = [];
    this.expandedCommit = null;
    this.commitFilesCache.clear();
    this.commitMessage = '';
    // 外壳若已存在：同步清空输入框并回到顶部（DOM 中的 textarea 不会随状态重置）
    const input = this.container.querySelector<HTMLTextAreaElement>('.git-commit-input');
    if (input) input.value = '';
    if (this.scrollEl) this.scrollEl.scrollTop = 0;
    this.updateBranchBadge(null);
    if (!repoPath) {
      this.renderEmpty('未打开项目');
    }
  }

  // 拉取仓库状态、分支与提交记录并渲染
  async refresh() {
    if (!this.repoPath) {
      this.options.onStatusUpdate?.(null);
      return;
    }
    const res = await window.electronAPI.gitStatus(this.repoPath);
    if (!res.success || !res.status) {
      this.status = null;
      this.branches = [];
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
      this.branches = [];
      this.logEntries = [];
      this.renderEmpty('当前项目不是 Git 仓库');
      return;
    }

    // 分支列表 + 提交记录并行拉取；保留已展开的提交与已加载的分页深度，
    // 避免外部变更自动刷新时展开状态被折叠
    const [branchRes, logRes] = await Promise.all([
      window.electronAPI.gitBranches(this.repoPath),
      window.electronAPI.gitLog(this.repoPath, 0, Math.max(15, this.logEntries.length))
    ]);
    this.branches = branchRes.success && branchRes.branches ? branchRes.branches : [];
    if (logRes.success && logRes.entries) {
      this.logEntries = logRes.entries;
      this.logHasMore = logRes.hasMore ?? false;
    } else {
      this.logEntries = [];
      this.logHasMore = false;
    }
    this.render();
  }

  // 进度回传（拉取/推送/获取时由主进程流式上报）
  showProgress(line: string) {
    if (!this.msgEl) return;
    this.msgEl.textContent = line;
    this.msgEl.className = 'git-msg git-msg-progress';
    window.clearTimeout(this.msgTimer);
  }

  // ============ 渲染 ============

  private render() {
    const status = this.status;
    if (!status || !status.isRepo) return;

    if (!this.scrollEl) {
      this.buildShell();
    }

    // 提交按钮可用性随暂存状态变化
    this.btnCommit!.disabled = status.staged.length === 0 && !status.mergeInProgress;

    // 只重绘滚动区内容，保留当前滚动位置
    const scroll = this.scrollEl!;
    const prevScroll = scroll.scrollTop;
    scroll.replaceChildren();

    // merge 进行中 / 存在冲突横幅
    if (status.mergeInProgress || status.conflicts.length > 0) {
      scroll.appendChild(this.renderMergeBanner());
    }
    if (status.conflicts.length > 0) {
      scroll.appendChild(this.renderConflictSection());
    }

    scroll.appendChild(this.renderBranchSection());

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

    if (status.staged.length === 0 && working.length === 0 && status.conflicts.length === 0) {
      const clean = document.createElement('div');
      clean.className = 'git-empty';
      clean.textContent = '工作区干净，无待提交变更';
      scroll.appendChild(clean);
    }

    scroll.appendChild(this.renderLogSection());
    scroll.scrollTop = prevScroll;
  }

  // 构建面板外壳：提交区（输入框 + 操作按钮）、消息行、滚动区
  private buildShell() {
    this.container.replaceChildren();

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
    this.btnCommit = this.makeButton('✓ 提交', 'primary', () => this.doCommit());
    actions.appendChild(this.btnCommit);
    actions.appendChild(this.makeButton('↓ 拉取', '', () => this.doPull()));
    actions.appendChild(this.makeButton('↑ 推送', '', () => this.doPush()));
    actions.appendChild(this.makeButton('⭮ 获取', '', () => this.doFetch()));
    commitBox.appendChild(actions);

    // 操作结果 / 进度提示行
    this.msgEl = document.createElement('div');
    this.msgEl.className = 'git-msg';

    // 变更与分支列表区（可滚动）
    this.scrollEl = document.createElement('div');
    this.scrollEl.className = 'git-scroll';

    this.container.append(commitBox, this.msgEl, this.scrollEl);
  }

  // merge 进行中横幅：完成合并提交 / 中止合并
  private renderMergeBanner(): HTMLElement {
    const status = this.status!;
    const banner = document.createElement('div');
    banner.className = 'git-merge-banner';

    const text = document.createElement('span');
    text.textContent = status.conflicts.length > 0
      ? `⚠ ${status.conflicts.length} 个文件存在合并冲突`
      : '合并进行中，待完成合并提交';
    banner.appendChild(text);

    const btns = document.createElement('div');
    btns.className = 'git-merge-actions';
    if (status.conflicts.length === 0) {
      btns.appendChild(this.makeButton('✓ 完成合并提交', 'primary', () => this.doMergeContinue()));
    }
    btns.appendChild(this.makeButton('✕ 中止合并', '', () => this.doMergeAbort()));
    banner.appendChild(btns);
    return banner;
  }

  // 冲突文件区：点击在编辑器打开（人工解决后暂存即视为已解决）
  private renderConflictSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'git-section';

    const header = document.createElement('div');
    header.className = 'git-section-header git-section-conflict';
    const label = document.createElement('span');
    label.textContent = `合并冲突 (${this.status!.conflicts.length})`;
    header.appendChild(label);
    section.appendChild(header);

    for (const f of this.status!.conflicts) {
      const row = this.makeFileRowBase(f);
      row.classList.add('git-row-conflict');
      row.addEventListener('click', () => {
        this.options.onOpenFile?.(f.path);
      });
      const hint = document.createElement('span');
      hint.className = 'git-conflict-hint';
      hint.textContent = '打开解决';
      row.appendChild(hint);
      section.appendChild(row);
    }
    return section;
  }

  // 分支区：当前分支 + 其余分支（切换/合并/删除）
  private renderBranchSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'git-section';

    const header = document.createElement('div');
    header.className = 'git-section-header';
    const label = document.createElement('span');
    label.textContent = `分支 (${this.branches.length})`;
    header.appendChild(label);
    header.appendChild(this.iconBtn('＋', '新建分支', () => this.createBranch()));
    section.appendChild(header);

    if (this.branches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'git-empty';
      empty.textContent = '无本地分支';
      section.appendChild(empty);
      return section;
    }

    for (const b of this.branches) {
      section.appendChild(this.renderBranchRow(b));
    }
    return section;
  }

  private renderBranchRow(branch: GitBranchInfo): HTMLElement {
    const row = document.createElement('div');
    row.className = 'git-branch-row' + (branch.isCurrent ? ' git-branch-current' : '');
    row.title = branch.upstream
      ? `上游：${branch.upstream}${branch.ahead ? `，领先 ${branch.ahead}` : ''}${branch.behind ? `，落后 ${branch.behind}` : ''}`
      : '无上游分支';

    const name = document.createElement('span');
    name.className = 'git-branch-name';
    name.textContent = (branch.isCurrent ? '⎇ ' : '') + branch.name;
    row.appendChild(name);

    // 领先/落后计数
    if (branch.ahead > 0 || branch.behind > 0) {
      const sync = document.createElement('span');
      sync.className = 'git-branch-sync';
      sync.textContent = `${branch.ahead > 0 ? `↑${branch.ahead} ` : ''}${branch.behind > 0 ? `↓${branch.behind}` : ''}`.trim();
      row.appendChild(sync);
    }

    if (!branch.isCurrent) {
      const actions = document.createElement('div');
      actions.className = 'git-file-actions git-branch-actions';
      actions.appendChild(this.iconBtn('⤵', `将 ${branch.name} 合并到当前分支`, () => this.doMerge(branch.name)));
      actions.appendChild(this.iconBtn('✕', '删除分支', () => this.deleteBranch(branch.name)));
      row.appendChild(actions);

      row.addEventListener('click', () => this.checkoutBranch(branch.name));
    }
    return row;
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

  // 文件行基础结构（状态码 + 路径）
  private makeFileRowBase(file: GitFileChange): HTMLElement {
    const row = document.createElement('div');
    row.className = 'git-file-row';
    row.title = file.path;

    const code = document.createElement('span');
    code.className = `git-file-code git-code-${file.code[0]}`;
    code.textContent = file.code;
    row.appendChild(code);

    const path = document.createElement('span');
    path.className = 'git-file-path';
    path.textContent = file.path;
    row.appendChild(path);
    return row;
  }

  // 单个变更文件行：点击看 diff，行内暂存/取消暂存/丢弃
  private renderFileRow(file: GitFileChange, kind: 'staged' | 'work'): HTMLElement {
    const row = this.makeFileRowBase(file);
    row.addEventListener('click', () => {
      this.options.onShowDiff?.({ path: file.path, mode: kind === 'staged' ? 'staged' : 'work' });
    });

    const actions = document.createElement('div');
    actions.className = 'git-file-actions';
    if (kind === 'staged') {
      actions.appendChild(this.iconBtn('−', '取消暂存',
        () => this.run(() => window.electronAPI.gitUnstage(this.repoPath!, [file.path]))));
    } else {
      actions.appendChild(this.iconBtn('+', '暂存',
        () => this.run(() => window.electronAPI.gitStage(this.repoPath!, [file.path]))));
      if (file.code === 'U') {
        // 未跟踪文件：删除（git clean）
        actions.appendChild(this.iconBtn('✕', '删除未跟踪文件', () => this.cleanFile(file)));
      } else {
        actions.appendChild(this.iconBtn('↺', '丢弃修改', () => this.discardFile(file)));
      }
    }
    row.appendChild(actions);

    return row;
  }

  // 提交历史：分页 + 点击展开变更文件
  private renderLogSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'git-section';

    const header = document.createElement('div');
    header.className = 'git-section-header';
    const label = document.createElement('span');
    label.textContent = '提交历史';
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
      section.appendChild(this.renderLogRow(entry));
      if (this.expandedCommit === entry.hash) {
        section.appendChild(this.renderCommitFiles(entry.hash));
      }
    }

    if (this.logHasMore) {
      const more = document.createElement('button');
      more.className = 'git-load-more';
      more.textContent = '加载更多';
      more.addEventListener('click', () => this.loadMoreLog());
      section.appendChild(more);
    }
    return section;
  }

  private renderLogRow(entry: GitLogEntry): HTMLElement {
    const row = document.createElement('div');
    row.className = 'git-log-row' + (this.expandedCommit === entry.hash ? ' git-log-row-active' : '');
    row.title = `${entry.hash} ${entry.message}\n${entry.author}，${entry.date}\n点击查看该提交的文件变更`;

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

    row.addEventListener('click', () => {
      this.expandedCommit = this.expandedCommit === entry.hash ? null : entry.hash;
      this.render();
      if (this.expandedCommit && !this.commitFilesCache.has(entry.hash)) {
        this.loadCommitFiles(entry.hash);
      }
    });
    return row;
  }

  // 展开的提交文件列表（点击文件查看该提交的 diff）
  private renderCommitFiles(hash: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'git-commit-files';

    const files = this.commitFilesCache.get(hash);
    if (!files) {
      const loading = document.createElement('div');
      loading.className = 'git-empty';
      loading.textContent = '加载中…';
      wrap.appendChild(loading);
      return wrap;
    }
    for (const f of files) {
      const row = document.createElement('div');
      row.className = 'git-file-row';
      row.title = `${f.path}\n点击查看该提交中的差异`;

      const code = document.createElement('span');
      code.className = `git-file-code git-code-${f.code}`;
      code.textContent = f.code;
      row.appendChild(code);

      const path = document.createElement('span');
      path.className = 'git-file-path';
      path.textContent = f.path;
      row.appendChild(path);

      row.addEventListener('click', () => {
        this.options.onShowDiff?.({ path: f.path, mode: 'commit', ref: hash });
      });
      wrap.appendChild(row);
    }
    return wrap;
  }

  private renderEmpty(text: string) {
    // 外壳已被清空，重置引用，下次 render 时重新构建
    this.scrollEl = null;
    this.btnCommit = null;
    this.msgEl = null;
    this.container.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'git-empty';
    empty.textContent = text;
    this.container.appendChild(empty);
  }

  // ============ 操作 ============

  private doCommit() {
    const message = this.commitMessage.trim();
    const status = this.status;
    if (!status) return;
    // merge 中完成合并提交走专门入口
    if (status.mergeInProgress) {
      this.doMergeContinue();
      return;
    }
    if (!message) {
      this.showMessage('请输入提交信息', true);
      return;
    }
    if (status.staged.length === 0) {
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
    const status = this.status;
    if (!status) return;
    if (!status.upstream) {
      // 无上游分支：引导 push -u origin <branch>
      if (!confirm(`分支 “${status.branch}” 尚未设置上游分支，是否推送到 origin/${status.branch} 并建立跟踪？`)) return;
      this.run(
        () => window.electronAPI.gitPushUpstream(this.repoPath!, status.branch),
        () => this.showMessage('推送完成（已建立上游跟踪）')
      );
      return;
    }
    this.run(
      () => window.electronAPI.gitPush(this.repoPath!),
      () => this.showMessage('推送完成')
    );
  }

  private doFetch() {
    this.run(
      () => window.electronAPI.gitFetch(this.repoPath!),
      () => this.showMessage('获取完成')
    );
  }

  private checkoutBranch(name: string) {
    const dirty = this.status
      && (this.status.staged.length + this.status.changes.length > 0);
    if (dirty && !confirm('工作区存在未提交的变更，仍要切换分支吗？（变更会随切换携带，若无法携带 git 会拒绝）')) return;
    this.run(
      () => window.electronAPI.gitCheckoutBranch(this.repoPath!, name),
      () => this.showMessage(`已切换到 ${name}`)
    );
  }

  private createBranch() {
    const name = prompt('新分支名称：');
    if (!name || !name.trim()) return;
    this.run(
      () => window.electronAPI.gitCreateBranch(this.repoPath!, name.trim()),
      () => this.showMessage(`已创建并切换到 ${name.trim()}`)
    );
  }

  private async deleteBranch(name: string) {
    if (!confirm(`确定删除分支 “${name}” 吗？`)) return;
    let res = await this.execOnce(() => window.electronAPI.gitDeleteBranch(this.repoPath!, name, false));
    if (!res.success && /not fully merged/i.test(res.error ?? '')) {
      // 未合并分支：询问是否强删
      if (confirm(`分支 “${name}” 尚未合并，强制删除将丢失其上的提交。确定强删吗？`)) {
        res = await this.execOnce(() => window.electronAPI.gitDeleteBranch(this.repoPath!, name, true));
      } else {
        return;
      }
    }
    if (res.success) {
      this.showMessage(`已删除分支 ${name}`);
      await this.refresh();
    } else {
      this.showMessage(res.error || '删除失败', true);
    }
  }

  private async doMerge(branch: string) {
    if (!confirm(`将 “${branch}” 合并到当前分支 “${this.status?.branch}”？`)) return;
    const res = await this.execOnce(() => window.electronAPI.gitMerge(this.repoPath!, branch));
    if (res.success) {
      this.showMessage(`已将 ${branch} 合并到 ${this.status?.branch}`);
    } else if (res.conflicts) {
      this.showMessage(`合并 ${branch} 时产生冲突，请解决冲突后完成合并提交`, true);
    } else {
      this.showMessage(res.error || '合并失败', true);
    }
    await this.refresh();
  }

  private doMergeAbort() {
    if (!confirm('确定中止本次合并吗？工作区将恢复到合并前的状态。')) return;
    this.run(
      () => window.electronAPI.gitMergeAbort(this.repoPath!),
      () => this.showMessage('已中止合并')
    );
  }

  private doMergeContinue() {
    this.run(
      () => window.electronAPI.gitMergeContinue(this.repoPath!),
      () => this.showMessage('合并提交完成')
    );
  }

  private discardFile(file: GitFileChange) {
    if (!confirm(`确定丢弃 “${file.path}” 的修改吗？此操作不可恢复。`)) return;
    this.run(() => window.electronAPI.gitDiscard(this.repoPath!, file.path));
  }

  private cleanFile(file: GitFileChange) {
    if (!confirm(`确定删除未跟踪文件 “${file.path}” 吗？文件将从磁盘删除，不可恢复。`)) return;
    this.run(() => window.electronAPI.gitCleanFile(this.repoPath!, file.path));
  }

  private async loadMoreLog() {
    if (!this.repoPath) return;
    const skip = this.logEntries.length;
    const res = await window.electronAPI.gitLog(this.repoPath, skip);
    if (res.success && res.entries) {
      this.logEntries = [...this.logEntries, ...res.entries];
      this.logHasMore = res.hasMore ?? false;
      this.render();
    }
  }

  private async loadCommitFiles(hash: string) {
    if (!this.repoPath) return;
    const res = await window.electronAPI.gitCommitFiles(this.repoPath, hash);
    this.commitFilesCache.set(hash, res.success && res.files ? res.files : []);
    if (this.expandedCommit === hash) {
      this.render();
    }
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

  // 单次执行（不自动刷新，供需要自定义后续流程的操作使用）
  private async execOnce(action: () => Promise<GitActionResult>): Promise<GitActionResult> {
    if (this.busy || !this.repoPath) return { success: false };
    this.busy = true;
    this.container.classList.add('git-busy');
    try {
      return await action();
    } catch (error) {
      return { success: false, error: String(error) };
    } finally {
      this.busy = false;
      this.container.classList.remove('git-busy');
    }
  }

  // ============ 辅助 ============

  // 更新面板头部的分支徽标（分支名 + 领先/落后计数 + 冲突提示）
  private updateBranchBadge(status: GitStatusInfo | null) {
    if (!status || !status.isRepo) {
      this.branchBadge.hidden = true;
      this.branchBadge.textContent = '';
      return;
    }
    let text = `⎇ ${status.branch}`;
    if (status.ahead > 0) text += ` ↑${status.ahead}`;
    if (status.behind > 0) text += ` ↓${status.behind}`;
    if (status.conflicts.length > 0) text += ` ⚠${status.conflicts.length}`;
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
    }, 8000);
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
