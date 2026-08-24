import { app } from 'electron';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { EditorSettings, RecentProject } from '../common/types';
import type { SessionState } from '../common/types';

export type { EditorSettings, RecentProject, SessionState };

// 默认配置根目录
function defaultConfigRoot(): string {
  return join(app.getPath('userData'), 'ink-config');
}

// 元配置（记录配置根目录）保存在固定位置
function metaPath(): string {
  return join(app.getPath('userData'), 'config-root.json');
}

let cachedRoot: string | null = null;

/**
 * 获取配置根目录
 */
export async function getConfigRoot(): Promise<string> {
  if (cachedRoot) return cachedRoot;
  try {
    if (existsSync(metaPath())) {
      const data = JSON.parse(await readFile(metaPath(), 'utf-8'));
      if (data.configRoot && existsSync(data.configRoot)) {
        const root: string = data.configRoot;
        cachedRoot = root;
        return root;
      }
    }
  } catch {
    // 忽略读取错误，使用默认目录
  }
  const root = defaultConfigRoot();
  cachedRoot = root;
  return root;
}

/**
 * 确保配置子文件夹存在（分文件夹存放）
 * <root>/settings/  编辑器配置
 * <root>/history/   最近项目等历史数据
 */
async function ensureDirs(root: string): Promise<void> {
  await mkdir(join(root, 'settings'), { recursive: true });
  await mkdir(join(root, 'history'), { recursive: true });
}

/**
 * 读取编辑器配置
 */
export async function loadSettings(): Promise<EditorSettings> {
  const root = await getConfigRoot();
  await ensureDirs(root);

  const defaults: EditorSettings = {
    configRoot: root,
    theme: 'ink-java-dark',
    fontSize: 14
  };

  try {
    const data = JSON.parse(await readFile(join(root, 'settings', 'editor.json'), 'utf-8'));
    return { ...defaults, ...data, configRoot: root };
  } catch {
    return defaults;
  }
}

/**
 * 保存编辑器配置
 * 如果配置目录变更，更新元配置
 */
export async function saveSettings(settings: EditorSettings): Promise<void> {
  const oldRoot = await getConfigRoot();
  const newRoot = settings.configRoot || oldRoot;

  if (newRoot !== oldRoot) {
    // 记录新的配置根目录
    await mkdir(app.getPath('userData'), { recursive: true });
    await writeFile(metaPath(), JSON.stringify({ configRoot: newRoot }, null, 2), 'utf-8');
    cachedRoot = newRoot;
  }

  await ensureDirs(newRoot);
  await writeFile(
    join(newRoot, 'settings', 'editor.json'),
    JSON.stringify(settings, null, 2),
    'utf-8'
  );
}

/**
 * 读取最近打开的项目列表
 */
export async function loadRecentProjects(): Promise<RecentProject[]> {
  const root = await getConfigRoot();
  await ensureDirs(root);

  try {
    const data = JSON.parse(await readFile(join(root, 'history', 'recent-projects.json'), 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * 记录最近打开的项目（最多保留 10 条）
 */
export async function addRecentProject(path: string, name: string): Promise<RecentProject[]> {
  const root = await getConfigRoot();
  await ensureDirs(root);

  const list = await loadRecentProjects();
  const filtered = list.filter(p => p.path !== path);
  filtered.unshift({ path, name, lastOpened: Date.now() });
  const trimmed = filtered.slice(0, 10);

  await writeFile(
    join(root, 'history', 'recent-projects.json'),
    JSON.stringify(trimmed, null, 2),
    'utf-8'
  );
  return trimmed;
}

// 空会话默认值
const EMPTY_SESSION: SessionState = { projectPath: null, openFiles: [], activeFile: null };

/**
 * 读取上次会话状态
 */
export async function loadSession(): Promise<SessionState> {
  const root = await getConfigRoot();
  await ensureDirs(root);

  try {
    const data = JSON.parse(await readFile(join(root, 'history', 'session.json'), 'utf-8'));
    return { ...EMPTY_SESSION, ...data };
  } catch {
    return { ...EMPTY_SESSION };
  }
}

/**
 * 保存会话状态
 */
export async function saveSession(session: SessionState): Promise<void> {
  const root = await getConfigRoot();
  await ensureDirs(root);
  await writeFile(
    join(root, 'history', 'session.json'),
    JSON.stringify(session, null, 2),
    'utf-8'
  );
}
