/**
 * Language Server 连接管理
 * 负责启动/初始化/关闭 Language Server 进程，注册 IPC handler
 */

import { ipcMain, BrowserWindow, app } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { IPC_CHANNELS, MAIN_EVENTS, LspStatusInfo, LspStatusType } from '../../common/types';
import type { LspLocation, LspHoverResult, LspTextEdit } from '../../common/types';
import { LspClient } from './client';
import type { InitializeResult, Location, Hover, TextEdit } from './protocol';
import { detectJavaMajorVersion, findBundledJdtPath, findDefaultJdtPath, findJdtLauncher, buildJdtArgs } from './java-server';
import { loadSettings } from '../config-service';
import { findSymbolsByName, getCachedFilePaths } from '../index-service';

let client: LspClient | null = null;
let serverProcess: ChildProcess | null = null;
let currentStatus: LspStatusType = 'stopped';
let lastStatusMessage = '';
let workspacePath: string | null = null;

// 编辑器已打开文档缓存（LSP 未就绪时的 didOpen/didChange 不丢弃，就绪后补发）
const openDocuments = new Map<string, { languageId: string; version: number; text: string }>();

function replayOpenDocuments() {
  if (!client?.isReady() || openDocuments.size === 0) return;
  for (const [uri, doc] of openDocuments) {
    client.notify('textDocument/didOpen', {
      textDocument: { uri, languageId: doc.languageId, version: doc.version, text: doc.text }
    });
  }
  console.log(`[LSP] 补发 didOpen ${openDocuments.size} 个已打开文档`);
}

function broadcast(channel: string, ...args: unknown[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args);
  }
}

function setStatus(status: LspStatusType, message: string) {
  currentStatus = status;
  lastStatusMessage = message;
  console.log('[LSP] 状态:', status, message);
  broadcast(MAIN_EVENTS.LSP_STATUS_CHANGED, { status, message } as LspStatusInfo);
}

/**
 * 启动 Language Server
 */
export async function startLanguageServer(projectPath: string): Promise<boolean> {
  if (client?.isReady()) {
    // 同一项目直接复用；切换项目需重启（JDT LS 的 -data 目录与项目绑定）
    if (workspacePath === projectPath) {
      return true;
    }
    await stopLanguageServer();
  }

  const settings = await loadSettings();

  const javaMajor = detectJavaMajorVersion();
  console.log('[LSP] 检测 Java 主版本:', javaMajor || '(未检测到)');
  if (javaMajor < 17) {
    setStatus('error', `需要 Java 17+，当前版本: ${javaMajor || '未检测到'}`);
    return false;
  }

  // 依次尝试候选路径，取第一个真正含启动器 jar 的（无效配置自动回退）
  // 优先级：用户配置 > 内置 JDT LS > 本机常见安装位置
  const candidates = [
    settings.javaServerPath,
    findBundledJdtPath(),
    findDefaultJdtPath()
  ].filter((p): p is string => Boolean(p));

  let jdtPath: string | null = null;
  let launcher: string | null = null;
  for (const candidate of candidates) {
    const found = findJdtLauncher(candidate);
    if (found) {
      jdtPath = candidate;
      launcher = found;
      break;
    }
  }
  console.log('[LSP] 选定 JDT LS 路径:', jdtPath || '(未找到)');

  if (!jdtPath || !launcher) {
    setStatus('error', '未找到 JDT Language Server 启动器，请检查设置中的路径');
    return false;
  }

  setStatus('starting', '正在启动 Language Server...');

  try {
    // JDT LS 的 -data 目录必须按项目隔离，多项目共用会导致工作区状态冲突
    const projectHash = createHash('md5').update(projectPath).digest('hex').slice(0, 12);
    const dataDir = join(app.getPath('userData'), 'jdt-workspace', projectHash);
    const args = buildJdtArgs(launcher, dataDir);
    serverProcess = spawn('java', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    }) as unknown as ChildProcess;

    client = new LspClient();
    client.attach(serverProcess);

    // 初始化
    const initResult = await client.request('initialize', {
      processId: process.pid,
      rootUri: `file:///${projectPath.replace(/\\/g, '/')}`,
      capabilities: {
        textDocument: {
          hover: { contentFormat: ['markdown', 'plaintext'] },
          definition: {},
          references: {},
          formatting: {}
        },
        workspace: { workspaceFolders: true }
      },
      workspaceFolders: [{
        uri: `file:///${projectPath.replace(/\\/g, '/')}`,
        name: projectPath.split(/[\\/]/).pop() || projectPath
      }]
    }) as InitializeResult;

    // 发送 initialized 通知
    client.notify('initialized', {});
    client.setReady();
    workspacePath = projectPath;
    replayOpenDocuments();

    setStatus('ready', `Language Server 就绪 (${initResult.capabilities ? '已连接' : ''})`);
    return true;
  } catch (error) {
    setStatus('error', `启动失败: ${error}`);
    return false;
  }
}

