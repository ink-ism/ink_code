import { ipcMain, BrowserWindow } from 'electron';
import { spawn, ChildProcess, execFile } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, extname } from 'path';
import { tmpdir } from 'os';
import { IPC_CHANNELS, MAIN_EVENTS, TaskRunOptions, TaskFinishedInfo } from '../common/types';
import iconv from 'iconv-lite';

// 运行中的任务实例
interface TaskInstance {
  id: string;
  proc: ChildProcess;
  killed: boolean;
}

const tasks = new Map<string, TaskInstance>();
let nextId = 1;

function broadcast(channel: string, ...args: unknown[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args);
  }
}

/**
 * 流式解码器：优先按 UTF-8 解码，一旦出现非法字节序列则永久切换为 GBK。
 * bat 脚本输出默认走控制台代码页（中文系统多为 GBK/936），
 * 而配置了 chcp 65001 或 PowerShell UTF-8 输出的场景也能正确识别。
 */
function createStreamDecoder(): (chunk: Buffer) => string {
  let useGbk = false;
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const gbk = new TextDecoder('gbk');
  return (chunk: Buffer): string => {
    if (useGbk) {
      return gbk.decode(chunk, { stream: true });
    }
    try {
      return utf8.decode(chunk, { stream: true });
    } catch {
      // 非法 UTF-8 序列 → 判定为 GBK 输出
      useGbk = true;
      return gbk.decode(chunk, { stream: true });
    }
  };
}

/**
 * bat/cmd 无 BOM 时按控制台代码页（中文系统 GBK）解析，UTF-8 保存的中文脚本会
 * 乱码甚至拆断命令行。实测 BOM 方案在此环境不生效（cmd 报 '锘緻echo'），
 * 故采用转码方案：检测到 UTF-8 内容时生成 GBK 编码的临时副本执行
 * （GBK 即 cmd 原生代码页，无需 chcp；输出也是 GBK，由流式解码器兜底）。
 * 返回 { cmdPath, wrapperPath }，wrapperPath 非空时结束后可清理。
 */
function prepareBatForUtf8(scriptPath: string): { cmdPath: string; wrapperPath: string | null } {
  try {
    const buf = readFileSync(scriptPath);
    // 已有 UTF-8 BOM，cmd 自行识别，无需转换
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      return { cmdPath: scriptPath, wrapperPath: null };
    }
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      // 含非法 UTF-8 序列说明本身是 GBK 文件，交给 cmd 默认代码页解析
      return { cmdPath: scriptPath, wrapperPath: null };
    }
    // 转码为 GBK 副本（无法映射的字符用 '?' 替代，不影响 ASCII 命令）
    const copyPath = join(tmpdir(), `inkcode-task-${Date.now()}-${nextId}.cmd`);
    writeFileSync(copyPath, iconv.encode(text, 'gbk'));
    return { cmdPath: copyPath, wrapperPath: copyPath };
  } catch {
    return { cmdPath: scriptPath, wrapperPath: null };
  }
}

/**
 * 按脚本扩展名构造启动命令
 * .ps1  → powershell -ExecutionPolicy Bypass（规避执行策略限制）
 * .bat/.cmd → cmd /c（UTF-8 脚本自动转成 GBK 临时副本执行）
 */
function buildCommand(scriptPath: string): { cmd: string; args: string[]; wrapperPath: string | null } | null {
  const ext = extname(scriptPath).toLowerCase();
  if (ext === '.ps1') {
    return { cmd: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], wrapperPath: null };
  }
  if (ext === '.bat' || ext === '.cmd') {
    const { cmdPath, wrapperPath } = prepareBatForUtf8(scriptPath);
    return { cmd: process.env.COMSPEC || 'cmd.exe', args: ['/d', '/s', '/c', cmdPath], wrapperPath };
  }
  return null;
}

// 清理临时脚本副本（延迟片刻确保 cmd 已释放文件句柄）
function cleanupWrapper(wrapperPath: string | null) {
  if (!wrapperPath) return;
  setTimeout(() => {
    try {
      unlinkSync(wrapperPath);
    } catch {
      // 忽略清理失败（临时目录会自动回收）
    }
  }, 2000);
}

/**
 * 注册编译运行任务相关 IPC handler
 */
export function registerTaskHandlers() {
  // 启动脚本任务
  ipcMain.handle(IPC_CHANNELS.TASK_RUN, async (_event, options: TaskRunOptions) => {
    try {
      if (!existsSync(options.scriptPath)) {
        return { success: false, error: `脚本文件不存在: ${options.scriptPath}` };
      }
      const command = buildCommand(options.scriptPath);
      if (!command) {
        return { success: false, error: '仅支持 .bat / .cmd / .ps1 脚本' };
      }

      const id = `task-${nextId++}`;
      const proc = spawn(command.cmd, command.args, {
        cwd: options.cwd,
        env: process.env as Record<string, string>,
        windowsHide: true
      });

      const instance: TaskInstance = { id, proc, killed: false };
      tasks.set(id, instance);

      const decodeOut = createStreamDecoder();
      const decodeErr = createStreamDecoder();
      proc.stdout?.on('data', (chunk: Buffer) => {
        broadcast(MAIN_EVENTS.TASK_OUTPUT, id, decodeOut(chunk));
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        broadcast(MAIN_EVENTS.TASK_OUTPUT, id, decodeErr(chunk));
      });

      proc.on('error', (err) => {
        tasks.delete(id);
        cleanupWrapper(command.wrapperPath);
        broadcast(MAIN_EVENTS.TASK_OUTPUT, id, `\r\n[启动失败: ${err.message}]\r\n`);
        broadcast(MAIN_EVENTS.TASK_FINISHED, { taskId: id, exitCode: null, killed: false } as TaskFinishedInfo);
      });

      proc.on('close', (code) => {
        tasks.delete(id);
        cleanupWrapper(command.wrapperPath);
        const info: TaskFinishedInfo = { taskId: id, exitCode: code, killed: instance.killed };
        broadcast(MAIN_EVENTS.TASK_OUTPUT, id, instance.killed
          ? `\r\n[任务已终止]\r\n`
          : `\r\n[任务结束，退出码: ${code ?? '未知'}]\r\n`);
        broadcast(MAIN_EVENTS.TASK_FINISHED, info);
      });

      return { success: true, taskId: id };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 停止任务（Windows 下用 taskkill 杀整个进程树，避免脚本子进程残留）
  ipcMain.handle(IPC_CHANNELS.TASK_STOP, async (_event, taskId: string) => {
    const task = tasks.get(taskId);
    if (!task) return { success: false, error: '任务不存在或已结束' };
    task.killed = true;
    const pid = task.proc.pid;
    if (pid) {
      if (process.platform === 'win32') {
        execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {
          // 忽略结果，close 事件会统一广播结束信息
        });
      } else {
        task.proc.kill('SIGTERM');
      }
    }
    return { success: true };
  });
}

/**
 * 销毁所有运行中的任务（应用退出时）
 */
export function destroyAllTasks() {
  for (const task of tasks.values()) {
    try {
      const pid = task.proc.pid;
      if (pid && process.platform === 'win32') {
        execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => { /* 忽略 */ });
      } else {
        task.proc.kill();
      }
    } catch {
      // 忽略
    }
  }
  tasks.clear();
}
