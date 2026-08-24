/**
 * Monaco 按需导入入口
 * 全量 monaco-editor 入口会一次性注册全部 80 种内置语言与基于 worker 的
 * 语言服务（ts/json/css/html），渲染进程堆基线与 bundle 体积偏大。
 * 这里只引入：
 * - editor.api：公共 API（create / createModel / setTheme / languages 等）
 * - editor.all：编辑器功能（折叠 / 查找 / 补全 / 右键菜单 / 括号匹配等）
 * - basic-languages：纯 Monarch 高亮，无 worker 依赖
 * java / sql / markdown 使用项目自定义文法，json 见 json-language 轻量注册；
 * worker 仍由 vite-plugin-monaco-editor 统一产出，与导入方式解耦。
 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/editor.all.js';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution.js';

export { monaco };
