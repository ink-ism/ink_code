/**
 * 终端面板组件
 * 使用 xterm.js 渲染终端，支持多终端 tab
 * HTML 骨架由 index.html 提供（#terminal-panel / #terminal-tabs / #terminal-content）
 */

// xterm 延迟加载（可能未安装）
let TerminalClass: typeof import('xterm').Terminal | null = null;
let FitAddonClass: typeof import('@xterm/addon-fit').FitAddon | null = null;

async function loadXterm() {
  if (TerminalClass) return true;
  try {
    // 官方样式必须引入：否则字符测量元素（一串 W）等辅助 DOM 不会隐藏，
    // 会在终端首行显示为一排乱码
    await import('xterm/css/xterm.css');
    const xterm = await import('xterm');
    const fitAddon = await import('@xterm/addon-fit');
    TerminalClass = xterm.Terminal;
    FitAddonClass = fitAddon.FitAddon;
    return true;
  } catch {
    return false;
  }
}

interface TerminalTab {
  id: string;
  name: string;
  tabEl: HTMLElement;
  containerEl: HTMLElement;
  terminal: InstanceType<typeof import('xterm').Terminal>;
  fitAddon: InstanceType<typeof import('@xterm/addon-fit').FitAddon>;
}

// 终端配色（跟随外壳主题：深色黑底白字 / 浅色白底黑字）
const TERMINAL_THEMES = {
  dark: {
    background: '#17171a',
    foreground: '#c9c9cf',
    cursor: '#c9c9cf',
    selectionBackground: '#264f78'
  },
  light: {
    background: '#ffffff',
    foreground: '#333333',
    cursor: '#333333',
    selectionBackground: '#add6ff'
  }
};

export class TerminalPanel {
  private panel: HTMLElement;
  private contentEl: HTMLElement;
  private tabsEl: HTMLElement;
  private tabs: TerminalTab[] = [];
  private activeTabId: string | null = null;
  private cwd = '.';
  private nextTabNum = 1;
  private resizeObserver: ResizeObserver | null = null;
  // 当前终端配色模式（新建终端时使用，主题切换时同步到已有终端）
  private terminalTheme: 'dark' | 'light' = 'dark';

  constructor(panel: HTMLElement, contentEl: HTMLElement, tabsEl: HTMLElement, cwd?: string) {
    this.panel = panel;
    this.contentEl = contentEl;
    this.tabsEl = tabsEl;
    if (cwd) this.cwd = cwd;

    // 监听终端数据（主进程 PTY 输出）
    window.electronAPI.onTerminalData((id, data) => {
      const tab = this.tabs.find(t => t.id === id);
      if (tab) {
        tab.terminal.write(data);
      }
    });

    // 面板尺寸变化时自适应终端
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.panel.hidden) this.fitActive();
    });
    this.resizeObserver.observe(this.contentEl);
  }

  /** 更新默认工作目录（项目切换时调用） */
  setCwd(cwd: string) {
    this.cwd = cwd;
  }

  /** 切换终端配色（跟随外壳主题，即时应用到所有已打开终端） */
  setTheme(mode: 'dark' | 'light') {
    this.terminalTheme = mode;
    const colors = TERMINAL_THEMES[mode];
    for (const tab of this.tabs) {
      tab.terminal.options = { theme: { ...colors } };
    }
  }

  /** 是否有活动终端 */
  hasActiveTerminal(): boolean {
    return this.tabs.length > 0;
  }

  /** 新建终端 tab */
  async createNewTerminal(cwd?: string) {
    const loaded = await loadXterm();
    if (!loaded) {
      alert('终端组件未安装，请运行 npm install xterm @xterm/addon-fit');
      return;
    }
    if (cwd) this.cwd = cwd;

    const name = `终端 ${this.nextTabNum++}`;

    // tab 标签
    const tabEl = document.createElement('div');
    tabEl.className = 'terminal-tab';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    const closeTabBtn = document.createElement('span');
    closeTabBtn.className = 'terminal-tab-close';
    closeTabBtn.textContent = '×';
    closeTabBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.destroyTab(id);
    });
    tabEl.append(nameSpan, closeTabBtn);

    // 终端容器（先隐藏挂载，创建后再显示，避免尺寸计算为 0）
    const containerEl = document.createElement('div');
    containerEl.className = 'terminal-container';
    containerEl.style.width = '100%';
    containerEl.style.height = '100%';

    // 创建 xterm 实例（配色跟随当前外壳主题）
    const terminal = new TerminalClass!({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: { ...TERMINAL_THEMES[this.terminalTheme] }
    });

    const fitAddon = new FitAddonClass!();
    terminal.loadAddon(fitAddon);

    // 先挂到内容区并显示，确保 open/fit 能拿到真实尺寸
    this.contentEl.appendChild(containerEl);
    terminal.open(containerEl);

    try {
      fitAddon.fit();
    } catch {
      // 面板未显示时使用默认尺寸
    }

    // 创建 PTY 进程
    const result = await window.electronAPI.terminalCreate({
      cwd: this.cwd,
      cols: terminal.cols || 80,
      rows: terminal.rows || 24
    });

    if (!result.success || !result.id) {
      containerEl.remove();
      terminal.dispose();
      alert(`创建终端失败: ${result.error}`);
      return;
    }

    const id = result.id as string;
    const tab: TerminalTab = { id, name, tabEl, containerEl, terminal, fitAddon };
    this.tabs.push(tab);
    this.tabsEl.appendChild(tabEl);

    // 输入转发到 PTY
    terminal.onData((data: string) => {
      void window.electronAPI.terminalWrite(id, data);
    });

    // 终端尺寸变化同步到 PTY
    terminal.onResize(({ cols, rows }) => {
      void window.electronAPI.terminalResize(id, cols, rows);
    });

    // tab 切换
    tabEl.addEventListener('click', () => this.activateTab(id));
    this.activateTab(id);
    terminal.focus();
  }

  /** 激活指定 tab */
  private activateTab(id: string) {
    const tab = this.tabs.find(t => t.id === id);
    if (!tab) return;
    this.activeTabId = id;

    for (const t of this.tabs) {
      t.tabEl.classList.toggle('active', t.id === id);
      t.containerEl.style.display = t.id === id ? 'block' : 'none';
    }

    requestAnimationFrame(() => {
      try { tab.fitAddon.fit(); } catch { /* 忽略 */ }
      tab.terminal.focus();
    });
  }

  /** 关闭指定终端 tab */
  private async destroyTab(id: string) {
    const idx = this.tabs.findIndex(t => t.id === id);
    if (idx === -1) return;

    const tab = this.tabs[idx];
    tab.terminal.dispose();
    tab.tabEl.remove();
    tab.containerEl.remove();
    void window.electronAPI.terminalDestroy(id);

    this.tabs.splice(idx, 1);

    if (this.activeTabId === id) {
      if (this.tabs.length > 0) {
        const newIdx = Math.min(idx, this.tabs.length - 1);
        this.activateTab(this.tabs[newIdx].id);
      } else {
        this.activeTabId = null;
      }
    }
  }

  /** 适配当前活动终端尺寸 */
  fitActive() {
    const tab = this.tabs.find(t => t.id === this.activeTabId);
    if (!tab) return;
    requestAnimationFrame(() => {
      try { tab.fitAddon.fit(); } catch { /* 忽略 */ }
    });
  }
}
