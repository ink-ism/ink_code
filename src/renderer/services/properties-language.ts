import { monaco } from './monaco';

/**
 * Java Properties 配置文件语法高亮（自定义 Monarch 文法）
 * Monaco 内置无 properties 语言，按 java.util.Properties 规则实现：
 * - 注释：行首 # 或 !（前置空白容忍）
 * - 键值分隔：= 或 :（两侧空白容忍）
 * - 反斜杠换行为续行，续行内容归入 value
 * - 布尔取值（true/false）与纯数字高亮，占位符 ${...} 高亮
 */
export function registerPropertiesLanguage(): void {
  // 按需导入下无内置 properties 贡献，需显式注册语言 id
  monaco.languages.register({
    id: 'properties',
    extensions: ['.properties'],
    aliases: ['Properties', 'properties']
  });
  monaco.languages.setMonarchTokensProvider('properties', {
    defaultToken: '',
    tokenPostfix: '.properties',

    tokenizer: {
      root: [
        // 注释：# 或 ! 起（前导空白并入分组，避免被 whitespace 先消费后 ^ 锚点失效）
        [/^([ \t]*)([#!].*)$/, ['', 'comment']],
        // 键：到分隔符（=/:）或行尾为止；键内 \= \: 转义不视为分隔符
        [/((?:[^\\=:\s]|\\.)+)(\s*)([=:]?)/, ['key', 'white', 'delimiter'], '@value'],
        // 无键行（孤立分隔符等）
        [/[=:]/, 'delimiter', '@value'],
        { include: '@whitespace' }
      ],

      whitespace: [
        [/[ \t\r\n]+/, '']
      ],

      value: [
        // 行尾反斜杠：续行
        [/\\$/, 'string.escape', '@continuation'],
        // 占位符 ${...}
        [/\$\{[^}]*\}/, 'variable'],
        // 布尔取值
        [/\b(?:true|false)\b/, 'keyword'],
        // 纯数字值（行尾）
        [/[+-]?\d+(?:\.\d+)?(?=\s*$)/, 'number'],
        // 双引号字符串
        [/"/, 'string', '@string'],
        // 普通取值文本
        [/[^\\\n$"]+/, 'string.value'],
        [/[$\\]/, 'string.value'],
        // 行尾回到 root（无续行时取值不跨行）
        [/$/, '', '@pop']
      ],

      // 续行内容仍属同一取值
      continuation: [
        [/^([ \t]*)(\\)$/, ['', 'string.escape']],
        [/^[ \t]+/, ''],
        [/./, { token: 'string.value', next: '@value' }],
        [/$/, '', '@popall']
      ],

      string: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop'],
        [/$/, 'string', '@popall']
      ]
    }
  });
}
