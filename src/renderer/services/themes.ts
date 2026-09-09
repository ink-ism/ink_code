import { monaco } from './monaco';

// token 名沿用 Monaco 的层级命名（点分为子级），未在本表出现的 token 由 base 主题兜底
interface TokenStyle {
  token: string;
  dark: string;
  light: string;
  fontStyle?: string;
}

/**
 * 编辑器主题
 * 深色沿用 VS Code Dark+ 配色，浅色沿用 Light+ 配色，两套共用同一张 token 表，
 * 新增 token 时必须同时给出 dark/light，避免只在一种主题下有颜色。
 */
const TOKEN_STYLES: TokenStyle[] = [
  // 通用语言 token（java / js / ts / python / go / shell 等）
  { token: 'keyword', dark: '569cd6', light: '0000ff' },
  { token: 'keyword.control', dark: 'c586c0', light: 'af00db' },
  { token: 'constant', dark: '4fc1ff', light: '0070c1' },
  { token: 'constant.language', dark: '569cd6', light: '0000ff', fontStyle: 'italic' },
  { token: 'type', dark: '4ec9b0', light: '267f99' },
  { token: 'method', dark: 'dcdcaa', light: '795e26' },
  { token: 'identifier', dark: '9cdcfe', light: '001080' },
  { token: 'annotation', dark: 'd7ba7d', light: '795e26' },
  { token: 'string', dark: 'ce9178', light: 'a31515' },
  { token: 'string.escape', dark: 'd7ba7d', light: '0451a5' },
  { token: 'string.character', dark: 'ce9178', light: 'a31515' },
  { token: 'string.invalid', dark: 'f48771', light: 'cd3333' },
  { token: 'number', dark: 'b5cea8', light: '098658' },
  { token: 'number.hex', dark: 'b5cea8', light: '098658' },
  { token: 'number.binary', dark: 'b5cea8', light: '098658' },
  { token: 'number.octal', dark: 'b5cea8', light: '098658' },
  { token: 'number.float', dark: 'b5cea8', light: '098658' },
  { token: 'comment', dark: '6a9955', light: '008000' },
  { token: 'comment.doc', dark: '608b4e', light: '008000' },
  { token: 'comment.doc.tag', dark: '9cdcfe', light: '0000ff' },
  { token: 'operator', dark: 'd4d4d4', light: '000000' },
  { token: 'delimiter', dark: 'd4d4d4', light: '000000' },
  { token: 'variable', dark: '9cdcfe', light: '001080', fontStyle: 'italic' },
  { token: 'variable.predefined', dark: '4fc1ff', light: '0070c1', fontStyle: 'italic' },

  // SQL 扩展 token
  { token: 'keyword.ddl', dark: 'c586c0', light: 'af00db', fontStyle: 'bold' },
  { token: 'keyword.constraint', dark: '4fc1ff', light: '0070c1' },
  { token: 'type.table', dark: '4ec9b0', light: '267f99', fontStyle: 'bold' },
  { token: 'identifier.quote', dark: 'd4d4d4', light: '000000' },

  // Markdown 扩展 token
  { token: 'md-heading', dark: '569cd6', light: '0000ff', fontStyle: 'bold' },
  { token: 'md-bold', dark: 'ececef', light: '000000', fontStyle: 'bold' },
  { token: 'md-italic', dark: 'c9c9cf', light: '000000', fontStyle: 'italic' },
  { token: 'md-code', dark: 'ce9178', light: 'a31515' },
  { token: 'md-codeline', dark: 'ce9178', light: 'a31515' },
  { token: 'md-link', dark: '5b9dff', light: '0451a5', fontStyle: 'underline' },
  { token: 'md-quote', dark: '6a9955', light: '008000', fontStyle: 'italic' },
  { token: 'md-list', dark: '569cd6', light: '0000ff' },
  { token: 'md-hr', dark: '8f8f98', light: '7f7f7f' },

  // HTML / Vue 模板 token（tag 与 python 装饰器共用内置 token 名）
  { token: 'tag', dark: 'd7ba7d', light: '800000' },
  { token: 'metatag', dark: 'd7ba7d', light: '800000' },
  { token: 'metatag.content', dark: '569cd6', light: '0451a5' },
  { token: 'comment.content', dark: '6a9955', light: '008000' },
  { token: 'attribute.name', dark: '9cdcfe', light: 'e00000' },
  // Vue 指令：v-if / v-bind:x / @click.stop / :prop / #slot
  { token: 'attribute.name.directive', dark: 'c586c0', light: 'af00db' },
  { token: 'attribute.value', dark: 'ce9178', light: '0451a5' },

  // bat / shell / powershell 内置文法扩展 token
  { token: 'constants', dark: 'c586c0', light: 'af00db' },
  { token: 'string.heredoc', dark: 'ce9178', light: 'a31515' },
  { token: 'string.heredoc.delimiter', dark: 'd7ba7d', light: '0451a5' },

  // scss / less 内置文法扩展 token
  { token: 'string.delimiter', dark: 'ce9178', light: 'a31515' },
  { token: 'meta', dark: 'd4d4d4', light: '000000' },

  // YAML / INI / Properties 配置文件扩展 token
  { token: 'key', dark: '9cdcfe', light: '0451a5' },
  { token: 'operators', dark: 'd4d4d4', light: '000000' },
  { token: 'meta.directive', dark: 'c586c0', light: 'af00db' },
  { token: 'namespace', dark: '4fc1ff', light: '0070c1' }
];

const DARK_COLORS: monaco.editor.IColors = {
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
};

const LIGHT_COLORS: monaco.editor.IColors = {
  'editor.background': '#ffffff',
  'editor.lineHighlightBackground': '#f3f3f3',
  'editorLineNumber.foreground': '#b0b0b0',
  'editorLineNumber.activeForeground': '#1f1f1f',
  'editor.selectionBackground': '#add6ff',
  'editorIndentGuide.background': '#e7e7e7',
  'editorCursor.foreground': '#005fb8',
  'editorWidget.background': '#f3f3f3',
  'editorSuggestWidget.background': '#f3f3f3',
  'editorSuggestWidget.border': '#c8c8c8'
};

function buildRules(mode: 'dark' | 'light'): monaco.editor.ITokenThemeRule[] {
  return TOKEN_STYLES.map(style => ({
    token: style.token,
    foreground: mode === 'dark' ? style.dark : style.light,
    fontStyle: style.fontStyle
  }));
}

export function registerEditorThemes(): void {
  monaco.editor.defineTheme('ink-java-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: buildRules('dark'),
    colors: DARK_COLORS
  });

  monaco.editor.defineTheme('ink-java-light', {
    base: 'vs',
    inherit: true,
    rules: buildRules('light'),
    colors: LIGHT_COLORS
  });
}
