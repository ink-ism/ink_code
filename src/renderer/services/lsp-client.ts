/**
 * LSP Monaco Provider 注册
 * 通过 IPC 与主进程 LSP 客户端通信，注册 Monaco 四大 Provider
 */

import { monaco } from './monaco';
import { LspLocation, LspHoverResult, LspTextEdit } from '../../common/types';

/**
 * 文件路径转 URI
 * 必须用 monaco.Uri.file 生成，保证与 TextModel 的 uri 完全一致（含盘符大小写），
 * 否则 didOpen 注册的文档与 definition 请求的文档对不上
 */
export function pathToUri(filePath: string): string {
  return monaco.Uri.file(filePath).toString();
}

/**
 * URI 转文件路径
 */
export function uriToPath(uri: string): string {
  return uri.replace(/^file:\/\/\//, '').replace(/\//g, '\\');
}

// 文档版本计数器
const documentVersions = new Map<string, number>();

function nextVersion(uri: string): number {
  const v = (documentVersions.get(uri) || 0) + 1;
  documentVersions.set(uri, v);
  return v;
}

/**
 * 注册 LSP Provider（定义跳转、引用查找、悬停、格式化）
 */
export function registerLspProviders() {
  const languages = ['java']; // 目前仅对 Java 注册

  for (const lang of languages) {
    // 定义跳转 (F12 / Ctrl+Click)
    monaco.languages.registerDefinitionProvider(lang, {
      async provideDefinition(model, position) {
        const uri = model.uri.toString();
        const result = await window.electronAPI.lspDefinition(
          uri, position.lineNumber, position.column
        );
        if (!result.success || !result.locations) return null;
        const locations = result.locations as LspLocation[];
        if (locations.length === 0) return null;
        return locations.map(loc => ({
          uri: monaco.Uri.parse(loc.uri),
          range: new monaco.Range(loc.line, loc.character, loc.line, loc.character + 1)
        }));
      }
    });

    // 引用查找 (Shift+F12)
    monaco.languages.registerReferenceProvider(lang, {
      async provideReferences(model, position) {
        const uri = model.uri.toString();
        const result = await window.electronAPI.lspReferences(
          uri, position.lineNumber, position.column
        );
        if (!result.success || !result.locations) return null;
        const locations = result.locations as LspLocation[];
        if (locations.length === 0) return null;
        return locations.map(loc => ({
          uri: monaco.Uri.parse(loc.uri),
          range: new monaco.Range(loc.line, loc.character, loc.line, loc.character + 1)
        }));
      }
    });

    // 悬停提示
    monaco.languages.registerHoverProvider(lang, {
      async provideHover(model, position) {
        const uri = model.uri.toString();
        const result = await window.electronAPI.lspHover(
          uri, position.lineNumber, position.column
        );
        if (!result.success || !result.hover) return null;
        const hover = result.hover as LspHoverResult;
        return {
          contents: [{ value: hover.content }],
          range: hover.range ? new monaco.Range(
            hover.range.startLine, hover.range.startChar,
            hover.range.endLine, hover.range.endChar
          ) : undefined
        };
      }
    });

    // 文档格式化 (Shift+Alt+F)
    monaco.languages.registerDocumentFormattingEditProvider(lang, {
      async provideDocumentFormattingEdits(model) {
        const uri = model.uri.toString();
        const result = await window.electronAPI.lspFormat(uri);
        if (!result.success || !result.edits) return [];
        const edits = result.edits as LspTextEdit[];
        return edits.map(edit => ({
          range: new monaco.Range(
            edit.startLine, edit.startChar,
            edit.endLine, edit.endChar
          ),
          text: edit.newText
        }));
      }
    });
  }
}

/**
 * 通知 LSP 文档打开
 */
export function notifyDidOpen(filePath: string, languageId: string, content: string) {
  const uri = pathToUri(filePath);
  documentVersions.set(uri, 1);
  void window.electronAPI.lspDidOpen(uri, languageId, 1, content);
}

/**
 * 通知 LSP 文档变更
 */
export function notifyDidChange(filePath: string, content: string) {
  const uri = pathToUri(filePath);
  const version = nextVersion(uri);
  void window.electronAPI.lspDidChange(uri, version, content);
}

/**
 * 通知 LSP 文档关闭
 */
export function notifyDidClose(filePath: string) {
  const uri = pathToUri(filePath);
  documentVersions.delete(uri);
  void window.electronAPI.lspDidClose(uri);
}