/**
 * 关闭 Language Server
 */
export async function stopLanguageServer() {
  if (client) {
    await client.shutdown();
    client = null;
  }
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  workspacePath = null;
  setStatus('stopped', 'Language Server 已停止');
}

/**
 * 文件路径转 URI
 */
function pathToUri(filePath: string): string {
  return `file:///${filePath.replace(/\\/g, '/')}`;
}

/**
 * URI 转文件路径
 */
function uriToPath(uri: string): string {
  return uri.replace(/^file:\/\/\//, '').replace(/\//g, '\\');
}

/**
 * 从文件指定行提取光标处的标识符（降级方案用）
 */
function getWordAt(filePath: string, line: number, character: number): string | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const lineText = lines[line - 1];
    if (!lineText) return null;
    const col = character - 1;
    if (col < 0 || col > lineText.length) return null;
    // 向左右扩展取完整标识符
    let start = col;
    let end = col;
    const isWord = (c: string) => /[\w$]/.test(c);
    while (start > 0 && isWord(lineText[start - 1])) start--;
    while (end < lineText.length && isWord(lineText[end])) end++;
    const word = lineText.substring(start, end);
    return word || null;
  } catch {
    return null;
  }
}

/**
 * 降级定义查找：基于符号索引
 */
function fallbackDefinition(uri: string, line: number, character: number): LspLocation[] {
  const filePath = uriToPath(uri);
  const word = getWordAt(filePath, line, character);
  if (!word) return [];
  // 只返回类/接口/枚举级别的定义（方法重名太多）
  const matches = findSymbolsByName(word).filter(m =>
    m.symbol.kind === 'class' || m.symbol.kind === 'interface' || m.symbol.kind === 'enum'
  );
  // 无类型匹配时退回方法/字段
  const all = matches.length > 0 ? matches : findSymbolsByName(word);
  return all.slice(0, 10).map(m => ({
    uri: pathToUri(m.file),
    line: m.symbol.line,
    character: m.symbol.column
  }));
}

/**
 * 降级引用查找：正则扫描已索引文件
 */
function fallbackReferences(uri: string, line: number, character: number): LspLocation[] {
  const filePath = uriToPath(uri);
  const word = getWordAt(filePath, line, character);
  if (!word) return [];
  const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
  const results: LspLocation[] = [];
  for (const file of getCachedFilePaths()) {
    try {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length && results.length < 200; i++) {
        let match: RegExpExecArray | null;
        regex.lastIndex = 0;
        while ((match = regex.exec(lines[i])) !== null) {
          results.push({ uri: pathToUri(file), line: i + 1, character: match.index + 1 });
          if (results.length >= 200) break;
        }
      }
    } catch {
      // 读取失败跳过
    }
  }
  return results;
}

/**
 * 注册 LSP 相关 IPC handler
 */
