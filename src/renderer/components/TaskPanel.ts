import { TaskKind } from '../../common/types';

// 任务状态
export type TaskStatus = 'running' | 'success' | 'failed' | 'stopped';

// 单个任务记录
export interface TaskEntry {
  id: string;
  label: string;
  kind: TaskKind;
  status: TaskStatus;
  exitCode: number | null;
}

// 单个任务输出的内存上限（超出后截断头部，防止长时间运行的脚本撑爆内存）
const MAX_OUTPUT_LENGTH = 512 * 1024;

/**
 * 任务输出面板（底部专用面板，独立于终端）
 * 支持多任务并行：任务标签切换、实时输出、停止、清空已完成任务
 */
export class TaskPanel {
  private container: HTMLElement;
  private resizer: HTMLElement | null;
  private tabsEl: HTMLElement;
  private outputEl: HTMLElement;
  private stopBtn: HTMLButtonElement;
  private clearBtn: HTMLButtonElement;

  private tasks: TaskEntry[] = [];
  private outputs = new Map<string, string>();
  private activeId: string | null = null;

  // 关闭面板回调（用于外部联动）
  public onClose?: () => void;
  // 停止任务回调（由外部调用 IPC）
  public onStop?: (taskId: string) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.resizer = container.previousElementSibling instanceof HTMLElement
      ? container.previousElementSibling
      : null;

    container.innerHTML = `
      <div id="task-header">
        <span id="task-panel-title">输出</span>
        <div id="task-actions">
          <button id="btn-task-stop" class="terminal-btn" title="停止当前任务" disabled>■</button>
          <button id="btn-task-clear" class="terminal-btn task-btn-text" title="清除已结束的任务">清除</button>
          <button id="btn-task-close" class="terminal-btn" title="关闭输出面板">✕</button>
        </div>
      </div>
      <div id="task-tabs"></div>
      <div id="task-output"></div>
    `;

    this.tabsEl = container.querySelector('#task-tabs')!;
    this.outputEl = container.querySelector('#task-output')!;
    this.stopBtn = container.querySelector('#btn-task-stop')!;
    this.clearBtn = container.querySelector('#btn-task-clear')!;

    container.querySelector('#btn-task-close')!.addEventListener('click', () => {
      this.hide();
      this.onClose?.();
    });
    this.stopBtn.addEventListener('click', () => {
      if (this.activeId) this.onStop?.(this.activeId);
    });
    this.clearBtn.addEventListener('click', () => this.clearFinished());
  }

  isVisible(): boolean {
    return !this.container.hidden;
  }

  show() {
    this.container.hidden = false;
    if (this.resizer) this.resizer.hidden = false;
  }

  hide() {
    this.container.hidden = true;
    if (this.resizer) this.resizer.hidden = true;
  }

  /**
   * 新增一个任务并激活（显示在标签列表最右）
   */
  addTask(id: string, label: string, kind: TaskKind) {
    this.tasks.push({ id, label, kind, status: 'running', exitCode: null });
    this.outputs.set(id, '');
    this.activeId = id;
    this.renderTabs();
    this.renderOutput();
    this.updateActionButtons();
  }

  /**
   * 追加任务输出（仅当前激活任务实时渲染，其余只累积）
   */
  appendOutput(id: string, text: string) {
    const entry = this.tasks.find(t => t.id === id);
    if (!entry) return;
    let output = (this.outputs.get(id) || '') + text;
    if (output.length > MAX_OUTPUT_LENGTH) {
      output = '…（输出过长，头部已截断）…\n' + output.slice(-MAX_OUTPUT_LENGTH);
    }
    this.outputs.set(id, output);
    if (id === this.activeId) {
      this.renderOutput();
    }
  }

  /**
   * 任务结束，更新状态
   */
  finishTask(id: string, exitCode: number | null, killed: boolean) {
    const entry = this.tasks.find(t => t.id === id);
    if (!entry || entry.status !== 'running') return;
    entry.exitCode = exitCode;
    entry.status = killed ? 'stopped' : (exitCode === 0 ? 'success' : 'failed');
    this.renderTabs();
    this.updateActionButtons();
  }

  /**
   * 启动失败等本地错误：直接记为失败并写入输出
   */
  failLocal(id: string, message: string) {
    const entry = this.tasks.find(t => t.id === id);
    if (entry) {
      entry.status = 'failed';
      this.renderTabs();
      this.updateActionButtons();
    }
    this.appendOutput(id, `\r\n[错误] ${message}\r\n`);
  }

  // 清除已结束的任务（保留运行中的）
  private clearFinished() {
    const finished = this.tasks.filter(t => t.status !== 'running').map(t => t.id);
    if (finished.length === 0) return;
    for (const id of finished) {
      this.outputs.delete(id);
    }
    this.tasks = this.tasks.filter(t => t.status === 'running');
    if (this.activeId && finished.includes(this.activeId)) {
      this.activeId = this.tasks.length > 0 ? this.tasks[this.tasks.length - 1].id : null;
    }
    this.renderTabs();
    this.renderOutput();
    this.updateActionButtons();
  }

  private updateActionButtons() {
    const active = this.tasks.find(t => t.id === this.activeId);
    this.stopBtn.disabled = !active || active.status !== 'running';
    this.clearBtn.disabled = !this.tasks.some(t => t.status !== 'running');
  }

  private renderTabs() {
    this.tabsEl.innerHTML = '';
    for (const task of this.tasks) {
      const tab = document.createElement('div');
      tab.className = `task-tab status-${task.status}${task.id === this.activeId ? ' active' : ''}`;
      const dot = document.createElement('span');
      dot.className = 'task-tab-dot';
      const text = document.createElement('span');
      text.className = 'task-tab-text';
      text.textContent = task.label;
      tab.appendChild(dot);
      tab.appendChild(text);
      tab.title = task.status === 'running'
        ? task.label
        : `${task.label}（退出码: ${task.exitCode ?? '未知'}）`;
      tab.addEventListener('click', () => {
        this.activeId = task.id;
        this.renderTabs();
        this.renderOutput();
        this.updateActionButtons();
      });
      this.tabsEl.appendChild(tab);
    }
    // 标签过多时把激活标签滚入视野
    const activeTab = this.tabsEl.querySelector('.task-tab.active');
    activeTab?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  private renderOutput() {
    const text = this.activeId ? (this.outputs.get(this.activeId) || '') : '';
    this.outputEl.textContent = text || (this.tasks.length === 0 ? '（暂无任务输出）' : '');
    // 用户停留在底部附近时自动滚动跟随
    const nearBottom = this.outputEl.scrollHeight - this.outputEl.scrollTop - this.outputEl.clientHeight < 40;
    if (nearBottom || text === '') {
      this.outputEl.scrollTop = this.outputEl.scrollHeight;
    }
  }
}
