/**
 * LSP JSON-RPC 2.0 客户端核心
 * 通过 stdio 与 Language Server 通信
 */

import { ChildProcess } from 'child_process';
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from './protocol';

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
};

type NotificationHandler = (params: unknown) => void;

export class LspClient {
  private process: ChildProcess | null = null;
  private requestId = 1;
  private pending = new Map<number, PendingRequest>();
  private notificationHandlers = new Map<string, NotificationHandler[]>();
  private buffer = Buffer.alloc(0);
  private ready = false;

  /**
   * 绑定到已启动的子进程
   */
  attach(proc: ChildProcess) {
    this.process = proc;
    this.buffer = Buffer.alloc(0);

    proc.stdout?.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.processBuffer();
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      // LS 日志输出到 stderr，转发到主进程日志
      console.log('[LSP stderr]', chunk.toString('utf-8').trim());
    });

    proc.on('exit', (code) => {
      console.log(`[LSP] 进程退出，退出码: ${code}`);
      this.ready = false;
      // 拒绝所有待处理的请求
      for (const [, pending] of this.pending) {
        pending.reject(new Error('Language Server 进程已退出'));
      }
      this.pending.clear();
    });
  }

  /**
   * 解析 LSP 消息（Content-Length header + JSON body）
   * 注意：Content-Length 是字节数，必须按 Buffer 字节切分，
   * 若先 toString 再按字符偏移截取，含中文的消息会错位导致解析失败
   */
  private processBuffer() {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.subarray(0, headerEnd).toString('ascii');
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        // 无效 header，跳过
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + contentLength) {
        // 消息不完整，等待更多数据
        break;
      }

      const body = this.buffer.subarray(bodyStart, bodyStart + contentLength).toString('utf-8');
      this.buffer = this.buffer.subarray(bodyStart + contentLength);

      try {
        const msg = JSON.parse(body);
        this.handleMessage(msg);
      } catch (e) {
        console.error('[LSP] 解析消息失败:', e);
      }
    }
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(msg: unknown) {
    const m = msg as Record<string, unknown>;

    // 响应（有 id）
    if ('id' in m && ('result' in m || 'error' in m)) {
      const response = msg as JsonRpcResponse;
      const id = typeof response.id === 'number' ? response.id : parseInt(response.id, 10);
      const pending = this.pending.get(id);
      if (pending) {
        this.pending.delete(id);
        if (response.error) {
          pending.reject(new Error(response.error.message));
        } else {
          pending.resolve(response.result);
        }
      }
      return;
    }

    // 通知（有 method 无 id）
    if ('method' in m) {
      const notification = msg as JsonRpcNotification;
      const handlers = this.notificationHandlers.get(notification.method);
      if (handlers) {
        for (const handler of handlers) {
          handler(notification.params);
        }
      }
    }
  }

  /**
   * 发送请求并等待响应
   */
  async request(method: string, params?: unknown): Promise<unknown> {
    if (!this.process || this.process.killed) {
      throw new Error('Language Server 未运行');
    }

    const id = this.requestId++;
    const msg: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send(msg);
    });
  }

  /**
   * 发送通知（无响应）
   */
  notify(method: string, params?: unknown) {
    if (!this.process || this.process.killed) return;
    const msg: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params
    };
    this.send(msg);
  }

  /**
   * 发送消息到 Language Server
   */
  private send(msg: JsonRpcRequest | JsonRpcNotification) {
    const body = JSON.stringify(msg);
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n`;
    this.process?.stdin?.write(header + body);
  }

  /**
   * 注册通知处理器
   */
  onNotification(method: string, handler: NotificationHandler) {
    const handlers = this.notificationHandlers.get(method) || [];
    handlers.push(handler);
    this.notificationHandlers.set(method, handlers);
  }

  /**
   * 是否已就绪
   */
  isReady(): boolean {
    return this.ready && this.process !== null && !this.process.killed;
  }

  /**
   * 标记为就绪
   */
  setReady() {
    this.ready = true;
  }

  /**
   * 关闭连接
   */
  async shutdown() {
    if (!this.process) return;
    try {
      await this.request('shutdown');
      this.notify('exit');
    } catch {
      // 忽略关闭错误
    }
    this.process.kill();
    this.process = null;
    this.ready = false;
  }
}
