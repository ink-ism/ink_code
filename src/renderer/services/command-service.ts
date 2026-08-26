/**
 * 命令注册表
 * 集中管理所有可绑定命令（ID + 标签 + 默认快捷键）
 * 根据键绑定配置动态注册 Monaco addCommand 和全局 keydown 监听
 */

import { Keybinding } from '../../common/types';

export interface CommandDef {
  id: string;
  label: string;
  defaultKey: string;  // 默认快捷键，如 'ctrl+s'
}

// 所有可绑定命令
export const COMMANDS: CommandDef[] = [
  { id: 'file.save', label: '文件: 保存', defaultKey: 'ctrl+s' },
  { id: 'file.saveAll', label: '文件: 全部保存', defaultKey: 'ctrl+shift+s' },
  { id: 'file.newFile', label: '文件: 新建文件', defaultKey: 'ctrl+n' },
  { id: 'file.newFolder', label: '文件: 新建文件夹', defaultKey: '' },
  { id: 'edit.undo', label: '编辑: 撤销', defaultKey: 'ctrl+z' },
  { id: 'edit.redo', label: '编辑: 重做', defaultKey: 'ctrl+y' },
  { id: 'view.toggleTerminal', label: '视图: 切换终端', defaultKey: 'ctrl+`' },
  { id: 'search.find', label: '搜索: 文件内查找', defaultKey: 'ctrl+f' },
  { id: 'search.findInFiles', label: '搜索: 全局搜索', defaultKey: 'ctrl+shift+f' },
  { id: 'search.replace', label: '搜索: 搜索替换', defaultKey: 'ctrl+h' },
  { id: 'search.quickOpen', label: '搜索: 快速打开', defaultKey: 'ctrl+p' },
  { id: 'view.toggleSidebar', label: '视图: 切换侧边栏', defaultKey: 'ctrl+b' },
  { id: 'view.toggleOutline', label: '视图: 切换大纲', defaultKey: '' },
  { id: 'editor.format', label: '编辑器: 格式化文档', defaultKey: 'shift+alt+f' },
  { id: 'editor.goToDefinition', label: '编辑器: 跳转定义', defaultKey: 'f12' },
  { id: 'editor.findReferences', label: '编辑器: 查找引用', defaultKey: 'shift+f12' },
  { id: 'task.build', label: '运行: 编译', defaultKey: 'ctrl+shift+b' },
  { id: 'task.run', label: '运行: 运行', defaultKey: 'f5' },
  { id: 'task.buildRun', label: '运行: 编译并运行', defaultKey: 'ctrl+f5' }
];

// 命令处理器注册表
type CommandHandler = () => void;
const handlers = new Map<string, CommandHandler>();

// 当前键绑定映射（command -> key）
let activeBindings: Map<string, string> = new Map();

/**
 * 注册命令处理器
 */
export function registerCommand(id: string, handler: CommandHandler) {
  handlers.set(id, handler);
}

/**
 * 解析快捷键字符串为 keydown 匹配条件
 */
function parseKey(keyStr: string): { key: string; ctrl: boolean; shift: boolean; alt: boolean; meta: boolean } {
  const parts = keyStr.toLowerCase().split('+').map(s => s.trim());
  return {
    key: parts[parts.length - 1],
    ctrl: parts.includes('ctrl') || parts.includes('cmd'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    meta: parts.includes('meta')
  };
}

/**
 * 检查 keydown 事件是否匹配快捷键
 */
function matchesKey(e: KeyboardEvent, parsed: ReturnType<typeof parseKey>): boolean {
  if (e.ctrlKey !== parsed.ctrl && !(e.metaKey && parsed.ctrl)) return false;
  if (e.shiftKey !== parsed.shift) return false;
  if (e.altKey !== parsed.alt) return false;
  const eventKey = e.key.toLowerCase();
  return eventKey === parsed.key;
}

// 全局 keydown 监听器（已注册）
let globalListener: ((e: KeyboardEvent) => void) | null = null;

/**
 * 应用键绑定配置
 * 移除旧的全局快捷键监听，注册新的
 */
export function applyKeybindings(userBindings: Keybinding[]) {
  // 构建最终绑定表（用户覆盖默认）
  const defaultMap = new Map(COMMANDS.map(c => [c.id, c.defaultKey]));
  for (const b of userBindings) {
    if (b.key) {
      defaultMap.set(b.command, b.key);
    }
  }
  activeBindings = defaultMap;

  // 移除旧监听器
  if (globalListener) {
    document.removeEventListener('keydown', globalListener, true);
  }

  // 注册新全局快捷键监听
  globalListener = (e: KeyboardEvent) => {
    // 不拦截 Monaco 编辑器内部的快捷键（除非是全局命令）
    for (const [cmdId, keyStr] of activeBindings) {
      if (!keyStr) continue;
      const parsed = parseKey(keyStr);
      if (matchesKey(e, parsed)) {
        const handler = handlers.get(cmdId);
        if (handler) {
          e.preventDefault();
          handler();
          return;
        }
      }
    }
  };
  document.addEventListener('keydown', globalListener, true);
}

/**
 * 获取所有命令及其当前绑定
 */
export function getCommandsWithKeys(): Array<CommandDef & { currentKey: string }> {
  return COMMANDS.map(cmd => ({
    ...cmd,
    currentKey: activeBindings.get(cmd.id) || cmd.defaultKey
  }));
}
