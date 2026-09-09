import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS, MAIN_EVENTS, TerminalCreateOptions } from '../common/types';

// node-pty 延迟加载（原生模块，可能未安装）
let ptyModule: typeof import('node-pty') | null = null;

function getPty() {
  if (ptyModule === null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ptyModule = require('node-pty');
    } catch {
      ptyModule = false as unknown as typeof import('node-pty');
    }
  }
  return ptyModule || null;
}

// 终端实例管理
interface TerminalInstance {
  id: string;
  pty: import('node-pty').IPty;
}

const terminals = new Map<string, TerminalInstance>();
let nextId = 1;

function broadcast(channel: string, ...args: unknown[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args);
  }
}

// 补丁 child_process.fork：node-pty 内部用 fork 启动辅助进程（如 conpty_console_list_agent），
// 而 Electron 的 process.execPath 是 electron.exe，必须注入 ELECTRON_RUN_AS_NODE 使其以 Node 模式运行，
// 否则报 AttachConsole failed。只补丁 fork，不影响 Electron 自身的 utility 进程
let forkPatched = false;
function patchForkForElectron() {
  if (forkPatched) return;
  forkPatched = true;
  // 直接 require 拿到模块单例对象（node-pty 内部访问的是同一个对象）
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cp = require('child_process') as typeof import('child_process');
  const rawFork = cp.fork;
  (cp as { fork: typeof cp.fork }).fork = ((
    modulePath: string,
    args?: string[] | import('child_process').ForkOptions,
    options?: import('child_process').ForkOptions
  ) => {
    let forkArgs: string[] = [];
    let forkOptions: import('child_process').ForkOptions = {};
    if (Array.isArray(args)) {
      forkArgs = args;
      forkOptions = options || {};
    } else if (args) {
      forkOptions = args;
    }
    forkOptions.env = {
      ...(forkOptions.env || process.env),
      ELECTRON_RUN_AS_NODE: '1'
    } as NodeJS.ProcessEnv;
    return rawFork(modulePath, forkArgs, forkOptions);
  }) as typeof cp.fork;
}

/**
 * 注册终端相关 IPC handler
 */
export function registerTerminalHandlers() {
  patchForkForElectron();

  // 创建终端
  ipcMain.handle(IPC_CHANNELS.TERMINAL_CREATE, async (_event, options: TerminalCreateOptions) => {
    const pty = getPty();
    if (!pty) {
      return { success: false, error: 'node-pty 未安装，请运行 npm install node-pty' };
    }

    try {
      const id = `term-${nextId++}`;
      const shell = process.env.COMSPEC || 'powershell.exe';

      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: options.cols || 80,
        rows: options.rows || 24,
        cwd: options.cwd || process.env.HOME || process.env.USERPROFILE || '/',
        env: process.env as Record<string, string>
      });

      ptyProcess.onData((data) => {
        broadcast(MAIN_EVENTS.TERMINAL_DATA, id, data);
      });

      ptyProcess.onExit(({ exitCode }) => {
        terminals.delete(id);
        broadcast(MAIN_EVENTS.TERMINAL_DATA, id, `\r\n[进程已退出，退出码: ${exitCode}]`);
      });

      terminals.set(id, { id, pty: ptyProcess });
      return { success: true, id };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 写入终端
  ipcMain.handle(IPC_CHANNELS.TERMINAL_WRITE, async (_event, id: string, data: string) => {
    const term = terminals.get(id);
    if (!term) return { success: false, error: '终端不存在' };
    try {
      term.pty.write(data);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 调整终端大小
  ipcMain.handle(IPC_CHANNELS.TERMINAL_RESIZE, async (_event, id: string, cols: number, rows: number) => {
    const term = terminals.get(id);
    if (!term) return { success: false, error: '终端不存在' };
    try {
      term.pty.resize(Math.max(cols, 1), Math.max(rows, 1));
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 销毁终端
  ipcMain.handle(IPC_CHANNELS.TERMINAL_DESTROY, async (_event, id: string) => {
    const term = terminals.get(id);
    if (!term) return { success: true };
    try {
      term.pty.kill();
      terminals.delete(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}

/**
 * 销毁所有终端实例
 */
export function destroyAllTerminals() {
  for (const term of terminals.values()) {
    try {
      term.pty.kill();
    } catch {
      // 忽略
    }
  }
  terminals.clear();
}
