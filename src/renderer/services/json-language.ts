import { monaco } from './monaco';

/**
 * 轻量 JSON 语法高亮（纯 Monarch）
 * 不引入基于 worker 的 json 语言服务，仅区分键 / 字符串 / 数字 / 常量 / 括号
 */
export function registerJsonLanguage(): void {
  monaco.languages.register({ id: 'json' });
  monaco.languages.setMonarchTokensProvider('json', {
    defaultToken: '',
    tokenPostfix: '.json',
    escapes: /\\(?:["\\\/bfnrt]|u[0-9A-Fa-f]{4})/,

    tokenizer: {
      root: [
        // 空白
        [/[ \t\r\n]+/, ''],

        // 键（后跟冒号的字符串，须先于普通字符串匹配）
        [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'type'],

        // 字符串值
        [/"(?:[^"\\]|\\.)*"/, 'string'],

        // 常量
        [/\b(?:true|false|null)\b/, 'constant.language'],

        // 数字
        [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],

        // 括号与分隔符
        [/[{}[\]]/, '@brackets'],
        [/[,:]/, 'delimiter']
      ]
    }
  });
}
