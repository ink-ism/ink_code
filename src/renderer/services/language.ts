/**
 * 文件名 → Monaco 语言 id
 * 编辑器 tab 与 diff 视图共用同一份映射，避免两处各自演进导致同一文件在不同视图下语言不一致。
 */
export function languageIdFromFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'java': return 'java';
    case 'js': return 'javascript';
    case 'ts': return 'typescript';
    case 'json': return 'json';
    case 'xml': return 'xml';
    case 'html': case 'htm': return 'html';
    case 'vue': return 'vue';
    case 'css': return 'css';
    case 'scss': return 'scss';
    case 'less': return 'less';
    case 'md': case 'markdown': return 'markdown';
    case 'sql': return 'sql';
    case 'py': return 'python';
    case 'go': return 'go';
    case 'bat': case 'cmd': return 'bat';
    case 'sh': case 'bash': return 'shell';
    case 'ps1': return 'powershell';
    case 'yml': case 'yaml': return 'yaml';
    case 'ini': case 'conf': return 'ini';
    case 'properties': return 'properties';
    default: return 'plaintext';
  }
}
