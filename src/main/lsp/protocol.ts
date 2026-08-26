/**
 * LSP 协议类型定义（仅包含项目使用的核心类型）
 */

// JSON-RPC 基础消息
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

// LSP 位置
export interface Position {
  line: number;      // 0-based
  character: number; // 0-based
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

// LSP 初始化
export interface InitializeParams {
  processId: number;
  rootUri: string | null;
  capabilities: ClientCapabilities;
  workspaceFolders?: { uri: string; name: string }[];
}

export interface ClientCapabilities {
  textDocument?: {
    synchronization?: { dynamicRegistration?: boolean };
    completion?: { completionItem?: { snippetSupport?: boolean } };
    hover?: { contentFormat?: string[] };
    definition?: {};
    references?: {};
    formatting?: {};
  };
  workspace?: {
    workspaceFolders?: boolean;
  };
}

export interface InitializeResult {
  capabilities: ServerCapabilities;
}

export interface ServerCapabilities {
  textDocumentSync?: number | { openClose?: boolean; change?: number };
  completionProvider?: { triggerCharacters?: string[] };
  hoverProvider?: boolean;
  definitionProvider?: boolean;
  referencesProvider?: boolean;
  documentFormattingProvider?: boolean;
}

// 文本文档标识
export interface TextDocumentIdentifier {
  uri: string;
}

export interface TextDocumentItem {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}

export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  version: number;
}

// textDocument/didOpen
export interface DidOpenTextDocumentParams {
  textDocument: TextDocumentItem;
}

// textDocument/didChange
export interface DidChangeTextDocumentParams {
  textDocument: VersionedTextDocumentIdentifier;
  contentChanges: { text: string }[];
}

// textDocument/didClose
export interface DidCloseTextDocumentParams {
  textDocument: TextDocumentIdentifier;
}

// textDocument/definition
export interface DefinitionParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
}

// textDocument/references
export interface ReferenceParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
  context: { includeDeclaration: boolean };
}

// textDocument/hover
export interface HoverParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
}

export interface Hover {
  contents: { kind: string; value: string } | string;
  range?: Range;
}

// textDocument/formatting
export interface DocumentFormattingParams {
  textDocument: TextDocumentIdentifier;
  options: { tabSize: number; insertSpaces: boolean };
}

export interface TextEdit {
  range: Range;
  newText: string;
}
