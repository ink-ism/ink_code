import { readdir, stat } from 'fs/promises';
import { join, basename } from 'path';
import { FileTreeNode } from '../common/types';

// 需要排除的目录
const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'target',
  'bin',
  '.idea',
  '.vscode',
  'dist',
  'build'
]);

// 需要排除的文件扩展名
const EXCLUDED_EXTENSIONS = new Set([
  '.class',
  '.jar',
  '.exe',
  '.dll',
  '.so',
  '.dylib'
]);

// Java 源码根目录标识（路径中包含这些片段则认为是源码目录）
const SOURCE_ROOT_MARKERS = [
  'src/main/java',
  'src/test/java',
  'src/main/kotlin',
  'src/test/kotlin'
];

/**
 * 判断目录是否在 Java 源码根目录内
 * 通过检查路径中是否包含 src/main/java 或 src/test/java 等标识
 */
function isInSourceRoot(dirPath: string): boolean {
  const normalizedPath = dirPath.replace(/\\/g, '/');
  return SOURCE_ROOT_MARKERS.some(marker => normalizedPath.includes(marker));
}

/**
 * 判断目录名是否符合 Java 包命名规范
 * 包名通常是全小写字母、数字、下划线
 */
function looksLikePackageName(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name);
}

/**
 * 扫描目录，返回文件树结构
 * 对目录进行压缩：连续只含单个子目录的路径合并显示
 * - 普通文件夹用 / 分隔（如 src/main/java）
 * - Java package 用 . 分隔（如 com.etianqu.jobs）
 */
export async function scanDirectory(dirPath: string): Promise<FileTreeNode[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const nodes: FileTreeNode[] = [];
  const inSourceRoot = isInSourceRoot(dirPath);

  for (const entry of entries) {
    const name = entry.name;
    const fullPath = join(dirPath, name);

    // 跳过隐藏文件
    if (name.startsWith('.')) {
      continue;
    }

    if (entry.isDirectory()) {
      // 排除特定目录
      if (EXCLUDED_DIRS.has(name)) {
        continue;
      }

      // 判断是否在源码根内且目录名符合包命名规范
      if (inSourceRoot && looksLikePackageName(name)) {
        // package 压缩，用 . 分隔
        const compacted = await compactDirs(fullPath, name, '.');
        nodes.push({ ...compacted, isPackage: true });
      } else {
        // 普通文件夹压缩，用 / 分隔
        const compacted = await compactDirs(fullPath, name, '/');
        nodes.push({ ...compacted, isPackage: false });
      }
    } else {
      // 排除特定扩展名
      const ext = name.substring(name.lastIndexOf('.'));
      if (EXCLUDED_EXTENSIONS.has(ext)) {
        continue;
      }

      nodes.push({
        name,
        path: fullPath,
        isDirectory: false
      });
    }
  }

  // 排序：目录在前，文件在后，同类型按名称排序
  nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

/**
 * 压缩连续只含单个子目录的路径
 * @param dirPath 目录路径
 * @param displayName 初始显示名称
 * @param separator 分隔符（package 用 '.'，普通文件夹用 '/'）
 */
async function compactDirs(dirPath: string, displayName: string, separator: string): Promise<FileTreeNode> {
  let currentPath = dirPath;
  let currentName = displayName;

  // 循环检查是否可以继续压缩
  while (true) {
    try {
      const entries = await readdir(currentPath, { withFileTypes: true });
      
      // 过滤隐藏文件和排除目录
      const visibleEntries = entries.filter(e => {
        if (e.name.startsWith('.')) return false;
        if (e.isDirectory() && EXCLUDED_DIRS.has(e.name)) return false;
        return true;
      });

      // 只有一个条目且是目录时，继续压缩
      if (visibleEntries.length === 1 && visibleEntries[0].isDirectory()) {
        const childName = visibleEntries[0].name;
        const childPath = join(currentPath, childName);

        if (separator === '.') {
          // package 压缩：子目录必须符合包命名规范
          if (!looksLikePackageName(childName)) {
            break;
          }
        } else {
          // 普通文件夹压缩：遇到 package 起点时停止
          // （子目录在源码根内且符合包命名规范）
          if (isInSourceRoot(childPath) && looksLikePackageName(childName)) {
            break;
          }
        }

        currentPath = childPath;
        currentName = currentName + separator + childName;
      } else {
        // 有多个条目或有文件，停止压缩
        break;
      }
    } catch {
      break;
    }
  }

  return {
    name: currentName,
    path: currentPath,
    isDirectory: true,
    children: [] // 初始为空，懒加载时再填充
  };
}

/**
 * 扫描整个目录树（非懒加载版本，用于初始加载）
 */
export async function scanFullTree(dirPath: string): Promise<FileTreeNode> {
  const dirStat = await stat(dirPath);
  if (!dirStat.isDirectory()) {
    return {
      name: basename(dirPath),
      path: dirPath,
      isDirectory: false
    };
  }

  const children = await scanDirectory(dirPath);

  return {
    name: basename(dirPath),
    path: dirPath,
    isDirectory: true,
    isPackage: false,
    children
  };
}