export function registerLspHandlers() {
  // 启动 Language Server（项目打开时由渲染进程触发）
  ipcMain.handle(IPC_CHANNELS.LSP_START, async (_event, projectPath: string) => {
    const started = await startLanguageServer(projectPath);
    return { success: started, status: { status: currentStatus, message: lastStatusMessage } };
  });

  // 获取 LSP 状态
  ipcMain.handle(IPC_CHANNELS.LSP_STATUS, () => {
    return { success: true, status: { status: currentStatus, message: '' } as LspStatusInfo };
  });

  // 跳转定义（LSP 未就绪时降级为符号索引查找）
  ipcMain.handle(IPC_CHANNELS.LSP_DEFINITION, async (_event, uri: string, line: number, character: number) => {
    if (!client?.isReady()) {
      const fallback = fallbackDefinition(uri, line, character);
      return fallback.length > 0
        ? { success: true, locations: fallback }
        : { success: false, error: 'Language Server 未就绪且符号索引无匹配' };
    }
    try {
      const result = await client.request('textDocument/definition', {
        textDocument: { uri },
        position: { line: line - 1, character: character - 1 }
      });
      // 转换结果
      const locations = Array.isArray(result) ? result : result ? [result] : [];
      const lspLocations: LspLocation[] = locations.map((loc: Location) => ({
        uri: loc.uri,
        line: loc.range.start.line + 1,
        character: loc.range.start.character + 1
      }));
      return { success: true, locations: lspLocations };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 查找引用（LSP 未就绪时降级为正则扫描）
  ipcMain.handle(IPC_CHANNELS.LSP_REFERENCES, async (_event, uri: string, line: number, character: number) => {
    if (!client?.isReady()) {
      const fallback = fallbackReferences(uri, line, character);
      return { success: true, locations: fallback };
    }
    try {
      const result = await client.request('textDocument/references', {
        textDocument: { uri },
        position: { line: line - 1, character: character - 1 },
        context: { includeDeclaration: true }
      });
      const locations = Array.isArray(result) ? result : result ? [result] : [];
      const lspLocations: LspLocation[] = locations.map((loc: Location) => ({
        uri: loc.uri,
        line: loc.range.start.line + 1,
        character: loc.range.start.character + 1
      }));
      return { success: true, locations: lspLocations };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 悬停信息
  ipcMain.handle(IPC_CHANNELS.LSP_HOVER, async (_event, uri: string, line: number, character: number) => {
    if (!client?.isReady()) {
      return { success: false, error: 'Language Server 未就绪' };
    }
    try {
      const result = await client.request('textDocument/hover', {
        textDocument: { uri },
        position: { line: line - 1, character: character - 1 }
      }) as Hover | null;
      if (!result) return { success: true, hover: null };
      const content = typeof result.contents === 'string'
        ? result.contents
        : result.contents.value;
      return {
        success: true,
        hover: {
          content,
          range: result.range ? {
            startLine: result.range.start.line + 1,
            startChar: result.range.start.character + 1,
            endLine: result.range.end.line + 1,
            endChar: result.range.end.character + 1
          } : undefined
        } as LspHoverResult
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 格式化文档
  ipcMain.handle(IPC_CHANNELS.LSP_FORMAT, async (_event, uri: string) => {
    if (!client?.isReady()) {
      return { success: false, error: 'Language Server 未就绪' };
    }
    try {
      const result = await client.request('textDocument/formatting', {
        textDocument: { uri },
        options: { tabSize: 4, insertSpaces: true }
      }) as TextEdit[] | null;
      if (!result) return { success: true, edits: [] };
      const edits: LspTextEdit[] = result.map(edit => ({
        startLine: edit.range.start.line + 1,
        startChar: edit.range.start.character + 1,
        endLine: edit.range.end.line + 1,
        endChar: edit.range.end.character + 1,
        newText: edit.newText
      }));
      return { success: true, edits };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 文档打开
  ipcMain.handle(IPC_CHANNELS.LSP_DID_OPEN, async (_event, uri: string, languageId: string, version: number, content: string) => {
    openDocuments.set(uri, { languageId, version, text: content });
    if (!client?.isReady()) return { success: true };
    client.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version, text: content }
    });
    return { success: true };
  });

  // 文档变更
  ipcMain.handle(IPC_CHANNELS.LSP_DID_CHANGE, async (_event, uri: string, version: number, content: string) => {
    const cached = openDocuments.get(uri);
    if (cached) {
      cached.version = version;
      cached.text = content;
    }
    if (!client?.isReady()) return { success: true };
    client.notify('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text: content }]
    });
    return { success: true };
  });

  // 文档关闭
  ipcMain.handle(IPC_CHANNELS.LSP_DID_CLOSE, async (_event, uri: string) => {
    openDocuments.delete(uri);
    if (!client?.isReady()) return { success: true };
    client.notify('textDocument/didClose', {
      textDocument: { uri }
    });
    return { success: true };
  });
}

export { pathToUri, uriToPath };
