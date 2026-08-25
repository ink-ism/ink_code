import { MenuModelNode } from '../../common/types';

/**
 * 自绘标题栏菜单栏：原生标题栏隐藏后，顶部区域由 HTML 接管，
 * 菜单模型来自主进程（与全局快捷键共用同一份定义）。
 * 交互：点击展开、展开后悬停切换、Esc / 点击空白关闭、子菜单悬停飞出。
 */
export class TitleBar {
  private root: HTMLElement;
  private model: MenuModelNode[] = [];
  private openRoot: HTMLElement | null = null; // 当前展开的顶级菜单按钮

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async init(): Promise<void> {
    await this.reload();
    // 主进程重建菜单（如最近项目变化）后刷新
    window.electronAPI.onMenuUpdated(() => { void this.reload(); });

    // 点击标题栏以外区域关闭菜单
    document.addEventListener('mousedown', (e) => {
      if (this.openRoot && !this.root.contains(e.target as Node)) {
        this.closeAll();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeAll();
    });
  }

  private async reload(): Promise<void> {
    try {
      this.model = await window.electronAPI.menuGetTemplate();
    } catch (error) {
      console.error('[titlebar] 拉取菜单模型失败:', error);
      return;
    }
    this.render();
  }

  private render(): void {
    this.openRoot = null;
    this.root.textContent = '';
    for (const top of this.model) {
      const btn = document.createElement('div');
      btn.className = 'tb-menu-btn';
      btn.textContent = top.label ?? '';
      btn.addEventListener('click', () => {
        if (this.openRoot === btn) {
          this.closeAll();
        } else {
          this.open(btn, top);
        }
      });
      // 已有菜单展开时，悬停其他顶级项直接切换
      btn.addEventListener('mouseenter', () => {
        if (this.openRoot && this.openRoot !== btn) this.open(btn, top);
      });
      this.root.appendChild(btn);
    }
  }

  private open(btn: HTMLElement, top: MenuModelNode): void {
    this.closeAll();
    this.openRoot = btn;
    btn.classList.add('open');
    const dd = document.createElement('div');
    dd.className = 'tb-dropdown';
    this.fillItems(dd, top.submenu ?? []);
    btn.appendChild(dd);
  }

  private closeAll(): void {
    if (!this.openRoot) return;
    this.openRoot.classList.remove('open');
    this.openRoot.querySelector('.tb-dropdown')?.remove();
    this.openRoot = null;
  }

  private fillItems(container: HTMLElement, items: MenuModelNode[]): void {
    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'tb-sep';
        container.appendChild(sep);
        continue;
      }

      const el = document.createElement('div');
      const disabled = item.enabled === false;
      el.className = 'tb-item'
        + (disabled ? ' disabled' : '')
        + (item.submenu ? ' has-sub' : '');

      const label = document.createElement('span');
      label.className = 'tb-item-label';
      label.textContent = item.label ?? '';
      el.appendChild(label);

      if (item.accelerator) {
        const acc = document.createElement('span');
        acc.className = 'tb-accel';
        acc.textContent = item.accelerator.replace('CmdOrCtrl', 'Ctrl');
        el.appendChild(acc);
      }

      if (item.submenu) {
        const arrow = document.createElement('span');
        arrow.className = 'tb-arrow';
        arrow.textContent = '▸';
        el.appendChild(arrow);
        const sub = document.createElement('div');
        sub.className = 'tb-dropdown tb-sub';
        this.fillItems(sub, item.submenu);
        el.appendChild(sub);
      } else if (!disabled && item.id) {
        const id = item.id;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeAll();
          void window.electronAPI.menuInvoke(id);
        });
      }

      container.appendChild(el);
    }
  }
}
