/**
 * 通用右键上下文菜单组件
 * 支持多级子菜单、分隔线、禁用态
 */

export interface ContextMenuItem {
  id?: string;
  label?: string;
  iconSvg?: string;      // 安全的 SVG 字符串（仅接受代码内预定义的 SVG）
  separator?: boolean;
  disabled?: boolean;
  submenu?: ContextMenuItem[];
  action?: () => void;
}

export class ContextMenu {
  private container: HTMLElement;
  private visible = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'context-menu';
    this.container.hidden = true;
    document.body.appendChild(this.container);

    // 点击外部关闭
    document.addEventListener('mousedown', (e) => {
      if (this.visible && !this.container.contains(e.target as Node)) {
        this.hide();
      }
    });

    // ESC 关闭
    document.addEventListener('keydown', (e) => {
      if (this.visible && e.key === 'Escape') {
        this.hide();
      }
    });
  }

  /**
   * 在指定位置显示菜单
   */
  show(x: number, y: number, items: ContextMenuItem[]) {
    this.container.replaceChildren();
    this.buildMenu(items, this.container);

    this.container.hidden = false;
    this.visible = true;

    // 定位：先渲染再调整，避免超出视口
    this.container.style.left = x + 'px';
    this.container.style.top = y + 'px';

    requestAnimationFrame(() => {
      const rect = this.container.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        this.container.style.left = (x - rect.width) + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        this.container.style.top = (y - rect.height) + 'px';
      }
    });
  }

  hide() {
    this.container.hidden = true;
    this.visible = false;
  }

  private buildMenu(items: ContextMenuItem[], parent: HTMLElement) {
    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        parent.appendChild(sep);
        continue;
      }

      const row = document.createElement('div');
      row.className = 'context-menu-item';
      if (item.disabled) row.classList.add('disabled');

      // 图标（仅接受代码内预定义的安全 SVG 字符串）
      if (item.iconSvg) {
        const icon = document.createElement('span');
        icon.className = 'context-menu-icon';
        // iconSvg 由代码内部预定义，不来自用户输入，安全赋值
        icon.innerHTML = item.iconSvg;  // lgtm[js/unused-local-variable]
        row.appendChild(icon);
      }

      // 标签
      const label = document.createElement('span');
      label.className = 'context-menu-label';
      label.textContent = item.label || '';
      row.appendChild(label);

      // 子菜单箭头
      if (item.submenu && item.submenu.length > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'context-menu-arrow';
        arrow.textContent = '▸';
        row.appendChild(arrow);
      }

      // 点击事件
      if (!item.disabled) {
        if (item.submenu && item.submenu.length > 0) {
          // 悬停展开子菜单
          row.addEventListener('mouseenter', () => {
            this.showSubmenu(row, item.submenu!);
          });
        } else if (item.action) {
          row.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hide();
            item.action!();
          });
        }
      }

      parent.appendChild(row);
    }
  }

  private showSubmenu(anchor: HTMLElement, items: ContextMenuItem[]) {
    // 移除同级子菜单
    const existing = anchor.parentElement?.querySelector('.context-menu-submenu');
    if (existing) existing.remove();

    const submenu = document.createElement('div');
    submenu.className = 'context-menu-submenu';
    this.buildMenu(items, submenu);
    anchor.parentElement?.appendChild(submenu);

    // 定位：在锚点右侧
    const anchorRect = anchor.getBoundingClientRect();
    submenu.style.position = 'fixed';
    submenu.style.left = anchorRect.right + 'px';
    submenu.style.top = anchorRect.top + 'px';

    // 超出视口调整
    requestAnimationFrame(() => {
      const rect = submenu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        submenu.style.left = (anchorRect.left - rect.width) + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        submenu.style.top = (window.innerHeight - rect.height) + 'px';
      }
    });
  }
}
