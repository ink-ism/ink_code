import { readFileSync } from 'fs';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { FileSymbol } from '../common/types';

// 符号索引缓存（LRU 上限，防止随项目规模无限增长）
const MAX_CACHED_FILES = 1500;
const symbolCache = new Map<string, FileSymbol[]>();

function cacheGet(filePath: string): FileSymbol[] | undefined {
  const hit = symbolCache.get(filePath);
  if (hit) {
    // 移到 LRU 尾部
    symbolCache.delete(filePath);
    symbolCache.set(filePath, hit);
  }
  return hit;
}

function cacheSet(filePath: string, symbols: FileSymbol[]): void {
  symbolCache.set(filePath, symbols);
  if (symbolCache.size > MAX_CACHED_FILES) {
    const oldest = symbolCache.keys().next().value;
    if (oldest !== undefined) symbolCache.delete(oldest);
  }
}

/**
 * 索引单个 Java 文件，提取符号信息
 */
export function indexFile(filePath: string): FileSymbol[] {
  // 检查缓存
  const cached = cacheGet(filePath);
  if (cached) {
    return cached;
  }

  const symbols: FileSymbol[] = [];
  
  // 读取文件内容（同步方式，因为这是主进程）
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  let currentClass: string | undefined;
  let braceDepth = 0;
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    let trimmedLine = line.trim();

    // 处理块注释
    if (inBlockComment) {
      if (trimmedLine.includes('*/')) {
        inBlockComment = false;
        const idx = trimmedLine.indexOf('*/');
        trimmedLine = trimmedLine.substring(idx + 2).trim();
      } else {
        continue;
      }
    }

    // 检查块注释开始
    if (trimmedLine.startsWith('/*')) {
      inBlockComment = true;
      if (trimmedLine.includes('*/')) {
        inBlockComment = false;
        const idx = trimmedLine.indexOf('*/');
        trimmedLine = trimmedLine.substring(idx + 2).trim();
      } else {
        continue;
      }
    }

    // 跳过行注释
    if (trimmedLine.startsWith('//')) {
      continue;
    }

    // 移除行内注释
    const commentIdx = trimmedLine.indexOf('//');
    if (commentIdx > 0) {
      trimmedLine = trimmedLine.substring(0, commentIdx).trim();
    }

    // 计算大括号深度
    for (const char of trimmedLine) {
      if (char === '{') braceDepth++;
      if (char === '}') braceDepth--;
    }

    // 匹配类/接口/枚举声明
    const classMatch = trimmedLine.match(/\b(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?(?:class|interface|enum)\s+(\w+)/);
    if (classMatch) {
      const name = classMatch[1];
      const kind = trimmedLine.includes('interface') ? 'interface' : 
                   trimmedLine.includes('enum') ? 'enum' : 'class';
      symbols.push({
        name,
        kind,
        line: lineNumber,
        column: line.indexOf(name) + 1,
        parent: currentClass
      });
      if (kind === 'class' || kind === 'interface') {
        currentClass = name;
      }
      continue;
    }

    // 匹配方法声明（在类内部）
    if (currentClass && braceDepth >= 1) {
      const methodMatch = trimmedLine.match(/\b(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:[\w<>\[\]]+)\s+(\w+)\s*\(/);
      if (methodMatch) {
        const name = methodMatch[1];
        // 排除构造函数（与类名相同）
        if (name !== currentClass) {
          symbols.push({
            name,
            kind: 'method',
            line: lineNumber,
            column: line.indexOf(name) + 1,
            parent: currentClass
          });
        }
        continue;
      }

      // 匹配字段声明
      const fieldMatch = trimmedLine.match(/\b(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:[\w<>\[\]]+)\s+(\w+)\s*[;=]/);
      if (fieldMatch) {
        const name = fieldMatch[1];
        symbols.push({
          name,
          kind: 'field',
          line: lineNumber,
          column: line.indexOf(name) + 1,
          parent: currentClass
        });
      }
    }

    // 类结束（大括号回到0）
    if (braceDepth === 0) {
      currentClass = undefined;
    }
  }

  // 缓存结果
  cacheSet(filePath, symbols);
  return symbols;
}

/**
 * 清除文件缓存
 */
export function clearCache(filePath?: string) {
  if (filePath) {
    symbolCache.delete(filePath);
  } else {
    symbolCache.clear();
  }
}

/**
 * 按符号名在已索引文件中查找定义（LSP 不可用时的降级方案）
 */
export function findSymbolsByName(name: string): Array<{ file: string; symbol: FileSymbol }> {
  const results: Array<{ file: string; symbol: FileSymbol }> = [];
  for (const [file, symbols] of symbolCache) {
    for (const s of symbols) {
      if (s.name === name) {
        results.push({ file, symbol: s });
      }
    }
  }
  return results;
}

/**
 * 获取已索引文件路径列表（降级引用扫描用）
 */
export function getCachedFilePaths(): string[] {
  return Array.from(symbolCache.keys());
}

/**
 * 索引整个项目（递归扫描所有 .java 文件）
 */
export async function indexProject(projectPath: string): Promise<Map<string, FileSymbol[]>> {
  // 切换项目时旧项目缓存不再有用，直接清空释放主进程内存
  symbolCache.clear();
  const result = new Map<string, FileSymbol[]>();
  
  async function scan(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // 跳过排除目录
        if (['.git', 'node_modules', 'target', 'bin', 'build', 'dist'].includes(entry.name)) {
          continue;
        }
        await scan(fullPath);
      } else if (entry.name.endsWith('.java')) {
        const symbols = indexFile(fullPath);
        result.set(fullPath, symbols);
      }
    }
  }
  
  await scan(projectPath);
  return result;
}
