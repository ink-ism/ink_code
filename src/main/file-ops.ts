import { mkdir, writeFile, rename, rm, readdir, stat, copyFile } from 'fs/promises';
import { join, dirname, basename } from 'path';
import type { FileClipboard } from '../common/types';

// 内存级文件剪贴板
let clipboard: FileClipboard | null = null;

/**
 * 创建文件或文件夹
 * @param parentDir 父目录路径
 * @param name 名称
 * @param isFolder 是否创建文件夹
 * @returns 创建的完整路径
 */
export async function createFileOrFolder(
  parentDir: string,
  name: string,
  isFolder: boolean = false
): Promise<string> {
  if (!name || name.includes('/') || name.includes('\\')) {
    throw new Error('名称不能为空或包含路径分隔符');
  }

  const fullPath = join(parentDir, name);

  if (isFolder) {
    await mkdir(fullPath, { recursive: true });
  } else {
    await writeFile(fullPath, '', 'utf-8');
  }

  return fullPath;
}

/**
 * 重命名文件或文件夹
 */
export async function renameItem(oldPath: string, newName: string): Promise<string> {
  if (!newName || newName.includes('/') || newName.includes('\\')) {
    throw new Error('名称不能为空或包含路径分隔符');
  }

  const parentDir = dirname(oldPath);
  const newPath = join(parentDir, newName);

  await rename(oldPath, newPath);
  return newPath;
}

/**
 * 删除文件或文件夹（递归删除）
 */
export async function deleteItem(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

/**
 * 复制文件或文件夹到目标目录
 */
export async function copyItem(srcPath: string, destDir: string): Promise<string> {
  const name = basename(srcPath);
  const destPath = join(destDir, name);

  const st = await stat(srcPath);
  if (st.isDirectory()) {
    await copyDirRecursive(srcPath, destPath);
  } else {
    await copyFile(srcPath, destPath);
  }

  return destPath;
}

/**
 * 剪切（移动）文件或文件夹到目标目录
 */
export async function cutItem(srcPath: string, destDir: string): Promise<string> {
  const name = basename(srcPath);
  const destPath = join(destDir, name);

  // 不能移动到自身子目录
  if (destPath.startsWith(srcPath + '/')) {
    throw new Error('不能将文件夹移动到其子目录中');
  }

  await rename(srcPath, destPath);
  return destPath;
}

/**
 * 设置文件剪贴板
 */
export function setClipboard(path: string, mode: 'copy' | 'cut'): void {
  clipboard = { path, mode };
}

/**
 * 获取文件剪贴板
 */
export function getClipboard(): FileClipboard | null {
  return clipboard;
}

/**
 * 粘贴：根据剪贴板模式执行复制或剪切
 */
export async function pasteItem(destDir: string): Promise<string | null> {
  if (!clipboard) return null;

  const { path: srcPath, mode } = clipboard;

  if (mode === 'copy') {
    return await copyItem(srcPath, destDir);
  } else {
    const result = await cutItem(srcPath, destDir);
    clipboard = null; // 剪切后清空剪贴板
    return result;
  }
}

// ============ 内部工具 ============

/**
 * 递归复制目录
 */
async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}
