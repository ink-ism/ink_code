# InkCode

基于 **Electron + Monaco Editor** 的轻量级代码编辑器，面向 Java 项目的日常浏览与编辑场景，提供文件树、符号大纲、全局搜索、Git 集成、GBK/UTF-8 编码自动识别等能力，并内置 SQL / Markdown / JSON / Properties 增强高亮与 Markdown 实时预览。

## 功能特性

- **文件树浏览**：打开项目目录，懒加载子目录，支持鼠标拖拽调整侧边栏宽度（双击恢复默认）
- **多标签编辑**：Monaco Editor 多 TextModel 标签页，未保存文件显示 ● 标记，关闭前确认
- **自绘标题栏与菜单栏**：原生标题栏隐藏，顶部 HTML 接管；菜单模型来自主进程，支持快捷键与最近项目
- **Java 增强高亮**：自定义 Monarch 分词器（注解、Javadoc、文本块、常量等细粒度着色）
- **SQL 增强高亮**：自定义 Monarch 分词器，DDL 关键字 / 约束 / 数据类型 / 表名 / 索引名 / 内置函数 / 常量 差异化着色
- **JSON 高亮**：轻量 Monarch 文法，键 / 字符串 / 数字 / 常量 / 括号差异化着色
- **Properties 高亮**：支持 `#`/`!` 注释、键值分隔（`=`/`:`）、反斜杠续行、布尔/数字/占位符高亮
- **Markdown 高亮与预览**：语法高亮 + 渲染预览（GFM），纯编辑 / 双栏 / 纯预览三种模式；双栏模式与编辑器共用滚动条双向同步
- **import 块自动折叠**：打开 Java 文件自动折叠 import 区，方法/类体缩进折叠正常
- **符号大纲**：解析 Java 文件的类/方法/字段符号，点击跳转到对应行
- **快速打开**：`Ctrl+P` 模糊匹配项目内文件（按相关性打分排序）
- **全局搜索**：`Ctrl+Shift+F` 全文搜索，结果按文件分组，点击跳转
- **Git 集成**：状态查看、暂存/丢弃、提交、分支管理、合并、拉取/推送/获取、diff 查看（工作区/暂存区/历史）、提交历史浏览
- **编码自动识别**：UTF-8 严格校验失败自动回退 GBK，保存时按原编码写回，状态栏显示当前编码
- **会话恢复**：启动时自动恢复上次打开的项目和标签页
- **本地配置**：主题/字体/配置目录可自定义，最近项目列表（最多 10 条）
- **状态栏**：光标位置、总行数、文件编码、路径面包屑、Git 分支

## 技术栈

| 技术 | 版本 | 用途 |
|---|---|---|
| Electron | 28.x | 桌面应用框架（三进程 + contextIsolation） |
| Vite | 5.x | 渲染进程构建与开发服务器 |
| TypeScript | 5.3 | 开发语言（主/渲染进程强类型） |
| Monaco Editor | 0.45 | 代码编辑器内核 |
| iconv-lite | 0.7 | GBK 编解码 |
| marked | 18.x | Markdown 渲染（GFM） |
| koffi | 3.x | Windows DWM API 调用（自绘标题栏主题同步） |
| electron-builder | 24.x | 生产打包（NSIS + Portable） |

## 目录结构

```
src/
├── common/
│   └── types.ts            # IPC 通道常量、主进程事件、共享类型定义
├── main/                   # Electron 主进程
│   ├── index.ts            # 入口：窗口、图标
│   ├── preload.ts          # 预加载脚本（沙箱模式，常量内联）
│   ├── ipc-handlers.ts     # IPC 请求处理注册
│   ├── menu-service.ts     # 自定义菜单栏模型与动作表
│   ├── file-service.ts     # 目录扫描、文件读写
│   ├── encoding.ts         # UTF-8/GBK 自动识别与编码回写
│   ├── search-service.ts   # 快速打开文件列表、全局搜索
│   ├── index-service.ts    # Java 符号解析（类/方法/字段）
│   ├── git-service.ts      # Git 操作（状态/提交/分支/diff/日志）
│   └── config-service.ts   # 本地配置：settings/ 与 history/ 分文件夹存储
└── renderer/               # 渲染进程
    ├── index.ts            # 入口：组件装配、快捷键、会话恢复
    ├── index.html          # 页面骨架（标题栏/活动栏/侧边栏/编辑区/状态栏）
    ├── components/         # TitleBar / EditorPane / FileTree / OutlinePanel /
    │                       # QuickOpen / SearchPanel / SettingsPanel / GitPanel /
    │                       # DiffViewer / MarkdownPreview
    ├── services/           # monaco（统一导出）、java-language（高亮+折叠）、
    │                       # sql-language / json-language / markdown-language /
    │                       # properties-language / icons（文件图标）
    └── styles/main.css     # 全局样式（暗色/浅色主题）
```

## 快速开始

### 环境要求

- Node.js 18+
- npm

### 开发模式

```bash
npm install
npm run electron:dev
```

Vite 开发服务器监听 `http://localhost:5173`，Electron 自动加载并打开 DevTools。

### 生产打包

```bash
# （国内网络建议先设置镜像）
# PowerShell:
# $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
# $env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"

npm run electron:build
```

产物输出到 `release/` 目录：

- `InkCode Setup x.y.z.exe` — NSIS 安装包
- `InkCode x.y.z.exe` — 免安装便携版

### 应用图标

图标由脚本生成（无需外部设计资源）：

```bash
npm run icon   # 生成 build/icon.ico（256x256 墨滴图案）
```

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl+O` | 打开项目 |
| `Ctrl+P` | 快速打开文件 |
| `Ctrl+Shift+F` | 全局搜索 |
| `Ctrl+S` | 保存当前文件 |
| `Ctrl+,` | 设置 |
| `Ctrl+Shift+V` | Markdown 纯编辑 / 双栏 / 纯预览模式循环切换 |
| `F5` | Git 面板刷新 |

## 本地配置存储

配置按文件夹分类存放（默认位于用户目录，可在设置页修改）：

```
<配置根目录>/
├── settings/
│   └── editor.json           # 主题、字体大小、配置目录
└── history/
    ├── recent-projects.json  # 最近项目（最多 10 条）
    └── session.json          # 会话状态（项目 + 打开的标签页）
```

## 注意事项

- 预加载脚本运行于 Electron 沙箱，**不能** `require` 本地相对路径模块，因此 `preload.ts` 中的 IPC 通道常量为内联定义，与 `src/common/types.ts` 需保持同步
- `electron-builder` 的 `build.files` 白名单已显式包含 `node_modules/iconv-lite/**` 与 `node_modules/safer-buffer/**`，新增主进程运行时依赖时须同步加入
- 全局搜索限制：单文件 ≤1MB、最多返回 500 条匹配、最多遍历 20000 个文件，自动跳过 `node_modules`、`.git`、`target` 等目录
- Git 功能依赖系统安装的 `git` 命令行工具，不引入额外 Node.js Git 库
- 自绘标题栏通过 `koffi` 调用 Windows DWM API 实现主题同步，仅 Windows 平台生效
