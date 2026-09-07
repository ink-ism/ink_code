import { monaco } from './monaco';

// 空捕获组用于补齐分组 action 的数量：Monarch 要求 action 数组长度等于捕获组数
const NONE = '';

/**
 * Vue 单文件组件语法高亮
 * Monaco 无内置 vue 文法。template 段自写，以便把 Vue 指令（v- / : / @ / #）
 * 与普通属性区分着色，并识别 {{ }} 插值表达式；
 * script 与 style 段用 nextEmbedded 交给真实的 typescript / javascript /
 * scss / less / css 文法，避免手写半截 JS/CSS 规则。
 */
export function registerVueLanguage(): void {
  monaco.languages.register({ id: 'vue' });

  monaco.languages.setLanguageConfiguration('vue', {
    comments: { blockComment: ['<!--', '-->'] },
    brackets: [['<!--', '-->'], ['<', '>'], ['{', '}'], ['(', ')'], ['[', ']']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '<', close: '>' }
    ],
    surroundingPairs: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '<', close: '>' }
    ],
    onEnterRules: [
      {
        beforeText: new RegExp('<(?!(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr))([_:\\w][_:\\w-.\\d]*)([^/>]*(?!/)>)[^<]*$', 'i'),
        afterText: /^<\/([_:\w][_:\w-.\d]*)\s*>$/i,
        action: { indentAction: monaco.languages.IndentAction.IndentOutdent }
      }
    ]
  });

  monaco.languages.setMonarchTokensProvider('vue', {
    defaultToken: NONE,
    tokenPostfix: '.vue',

    tokenizer: {
      root: [
        // 块级 script / style：整开标签匹配后切入嵌入语言，闭合标签处退出
        // lang 变体必须排在通用规则之前
        [/(<)(script)(\s[^>]*lang=["'](?:js|javascript|jsx)["'][^>]*)(>)/, [
          'delimiter', 'tag', NONE,
          { token: 'delimiter', next: '@scriptEmbedded', nextEmbedded: 'javascript' }
        ]],
        [/(<)(script)([^>]*)(>)/, [
          'delimiter', 'tag', NONE,
          { token: 'delimiter', next: '@scriptEmbedded', nextEmbedded: 'typescript' }
        ]],
        [/(<)(style)(\s[^>]*lang=["'](?:scss|sass)["'][^>]*)(>)/, [
          'delimiter', 'tag', NONE,
          { token: 'delimiter', next: '@styleEmbedded', nextEmbedded: 'scss' }
        ]],
        [/(<)(style)(\s[^>]*lang=["']less["'][^>]*)(>)/, [
          'delimiter', 'tag', NONE,
          { token: 'delimiter', next: '@styleEmbedded', nextEmbedded: 'less' }
        ]],
        [/(<)(style)([^>]*)(>)/, [
          'delimiter', 'tag', NONE,
          { token: 'delimiter', next: '@styleEmbedded', nextEmbedded: 'css' }
        ]],
        { include: '@markup' }
      ],

      markup: [
        [/(<)([\w\-]+)(\s*)(\/>)/, ['delimiter', 'tag', NONE, 'delimiter']],
        // 开始标签：属性交给 @tag 状态（命名空间前缀写进同一捕获组，可选捕获组会让 Monarch 取到 undefined）
        [/(<)([\w\-]+(?::[\w\-]+)?)/, ['delimiter', { token: 'tag', next: '@tag' }]],
        // 结束标签
        [/(<\/)([\w\-]+(?::[\w\-]+)?)(\s*)(>)/, ['delimiter', 'tag', NONE, 'delimiter']],
        [/<\/[\w\-:]+/, 'delimiter'],
        { include: '@common' }
      ],

      common: [
        [/<!DOCTYPE/, 'metatag', '@doctype'],
        [/<!--/, 'comment', '@comment'],
        // 插值表达式
        [/\{\{/, { token: 'delimiter', next: '@mustache' }],
        // 模板文本：停在标签与插值起始处
        [/[^<{]+/, NONE],
        [/./, NONE]
      ],

      doctype: [
        [/[^>]+/, 'metatag.content'],
        [/>/, 'metatag', '@pop']
      ],

      comment: [
        [/-->/, 'comment', '@pop'],
        [/[^-]+/, 'comment'],
        [/./, 'comment']
      ],

      tag: [
        // v-if / v-bind:x / @click.stop / :prop / #slot
        [/v-[a-zA-Z][\w\-]*(?:[.:][\w\-]+)*/, 'attribute.name.directive'],
        [/[#@:][a-zA-Z][\w\-]*(?:[.:][\w\-]+)*/, 'attribute.name.directive'],
        [/[\w\-]+/, 'attribute.name'],
        [/=/, 'delimiter'],
        [/"[^"]*"/, 'attribute.value'],
        [/'[^']*'/, 'attribute.value'],
        [/\/?>/, { token: 'delimiter', next: '@pop' }],
        [/[^\s>=/"']+/, NONE],
        [/./, NONE]
      ],

      mustache: [
        [/\}\}/, { token: 'delimiter', next: '@pop' }],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/\b(?:true|false|null|undefined|NaN|Infinity)\b/, 'constant.language'],
        [/\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
        [/[a-zA-Z_$][\w$]*/, 'variable'],
        [/[ \t]+/, NONE],
        [/./, 'delimiter']
      ],

      scriptEmbedded: [
        [/<\/script/, { token: '@rematch', next: '@pop', nextEmbedded: '@pop' }],
        [/[^<]+/, NONE]
      ],

      styleEmbedded: [
        [/<\/style/, { token: '@rematch', next: '@pop', nextEmbedded: '@pop' }],
        [/[^<]+/, NONE]
      ]
    }
  });
}
