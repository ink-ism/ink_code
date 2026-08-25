import { app, BrowserWindow, Menu, dialog } from 'electron';
import { MAIN_EVENTS, MenuModelNode } from '../common/types';
import { loadRecentProjects, addRecentProject } from './config-service';

// 序列化菜单模型（渲染进程 HTML 菜单栏的数据源）
let menuModel: MenuModelNode[] = [];

// HTML 菜单点击动作表（id -> 执行函数）；原生菜单仍走 role / click 以保留快捷键
const menuActions: Record<string, () => void> = {};

function getWin(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

// 打开项目对话框，选择后记录最近项目并通知渲染进程
async function openProjectDialog() {
  console.log('[menu] 打开项目 clicked');
  const win = getWin();
  if (!win) return;
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths[0]) {
    const dirPath = result.filePaths[0];
    const name = dirPath.split(/[/\\]/).pop() || dirPath;
    await addRecentProject(dirPath, name);
    await createMenu(); // 重建菜单以更新最近项目列表
    win.webContents.send(MAIN_EVENTS.PROJECT_OPENED, dirPath);
  }
}

/**
 * 关于对话框：展示应用名称、版本、技术栈
 */
async function showAbout() {
  const win = getWin();
  if (!win) return;
  await dialog.showMessageBox(win, {
    type: 'info',
    title: '关于',
    message: 'InkCode',
    detail: [
      `版本：${app.getVersion()}`,
      '',
      '基于 Electron + Monaco Editor 的代码编辑器',
      '支持文件树浏览、符号大纲、快速打开、全局搜索、Git 操作、',
      'GBK/UTF-8 编码自动识别与会话恢复。'
    ].join('\n'),
    buttons: ['确定']
  });
}

// 模型节点 -> 原生菜单模板（role 项保留系统行为与快捷键，id 项供 HTML 菜单复用）
function toNative(node: MenuModelNode): Electron.MenuItemConstructorOptions {
  if (node.separator) return { type: 'separator' };
  const opts: Electron.MenuItemConstructorOptions = { label: node.label };
  if (node.accelerator) opts.accelerator = node.accelerator;
  if (node.enabled === false) opts.enabled = false;
  if (node.role) {
    opts.role = node.role as Electron.MenuItemConstructorOptions['role'];
  } else if (node.id) {
    const id = node.id;
    opts.click = () => menuActions[id]?.();
  }
  if (node.submenu) opts.submenu = node.submenu.map(toNative);
  return opts;
}

/**
 * 创建应用菜单（原生隐藏菜单，仅用于全局快捷键）并生成 HTML 菜单栏模型
 * 文件菜单含设置页，Project 菜单含打开项目和最近项目
 */
export async function createMenu(): Promise<void> {
  const recentProjects = await loadRecentProjects();

  // 重建动态动作（最近项目）
  for (const key of Object.keys(menuActions)) {
    if (key.startsWith('recent-')) delete menuActions[key];
  }

  const recentSubmenu: MenuModelNode[] = recentProjects.length > 0
    ? recentProjects.map((p, i) => {
        const id = `recent-${i}`;
        menuActions[id] = () => {
          const win = getWin();
          if (win) win.webContents.send(MAIN_EVENTS.PROJECT_OPENED, p.path);
        };
        return { id, label: p.name };
      })
    : [{ label: '（无）', enabled: false }];

  // 固定动作
  const wc = () => getWin()?.webContents;
  menuActions['settings'] = () => {
    console.log('[menu] 设置 clicked');
    const win = getWin();
    if (win) win.webContents.send(MAIN_EVENTS.OPEN_SETTINGS);
  };
  menuActions['quit'] = () => app.quit();
  menuActions['open-project'] = () => { void openProjectDialog(); };
  menuActions['about'] = () => { void showAbout(); };
  menuActions['undo'] = () => wc()?.undo();
  menuActions['redo'] = () => wc()?.redo();
  menuActions['cut'] = () => wc()?.cut();
  menuActions['copy'] = () => wc()?.copy();
  menuActions['paste'] = () => wc()?.paste();
  menuActions['selectAll'] = () => wc()?.selectAll();
  menuActions['reload'] = () => wc()?.reload();
  menuActions['resetZoom'] = () => wc()?.setZoomLevel(0);
  menuActions['zoomIn'] = () => { const c = wc(); if (c) c.setZoomLevel(c.getZoomLevel() + 0.5); };
  menuActions['zoomOut'] = () => { const c = wc(); if (c) c.setZoomLevel(c.getZoomLevel() - 0.5); };
  menuActions['togglefullscreen'] = () => {
    const win = getWin();
    if (win) win.setFullScreen(!win.isFullScreen());
  };
  menuActions['minimize'] = () => getWin()?.minimize();
  menuActions['close'] = () => getWin()?.close();

  menuModel = [
    {
      label: '文件',
      submenu: [
        { id: 'settings', label: '设置', accelerator: 'CmdOrCtrl+,' },
        { separator: true },
        { id: 'quit', role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { id: 'undo', role: 'undo', label: '撤销' },
        { id: 'redo', role: 'redo', label: '重做' },
        { separator: true },
        { id: 'cut', role: 'cut', label: '剪切' },
        { id: 'copy', role: 'copy', label: '复制' },
        { id: 'paste', role: 'paste', label: '粘贴' },
        { id: 'selectAll', role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: 'Project',
      submenu: [
        { id: 'open-project', label: '打开项目', accelerator: 'CmdOrCtrl+O' },
        { separator: true },
        { label: '最近项目', submenu: recentSubmenu }
      ]
    },
    {
      label: '视图',
      submenu: [
        { id: 'reload', role: 'reload', label: '重新加载' },
        { separator: true },
        { id: 'resetZoom', role: 'resetZoom', label: '重置缩放' },
        { id: 'zoomIn', role: 'zoomIn', label: '放大' },
        { id: 'zoomOut', role: 'zoomOut', label: '缩小' },
        { separator: true },
        { id: 'togglefullscreen', role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { id: 'minimize', role: 'minimize', label: '最小化' },
        { id: 'close', role: 'close', label: '关闭' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { id: 'about', label: '关于' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuModel.map(toNative)));

  // 通知渲染进程刷新 HTML 菜单栏（最近项目等动态项可能变化）
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(MAIN_EVENTS.MENU_UPDATED);
  }
}

// 供 IPC 返回给渲染进程的菜单模型
export function getMenuModel(): MenuModelNode[] {
  return menuModel;
}

// HTML 菜单栏点击回调
export function invokeMenuAction(id: string): void {
  menuActions[id]?.();
}

// titleBarOverlay 配色（与外壳 CSS 变量 --bg-bar / --text 保持一致）
export function titleBarOverlayOptions(light: boolean) {
  return light
    ? { color: '#ececf0', symbolColor: '#3b3b42', height: 36 }
    : { color: '#121214', symbolColor: '#c9c9cf', height: 36 };
}

// 主题切换时同步原生窗口按钮（最小化/最大化/关闭）配色
export function applyTitleBarOverlay(win: BrowserWindow, light: boolean): void {
  try {
    win.setTitleBarOverlay(titleBarOverlayOptions(light));
  } catch (error) {
    console.error('[titlebar] 设置 titleBarOverlay 失败:', error);
  }
}
