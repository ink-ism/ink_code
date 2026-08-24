import * as monaco from 'monaco-editor';

/**
 * 增强版 Markdown 语法高亮
 * 覆盖 Monaco 内置 Markdown 分词器，提供：
 * 标题、粗体、斜体、行内代码、围栏代码块、链接、图片、引用、列表、分割线等 token。
 * Markdown 为按行解析语言，围栏代码块通过状态机跨行保持。
 */
export function registerMarkdownLanguage(): void {
  monaco.languages.setMonarchTokensProvider('markdown', {
    defaultToken: '',
    tokenPostfix: '.markdown',

    tokenizer: {
      root: [
        // 围栏代码块起始 ```lang / ~~~lang -> 进入 codeblock 状态
        [/^\s*(`{3,}|~{3,}).*$/, { token: 'md-code', next: '@codeblock' }],

        // 标题 # ~ ######
        [/^#{1,6}.*$/, 'md-heading'],

        // 分割线 --- / *** / ___
        [/^\s*(---+|\*\*\*+|___+)\s*$/, 'md-hr'],

        // 引用 > text
        [/^(\s*)(>)(.*)$/, ['white', 'md-quote', 'md-quote']],

        // 列表标记 - / * / + / 1. / 1)
        [/^(\s*)([-*+]|\d+[.)])(\s+)/, ['white', 'md-list', 'white']],

        // 表格分隔行 |---|---|
        [/^\s*\|?[\s:|-]+\|[\s:|-]*$/, 'md-hr'],

        // 行内元素（顺序敏感：代码 > 粗体 > 图片 > 链接 > 斜体）
        { include: '@inline' }
      ],

      // 围栏代码块内部：直到遇到结束围栏
      codeblock: [
        [/^\s*(`{3,}|~{3,})\s*$/, { token: 'md-code', next: '@pop' }],
        [/.*$/, 'md-codeline'],
        [/^$/, 'md-codeline']
      ],

      inline: [
        // 行内代码 `code`
        [/`[^`]+`/, 'md-code'],
        // 粗体 **text** / __text__（先于斜体匹配）
        [/\*\*[^*]+\*\*/, 'md-bold'],
        [/__[^_]+__/, 'md-bold'],
        // 图片 ![alt](url)（先于链接匹配）
        [/!\[[^\]]*\]\([^)]*\)/, 'md-link'],
        // 链接 [text](url)
        [/\[[^\]]*\]\([^)]*\)/, 'md-link'],
        // 斜体 *text* / _text_
        [/\*[^*\s][^*]*\*/, 'md-italic'],
        [/_[^_\s][^_]*_/, 'md-italic'],
        // 普通文本
        [/[^`*_\[!\n]+/, ''],
        [/./, '']
      ]
    }
  });
}
