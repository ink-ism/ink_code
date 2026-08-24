// 统一图标库：为文件树 / Tab 栏提供内联 SVG 图标
// 文件图标采用「彩色圆角徽章 + 字母」风格，文件夹为灰蓝色折叠/展开形态

interface BadgeSpec {
  color: string;   // 徽章底色
  label?: string;  // 徽章文字（默认取扩展名首字母）
  fg?: string;     // 文字颜色（默认白色）
  fontSize?: number; // 文字大小（默认 8）
}

const FILE_BADGES: Record<string, BadgeSpec> = {
  java: { color: '#8f6fd8', label: 'J' },
  xml: { color: '#cf5b5f', label: 'X' },
  json: { color: '#c9a53f', label: '{}', fg: '#1c1c20', fontSize: 6.5 },
  yml: { color: '#d97757', label: 'Y' },
  yaml: { color: '#d97757', label: 'Y' },
  md: { color: '#4d9fdc', label: 'M' },
  txt: { color: '#8a919c', label: 'T' },
  ts: { color: '#3f8ecf', label: 'TS', fontSize: 6.5 },
  js: { color: '#d8b63c', label: 'JS', fg: '#1c1c20', fontSize: 6.5 },
  html: { color: '#e06c4f', label: 'H' },
  css: { color: '#4aa3e0', label: '#' },
  sql: { color: '#d8a53c', label: 'S' },
  properties: { color: '#7fb069', label: 'P' },
  sh: { color: '#58b074', label: '>_', fg: '#1c1c20', fontSize: 6.5 },
  bat: { color: '#58b074', label: '>_', fg: '#1c1c20', fontSize: 6.5 },
  cmd: { color: '#58b074', label: '>_', fg: '#1c1c20', fontSize: 6.5 },
  gitignore: { color: '#e7834a', label: 'G' },
  py: { color: '#3f7fbf', label: 'Py', fontSize: 6.5 },
  jar: { color: '#b0895a', label: 'J' },
  log: { color: '#8a919c', label: 'L' }
};

// 徽章文字源自文件扩展名（文件名来自磁盘，需转义防注入）
function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] as string
  ));
}

function badge(color: string, label: string, fg: string, fontSize: number): string {
  const baseline = fontSize <= 7 ? 10.6 : 11;
  const safeLabel = escapeXml(label.slice(0, 2));
  return (
    `<svg class="file-icon" viewBox="0 0 16 16" aria-hidden="true">` +
    `<rect x="1" y="1" width="14" height="14" rx="3.5" fill="${color}"/>` +
    `<text x="8" y="${baseline}" text-anchor="middle" font-size="${fontSize}" font-weight="700" ` +
    `fill="${fg}" font-family="Consolas, 'Courier New', monospace">${safeLabel}</text>` +
    `</svg>`
  );
}

// 文件图标：按扩展名取彩色徽章
export function fileIconSvg(fileName: string): string {
  const lower = fileName.toLowerCase();
  const key = lower.includes('.gitignore')
    ? 'gitignore'
    : (lower.split('.').pop() || '');
  const spec = FILE_BADGES[key];
  if (!spec) {
    const label = (key.charAt(0) || '?').toUpperCase();
    return badge('#6e7684', label, '#ffffff', 8);
  }
  return badge(
    spec.color,
    spec.label ?? (key.charAt(0) || '?').toUpperCase(),
    spec.fg ?? '#ffffff',
    spec.fontSize ?? 8
  );
}

// 文件夹图标：闭合 / 展开 两种形态
export function folderIconSvg(open: boolean): string {
  return open
    ? `<svg class="folder-icon" viewBox="0 0 16 16" aria-hidden="true">` +
      `<path d="M1.5 4.1c0-.5.4-.9.9-.9h3.3l1.4 1.4h6.5c.5 0 .9.4.9.9v1.1h-13z" fill="#66788f"/>` +
      `<path d="M1.5 7.6h13l-1.6 5.3c-.1.4-.5.7-.9.7H2.4c-.5 0-.9-.4-.9-.9z" fill="#8fa3bd"/>` +
      `</svg>`
    : `<svg class="folder-icon" viewBox="0 0 16 16" aria-hidden="true">` +
      `<path d="M1.5 3.9c0-.5.4-.9.9-.9h3.4l1.4 1.4h6.4c.5 0 .9.4.9.9v6.8c0 .5-.4.9-.9.9H2.4c-.5 0-.9-.4-.9-.9z" fill="#7d8899"/>` +
      `</svg>`;
}

// 折叠箭头（展开时由 CSS 旋转 90°）
export const CHEVRON_SVG =
  `<svg class="tree-chevron" viewBox="0 0 16 16" aria-hidden="true">` +
  `<path d="M6 4.5l3.5 3.5L6 11.5" fill="none" stroke="currentColor" stroke-width="1.4" ` +
  `stroke-linecap="round" stroke-linejoin="round"/></svg>`;
