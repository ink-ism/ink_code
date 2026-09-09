import { app, BrowserWindow, shell, nativeTheme } from 'electron';
import { join } from 'path';
import { registerIpcHandlers } from './ipc-handlers';
import { loadSettings } from './config-service';
import { isLightTheme } from '../common/types';
import { createMenu, titleBarOverlayOptions } from './menu-service';
import { registerTerminalHandlers, destroyAllTerminals } from './terminal-service';
import { registerTaskHandlers, destroyAllTasks } from './task-service';
import { registerLspHandlers, stopLanguageServer } from './lsp/connection';

let mainWindow: BrowserWindow | null = null;

// 窗口底色：随保存的主题同步（浅色主题用白底，避免启动闪黑）
let windowBg = '#17171a';

// 当前主题是否浅色（决定 titleBarOverlay 配色）
let lightTheme = false;

// 检测是否在开发模式（通过命令行参数或环境变量）
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: windowBg,
    icon: join(__dirname, '../../../build/icon.ico'),
    // 隐藏原生标题栏，顶部区域由 HTML 自绘；右上角保留原生窗口按钮（overlay）
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarOverlayOptions(lightTheme),
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
  registerTerminalHandlers();
  registerTaskHandlers();
  registerLspHandlers();
  await createMenu();
  // 创建窗口前读取配置，窗口底色 / 标题栏按钮配色与主题保持一致
  const startupSettings = await loadSettings();
  lightTheme = isLightTheme(startupSettings.theme);
  windowBg = lightTheme ? '#ffffff' : '#17171a';
  nativeTheme.themeSource = lightTheme ? 'light' : 'dark';
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  destroyAllTerminals();
  destroyAllTasks();
  void stopLanguageServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
