import { monaco } from './monaco';
import { computeRanges as computeIndentRanges } from 'monaco-editor/esm/vs/editor/contrib/folding/browser/indentRangeProvider';

/**
 * 增强版 Java 语法高亮
 * 覆盖 Monaco 内置 Java 分词器，提供更细粒度的 token 分类：
 * 注解、类型名、常量、方法调用、Javadoc、文本块、数字字面量等
 */
export function registerJavaLanguage(): void {
  // 按需导入下内置 java 贡献不再加载，需显式注册语言 id
  monaco.languages.register({ id: 'java' });
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
