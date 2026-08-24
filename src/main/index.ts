import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import { join } from 'path';
import { registerIpcHandlers } from './ipc-handlers';
import { loadRecentProjects, addRecentProject } from './config-service';
import { MAIN_EVENTS } from '../common/types';

let mainWindow: BrowserWindow | null = null;

// 检测是否在开发模式（通过命令行参数或环境变量）
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

// 获取当前窗口
function getWin(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() || mainWindow;
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

/**
 * 创建应用菜单栏
 * 文件菜单含设置页，Project 菜单含打开项目和最近项目
 */
async function createMenu() {
  const recentProjects = await loadRecentProjects();

  const recentSubmenu: Electron.MenuItemConstructorOptions[] = recentProjects.length > 0
    ? recentProjects.map(p => ({
        label: p.name,
        click: () => {
          const win = getWin();
          if (win) win.webContents.send(MAIN_EVENTS.PROJECT_OPENED, p.path);
        }
      }))
    : [{ label: '（无）', enabled: false }];

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '设置',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            console.log('[menu] 设置 clicked');
            const win = getWin();
            console.log('[menu] win:', !!win);
            if (win) win.webContents.send(MAIN_EVENTS.OPEN_SETTINGS);
          }
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: 'Project',
      submenu: [
        { label: '打开项目', accelerator: 'CmdOrCtrl+O', click: () => openProjectDialog() },
        { type: 'separator' },
        { label: '最近项目', submenu: recentSubmenu }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于', click: () => showAbout() }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#17171a',
    icon: join(__dirname, '../../../build/icon.ico'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    // 开发模式加载 Vite 开发服务器
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式加载打包后的文件
    mainWindow.loadFile(join(__dirname, '../../renderer/index.html'));
  }

  // 转发渲染进程 console 日志到主进程终端（便于诊断）
  mainWindow.webContents.on('console-message', (_event, _level, message) => {
    console.log('[renderer]', message);
  });

  // 阻止渲染进程内部导航（Markdown 预览链接已经 IPC 交由系统浏览器打开）
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) {
      event.preventDefault();
    }
  });

  // 拦截新开窗口请求，仅允许外链走系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
