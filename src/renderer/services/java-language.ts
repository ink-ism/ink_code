import * as monaco from 'monaco-editor';
import { computeRanges as computeIndentRanges } from 'monaco-editor/esm/vs/editor/contrib/folding/browser/indentRangeProvider';

/**
 * 增强版 Java 语法高亮
 * 覆盖 Monaco 内置 Java 分词器，提供更细粒度的 token 分类：
 * 注解、类型名、常量、方法调用、Javadoc、文本块、数字字面量等
 */
export function registerJavaLanguage(): void {
  monaco.languages.setMonarchTokensProvider('java', {
    defaultToken: '',
    tokenPostfix: '.java',

    keywords: [
      'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
      'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
      'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
      'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
      'package', 'private', 'protected', 'public', 'return', 'short', 'static',
      'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
      'transient', 'try', 'void', 'volatile', 'while',
      'var', 'record', 'sealed', 'permits', 'yield', 'when',
      'module', 'requires', 'exports', 'opens', 'uses', 'provides', 'open', 'transitive'
    ],

    // 控制流关键字（单独着色）
    controlKeywords: [
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
      'return', 'try', 'catch', 'finally', 'throw', 'throws', 'yield', 'when'
    ],

    literalKeywords: ['true', 'false', 'null'],

    operators: [
      '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=', '&&', '||', '++',
      '--', '+', '-', '*', '/', '&', '|', '^', '%', '<<', '>>', '>>>', '+=', '-=',
      '*=', '/=', '&=', '|=', '^=', '%=', '<<=', '>>=', '>>>='
    ],

    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4})/,
    digits: /\d+(_+\d+)*/,
    hexdigits: /[0-9a-fA-F]+(_+[0-9a-fA-F]+)*/,
    bindigits: /[01]+(_+[01]+)*/,

    tokenizer: {
      root: [
        { include: '@whitespace' },

        // 注解：@Override @Autowired
        [/@[a-zA-Z_$][\w$]*/, 'annotation'],

        // 文本块 """..."""
        [/"""/, 'string', '@textBlock'],

        // 字符串
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string'],

        // 字符字面量
        [/'([^\\']|\\.)'/, 'string.character'],

        // 数字字面量
        [/0[xX]@hexdigits[lL]?/, 'number.hex'],
        [/0[bB]@bindigits[lL]?/, 'number.binary'],
        [/@digits\.@digits([eE][+\-]?@digits)?[fFdD]?/, 'number.float'],
        [/@digits[fFdD]/, 'number.float'],
        [/@digits[lL]?/, 'number'],

        // 括号与运算符
        [/[{}()\[\]]/, '@brackets'],
        [/[<>](?!@symbols)/, '@brackets'],
        [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],
        [/[;,.]/, 'delimiter'],

        // 常量：全大写+下划线/数字（MAX_VALUE）
        [/\b[A-Z][A-Z0-9_]{2,}\b/, 'constant'],

        // 方法调用/声明：小写开头且后跟 (
        [/\b[a-z_$][\w$]*(?=\s*\()/, {
          cases: {
            '@controlKeywords': 'keyword.control',
            '@keywords': 'keyword',
            '@default': 'method'
          }
        }],

        // 类型名：大写开头（String、UserService、T）
        [/\b[A-Z][\w$]*/, 'type'],

        // 普通标识符 / 关键字
        [/[a-zA-Z_$][\w$]*/, {
          cases: {
            '@controlKeywords': 'keyword.control',
            '@keywords': 'keyword',
            '@literalKeywords': 'constant.language',
            '@default': 'identifier'
          }
        }]
      ],

      whitespace: [
        [/[ \t\r\n]+/, ''],
        [/\/\*\*/, 'comment.doc', '@javadoc'],
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment']
      ],

      // Javadoc 注释：@param @return 等标签高亮
      javadoc: [
        [/[^@*\/]+/, 'comment.doc'],
        [/@[a-zA-Z]+/, 'comment.doc.tag'],
        [/\*\//, 'comment.doc', '@pop'],
        [/[*\/]/, 'comment.doc']
      ],

      comment: [
        [/[^\/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[\/*]/, 'comment']
      ],

      string: [
        [/[^\\"]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"/, 'string', '@pop']
      ],

      textBlock: [
        [/[^\\"]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape'],
        [/"""/, 'string', '@pop'],
        [/"/, 'string']
      ]
    }
  });

  // 自定义主题（VS Code Dark+ 风格配色）
  monaco.editor.defineTheme('ink-java-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '569cd6' },
      { token: 'keyword.control', foreground: 'c586c0' },
      { token: 'constant', foreground: '4fc1ff' },
      { token: 'constant.language', foreground: '569cd6', fontStyle: 'italic' },
      { token: 'type', foreground: '4ec9b0' },
      { token: 'method', foreground: 'dcdcaa' },
      { token: 'identifier', foreground: '9cdcfe' },
      { token: 'annotation', foreground: 'd7ba7d' },
      { token: 'string', foreground: 'ce9178' },
      { token: 'string.escape', foreground: 'd7ba7d' },
      { token: 'string.character', foreground: 'ce9178' },
      { token: 'string.invalid', foreground: 'f48771' },
      { token: 'number', foreground: 'b5cea8' },
      { token: 'number.hex', foreground: 'b5cea8' },
      { token: 'number.binary', foreground: 'b5cea8' },
      { token: 'number.float', foreground: 'b5cea8' },
      { token: 'comment', foreground: '6a9955' },
      { token: 'comment.doc', foreground: '608b4e' },
      { token: 'comment.doc.tag', foreground: '9cdcfe' },
      { token: 'operator', foreground: 'd4d4d4' },
      { token: 'delimiter', foreground: 'd4d4d4' },

      // SQL 扩展 token
      { token: 'keyword.ddl', foreground: 'c586c0', fontStyle: 'bold' },
      { token: 'keyword.constraint', foreground: '4fc1ff' },
      { token: 'type.table', foreground: '4ec9b0', fontStyle: 'bold' },
      { token: 'variable', foreground: '9cdcfe', fontStyle: 'italic' },
      { token: 'identifier.quote', foreground: 'd4d4d4' },

      // Markdown 扩展 token
      { token: 'md-heading', foreground: '569cd6', fontStyle: 'bold' },
      { token: 'md-bold', foreground: 'ececef', fontStyle: 'bold' },
      { token: 'md-italic', foreground: 'c9c9cf', fontStyle: 'italic' },
      { token: 'md-code', foreground: 'ce9178' },
      { token: 'md-codeline', foreground: 'ce9178' },
      { token: 'md-link', foreground: '5b9dff', fontStyle: 'underline' },
      { token: 'md-quote', foreground: '6a9955', fontStyle: 'italic' },
      { token: 'md-list', foreground: '569cd6' },
      { token: 'md-hr', foreground: '8f8f98' }
    ],
    colors: {
      'editor.background': '#17171a',
      'editor.lineHighlightBackground': '#1f1f24',
      'editorLineNumber.foreground': '#4f4f58',
      'editorLineNumber.activeForeground': '#b8b8c0',
      'editor.selectionBackground': '#2b3a5c',
      'editorIndentGuide.background': '#26262b',
      'editorCursor.foreground': '#5b9dff',
      'editorWidget.background': '#1c1c20',
      'editorSuggestWidget.background': '#1c1c20',
      'editorSuggestWidget.border': '#3a3a42'
    }
  });

  // Java 折叠范围：注册自定义 provider 后会替代默认缩进折叠，
  // 因此需同时返回缩进折叠（方法体/类体）+ import 块两部分
  monaco.languages.registerFoldingRangeProvider('java', {
    async provideFoldingRanges(model) {
      const ranges: monaco.languages.FoldingRange[] = [];

      // 1. 缩进折叠（方法体、类体、代码块等；Java 无 offSide，markers 支持 // #region）
      try {
        const regions = computeIndentRanges(model, false, {
          start: /^\s*\/\/\s*#?region\b/,
          end: /^\s*\/\/\s*#?endregion\b/
        });
        for (let i = 0; i < regions.length; i++) {
          ranges.push({
            start: regions.getStartLineNumber(i),
            end: regions.getEndLineNumber(i)
          });
        }
      } catch (err) {
        console.warn('计算缩进折叠范围失败:', err);
      }

      // 2. import 块折叠
      const block = findImportBlock(model);
      if (block) {
        ranges.push({ start: block.start, end: block.end, kind: monaco.languages.FoldingRangeKind.Region });
      }
      return ranges;
    }
  });
}

/**
 * 定位 Java 文件的 import 块（1-based 行号）
 * import 之前只允许 package/空行/注释；import 之间容忍空行/注释；
 * 遇到其它语句即认为 import 块结束
 */
export function findImportBlock(model: monaco.editor.ITextModel | null): { start: number; end: number } | null {
  if (!model) return null;
  const lineCount = model.getLineCount();
  let start = -1;
  let end = -1;
  for (let i = 1; i <= lineCount; i++) {
    const text = model.getLineContent(i).trim();
    const isCommentOrBlank = text === '' || text.startsWith('//') || text.startsWith('/*') || text.startsWith('*');
    if (/^import\s/.test(text)) {
      if (start < 0) start = i;
      end = i;
    } else if (start > 0) {
      if (isCommentOrBlank) continue;
      break;
    } else {
      if (isCommentOrBlank || text.startsWith('package')) continue;
      break;
    }
  }
  return start > 0 && end > start ? { start, end } : null;
}
