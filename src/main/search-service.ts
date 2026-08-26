import { readdir, stat, readFile, writeFile } from 'fs/promises';
import { join, extname, relative } from 'path';
import { decodeBuffer } from './encoding';
import type { SearchReplaceOptions, SearchReplaceResult } from '../common/types';

// 跳过的目录
const SKIP_DIRS = new Set(['node_modules', '.git', 'target', 'dist', 'build', '.idea', '.gradle', 'out', '.vscode', '.settings']);

// 参与搜索/列表的文本文件扩展名
const TEXT_EXTS = new Set([
  '.java', '.xml', '.yml', '.yaml', '.properties', '.json', '.ts', '.js',
  '.md', '.txt', '.sql', '.html', '.css', '.kt', '.gradle', '.ini', '.conf',
  '.py', '.go', '.bat', '.cmd', '.sh', '.bash', '.ps1'
]);

// 列表时跳过的二进制/资源扩展名
const BINARY_EXTS = new Set([
  '.class', '.jar', '.war', '.zip', '.tar', '.gz', '.png', '.jpg', '.jpeg',
  '.gif', '.ico', '.bmp', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.exe', '.dll', '.so'
]);

const MAX_FILE_SIZE = 1024 * 1024;      // 搜索跳过大于 1MB 的文件
const MAX_MATCHES = 500;               // 搜索匹配上限
const MAX_FILES = 20000;               // 文件列表上限

export interface SearchMatch {
  file: string;   // 绝对路径
  line: number;   // 行号（1 起）
  text: string;   // 匹配行内容（截断）
}

/**
 * 递归列出项目所有文件（相对路径），用于快速打开
 */
export async function listAllFiles(root: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string) {
    if (results.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= MAX_FILES) return;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          await walk(join(dir, entry.name));
        }
      } else if (!BINARY_EXTS.has(extname(entry.name).toLowerCase())) {
        results.push(relative(root, join(dir, entry.name)).replace(/\\/g, '/'));
      }
    }
  }

  await walk(root);
  return results;
}

/**
 * 全局搜索替换
 */
export async function replaceInProject(root: string, options: SearchReplaceOptions): Promise<SearchReplaceResult[]> {
  const results: SearchReplaceResult[] = [];
  if (!options.query) return results;

  // 构建匹配模式
  let pattern: RegExp;
  try {
    if (options.isRegex) {
      const flags = options.caseSensitive ? 'g' : 'gi';
      pattern = new RegExp(options.query, flags);
    } else {
      const escaped = options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const q = options.wholeWord ? `\\b${escaped}\\b` : escaped;
      const flags = options.caseSensitive ? 'g' : 'gi';
      pattern = new RegExp(q, flags);
    }
  } catch {
    return results;
  }

  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          await walk(full);
        }
      } else if (TEXT_EXTS.has(extname(entry.name).toLowerCase())) {
        try {
          const st = await stat(full);
          if (st.size > MAX_FILE_SIZE) continue;
          const buf = await readFile(full);
          const { content } = decodeBuffer(buf, full);
          pattern.lastIndex = 0;
          if (!pattern.test(content)) continue;
          pattern.lastIndex = 0;
          const newContent = content.replace(pattern, options.replacement);
          await writeFile(full, newContent, 'utf-8');
          // 计算替换次数
          pattern.lastIndex = 0;
          const matches = content.match(pattern);
          results.push({
            file: full,
            count: matches ? matches.length : 0
          });
        } catch {
          // 忽略读写失败的文件
        }
      }
    }
  }

  await walk(root);
  return results;
}
/**
 * 跨文件搜索（包含匹配），返回匹配结果
 */
export async function searchProject(root: string, query: string): Promise<SearchMatch[]> {
  const results: SearchMatch[] = [];
  if (!query) return results;

  async function walk(dir: string) {
    if (results.length >= MAX_MATCHES) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= MAX_MATCHES) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          await walk(full);
        }
      } else if (TEXT_EXTS.has(extname(entry.name).toLowerCase())) {
        try {
          const st = await stat(full);
          if (st.size > MAX_FILE_SIZE) continue;
          const buf = await readFile(full);
          const { content } = decodeBuffer(buf, full);
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(query)) {
              results.push({
                file: full,
                line: i + 1,
                text: lines[i].trim().slice(0, 200)
              });
              if (results.length >= MAX_MATCHES) break;
            }
          }
        } catch {
          // 忽略读取失败的文件
        }
      }
    }
  }

  await walk(root);
  return results;
}
