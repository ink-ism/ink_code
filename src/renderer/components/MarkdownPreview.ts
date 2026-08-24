import { Marked } from 'marked';

/**
 * Markdown 预览组件
 * 将 Markdown 文本渲染为 HTML 并展示在独立面板中。
 * - 使用 marked（GFM）解析，支持表格 / 任务列表 / 删除线等
 * - 相对路径的图片 / 链接按当前 md 文件所在目录解析
 * - http(s) 链接交由主进程用系统浏览器打开，避免 Electron 窗口被导航
 * - 渲染后剥离 on* 内联事件与 javascript: 协议，降低本地文件注入风险
 */
export class MarkdownPreview {
  private container: HTMLElement;
  private marked: Marked;
  private currentBaseDir: string = '';

  // 点击链接时回调（用于交由主进程打开外部链接）
  public onOpenExternal?: (url: string) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.marked = new Marked({ gfm: true, breaks: false, async: false });
    // 事件委托：拦截链接点击
    this.container.addEventListener('click', (e) => this.handleClick(e));
  }

  /**
   * 渲染 Markdown 内容
   * @param markdown 原始 Markdown 文本
   * @param filePath 当前 md 文件绝对路径（用于解析相对资源路径）
   */
  render(markdown: string, filePath: string): void {
    this.currentBaseDir = dirnameOf(filePath);
    const html = this.marked.parse(markdown) as string;
    this.container.innerHTML = html;
    this.postProcess();
  }

  clear(): void {
    this.container.innerHTML = '';
  }

  /**
   * 渲染后处理：净化 + 解析相对路径资源
   */
  private postProcess(): void {
    // 1. 剥离潜在的内联事件属性与 javascript: 协议
    const all = this.container.querySelectorAll('*');
    all.forEach((el) => {
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
        } else if ((name === 'href' || name === 'src') && isJavascriptUrl(attr.value)) {
          el.removeAttribute(attr.name);
        }
      }
    });

    // 2. 图片：相对路径 -> file:// 绝对路径
    this.container.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (src && !isAbsoluteUrl(src)) {
        img.src = toFileUrl(resolvePath(this.currentBaseDir, src));
      }
      img.loading = 'lazy';
    });

    // 3. 链接：相对路径解析为绝对路径并存入 data-href
    this.container.querySelectorAll('a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const resolved = isAbsoluteUrl(href) ? href : resolvePath(this.currentBaseDir, href);
      a.setAttribute('data-href', resolved);
      a.setAttribute('href', '#');
    });
  }

  /**
   * 链接点击：http(s)/mailto 交主进程打开；本地文件暂不支持跳转
   */
  private handleClick(e: MouseEvent): void {
    const target = (e.target as HTMLElement).closest('a');
    if (!target) return;
    e.preventDefault();
    const href = target.getAttribute('data-href') || '';
    if (!href || href === '#') return;
    if (/^(https?:|mailto:)/i.test(href)) {
      this.onOpenExternal?.(href);
    }
    // 本地文件链接：阻止导航即可（暂不做内部跳转）
  }
}

// ============ 路径 / URL 工具 ============

/** 取文件所在目录（兼容 / 与 \ 分隔符） */
function dirnameOf(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return idx > 0 ? filePath.slice(0, idx) : '';
}

/** 是否为绝对 URL（带协议或协议相对） */
function isAbsoluteUrl(url: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) || url.startsWith('//') || url.startsWith('#');
}

function isJavascriptUrl(url: string): boolean {
  return /^\s*javascript:/i.test(url);
}

/** 绝对路径 -> file:// URL（Windows 反斜杠转正斜杠） */
function toFileUrl(absPath: string): string {
  const normalized = absPath.replace(/\\/g, '/');
  // 盘符路径 C:/xxx -> file:///C:/xxx
  if (/^[a-zA-Z]:/.test(normalized)) {
    return 'file:///' + normalized;
  }
  return 'file://' + normalized;
}

/**
 * 将相对路径解析为绝对路径（支持 ./ 与 ../，兼容 / 与 \ 分隔符）
 */
function resolvePath(baseDir: string, rel: string): string {
  if (!baseDir) return rel;
  // 已是绝对路径（盘符或根）
  if (/^[a-zA-Z]:/.test(rel) || rel.startsWith('/') || rel.startsWith('\\')) {
    return rel;
  }
  const sep = baseDir.includes('\\') ? '\\' : '/';
  const baseParts = baseDir.split(/[/\\]/).filter(Boolean);
  const relParts = rel.replace(/\\/g, '/').split('/');
  for (const part of relParts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }
  // Windows 盘符保留冒号形式 C:\...
  return baseParts.join(sep);
}
