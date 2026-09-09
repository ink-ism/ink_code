import { FileTreeNode } from '../../common/types';
import { fileIconSvg, folderIconSvg, CHEVRON_SVG } from '../services/icons';
import { ContextMenu, ContextMenuItem } from './ContextMenu';

export class FileTree {
  private container: HTMLElement;
  private root: FileTreeNode | null = null;
  private selectedContent: HTMLElement | null = null;
  // 展开/选中状态存在内存而非 DOM：render() 全量重建时据此回放。
  // key 一律小写，Windows 路径大小写不敏感。
  private expandedPaths = new Set<string>();
  private expandedClosure = new Set<string>();
  private selectedPath: string | null = null;
  private pendingLoads: Array<{ node: FileTreeNode; container: HTMLElement }> = [];
  private renderGeneration = 0;
  private contextMenu: ContextMenu;
  // 内联编辑状态
  private inlineInput: HTMLInputElement | null = null;
  // 拖拽状态
  private dragNode: FileTreeNode | null = null;
  // 回调
  public onFileClick?: (filePath: string) => void;
  public onTreeChanged?: () => void;  // 文件树变化后通知外部刷新

  constructor(container: HTMLElement) {
    this.container = container;
    this.contextMenu = new ContextMenu();
  }

  setTree(tree: FileTreeNode) {
    // 换项目时旧的展开/选中不再适用；同项目重扫（refreshTree）必须保留
    if (this.root && this.root.path.toLowerCase() !== tree.path.toLowerCase()) {
      this.expandedPaths.clear();
      this.selectedPath = null;
    }
    this.root = tree;
    this.render();
  }

  private render() {
    const scrollTop = this.container.scrollTop;
    const prevHeight = this.container.scrollHeight;
    this.container.innerHTML = '';
    this.selectedContent = null;
    this.pendingLoads = [];
    this.expandedClosure = this.buildExpandedClosure();
    const generation = ++this.renderGeneration;

    if (this.root?.children) {
      for (const child of this.root.children) {
        this.container.appendChild(this.renderNode(child));
      }
    }

    // 重建瞬间深层展开还没回放完，内容高度会塌回根层，直接写回 scrollTop 会被钳到 0。
    // 用占位块撑住旧的滚动高度，回放结束后再交还给内容自身。
    // 不能用容器 min-height：#file-tree 是 overflow:hidden 父级里的 flex:1 项，
    // 撑高它等于让滚动条消失。
    // 也不能拿容器 scrollHeight 当"当前内容高度"：它恒不小于 clientHeight，
    // 内容不足一屏时会虚高一整个视口，占位块随之短掉，scrollTop 照样被钳走。
    let rowsHeight = 0;
    for (const el of Array.from(this.container.children)) {
      rowsHeight += (el as HTMLElement).offsetHeight;
    }
    const spacer = document.createElement('div');
    spacer.style.height = `${Math.max(0, prevHeight - rowsHeight)}px`;
    this.container.appendChild(spacer);
    this.container.scrollTop = scrollTop;

    void this.replayExpansion(generation)
      .finally(() => spacer.remove())
      .catch((error) => console.error('展开回放失败:', error));
  }

  // 展开目录的所有祖先前缀也算"应展开"：compactDirs 会把单链子目录压成一行，
  // 链中间被外部放入文件时该行的 path 上移，只按精确 key 回放会让展开的包链凭空折叠。
  private buildExpandedClosure(): Set<string> {
    const closure = new Set<string>();
    if (!this.root) return closure;
    const rootKey = this.root.path.toLowerCase();
    for (const key of this.expandedPaths) {
      if (!key.startsWith(rootKey)) continue;
      closure.add(key);
      for (let i = key.length - 1; i > rootKey.length; i--) {
        if ((key[i] === '/' || key[i] === '\\') && i > rootKey.length) {
          closure.add(key.slice(0, i));
        }
      }
    }
    return closure;
  }

  // 按波次补齐展开目录的子节点：同层兄弟并行，父子链天然串行（子行要等父行渲染出来才会入队）
  private async replayExpansion(generation: number) {
    let budget = 200;
    while (this.pendingLoads.length > 0 && budget > 0) {
      if (generation !== this.renderGeneration) return;
      const wave = this.pendingLoads.splice(0, budget);
      budget -= wave.length;
      await Promise.all(
        wave.map(({ node, container }) =>
          this.ensureChildrenLoaded(node, container, node.path.toLowerCase())
        )
      );
    }
  }

  // 返回 false 表示加载失败：调用方据此保持折叠，下次点击可重试
  private async ensureChildrenLoaded(
    node: FileTreeNode,
    container: HTMLElement,
    key: string
  ): Promise<boolean> {
    try {
      const children = await window.electronAPI.scanDirectory(node.path);
      node.children = children;
      container.innerHTML = '';
      for (const child of children) {
        container.appendChild(this.renderNode(child));
      }
      return true;
    } catch (error) {
      console.error(`加载目录失败: ${node.path}`, error);
      this.expandedPaths.delete(key);
      return false;
    }
  }

  // 折叠一个目录必须连带清除其子孙的展开记录：
  // 否则后代 key 的祖先前缀闭包会把这个刚折叠的目录重新算成"应展开"
  private collapseSubtree(key: string) {
    for (const k of this.expandedPaths) {
      if (k === key || k.startsWith(key + '\\') || k.startsWith(key + '/')) {
        this.expandedPaths.delete(k);
      }
    }
  }

  // 按路径查找节点元素。不能用 `[data-path="..."]` 属性选择器：
  // Windows 路径里的反斜杠会被当作转义序列，导致选择器永远匹配不到
  private findNodeEl(path: string): HTMLElement | null {
    const target = path.toLowerCase();
    for (const el of Array.from(this.container.querySelectorAll<HTMLElement>('.tree-node'))) {
      if (el.dataset.path?.toLowerCase() === target) return el;
    }
    return null;
  }

  private renderNode(node: FileTreeNode): HTMLElement {
    const div = document.createElement('div');
    div.className = 'tree-node';
    div.dataset.path = node.path;

    const key = node.path.toLowerCase();
    const expanded = node.isDirectory && this.expandedClosure.has(key);

    const content = document.createElement('div');
    content.className = 'tree-node-content';
    if (key === this.selectedPath) {
      content.classList.add('selected');
      this.selectedContent = content;
    }
    if (expanded) content.classList.add('expanded');

    // 图标
    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    if (node.isDirectory) {
      // 折叠箭头 + 文件夹图标
      const chevron = document.createElement('span');
      chevron.className = 'tree-chevron-wrap';
      chevron.innerHTML = CHEVRON_SVG;
      content.appendChild(chevron);
      icon.innerHTML = folderIconSvg(expanded);
    } else {
      // 占位保持与目录节点对齐 + 文件徽章图标
      const spacer = document.createElement('span');
      spacer.className = 'tree-spacer';
      content.appendChild(spacer);
      icon.innerHTML = fileIconSvg(node.name);
    }
    content.appendChild(icon);

    // 名称
    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = node.name;
    content.appendChild(name);

    div.appendChild(content);

    // 子节点容器
    if (node.isDirectory) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      childrenContainer.style.display = expanded ? 'block' : 'none';
      div.appendChild(childrenContainer);

      let loaded = false;

      // 如果已经有 children 数据，先渲染
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          childrenContainer.appendChild(this.renderNode(child));
        }
        loaded = true;
      }

      // 展开但子目录尚未加载：交给 replayExpansion 按波次补扫
      if (expanded && !loaded) {
        this.pendingLoads.push({ node, container: childrenContainer });
      }

      content.addEventListener('click', async (e) => {
        e.stopPropagation();
        const wasExpanded = childrenContainer.style.display !== 'none';
        if (wasExpanded) {
          childrenContainer.style.display = 'none';
          content.classList.remove('expanded');
          icon.innerHTML = folderIconSvg(false);
          this.collapseSubtree(key);
          return;
        }
        childrenContainer.style.display = 'block';
        content.classList.add('expanded');
        icon.innerHTML = folderIconSvg(true);
        this.expandedPaths.add(key);
        if (!loaded) {
          loaded = await this.ensureChildrenLoaded(node, childrenContainer, key);
          if (!loaded) {
            // 扫描失败不留在"已展开却是空的"状态，再点一次即可重试
            childrenContainer.style.display = 'none';
            content.classList.remove('expanded');
            icon.innerHTML = folderIconSvg(false);
          }
        }
      });

      // 拖拽放置到文件夹
      content.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        content.classList.add('drop-target');
      });

      content.addEventListener('dragleave', () => {
        content.classList.remove('drop-target');
      });

      content.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        content.classList.remove('drop-target');
        if (this.dragNode && this.dragNode.path !== node.path) {
          await this.handleDrop(node.path);
        }
      });
    } else {
      content.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(content);
        this.onFileClick?.(node.path);
      });

      // 文件节点也可作为拖拽目标
      content.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    }

    // 右键菜单
    content.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.select(content);
      this.showContextMenu(e.clientX, e.clientY, node);
    });

    // 拖拽开始
    content.setAttribute('draggable', 'true');
    content.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      this.dragNode = node;
      content.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', node.path);
      }
    });

    content.addEventListener('dragend', () => {
      this.dragNode = null;
      content.classList.remove('dragging');
      // 清除所有 drop-target
      this.container.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    });

    return div;
  }

  // 处理拖拽放置
  private async handleDrop(destDirPath: string) {
    if (!this.dragNode) return;
    const srcPath = this.dragNode.path;

    // 不能拖到自身或自身子目录
    if (srcPath === destDirPath || destDirPath.startsWith(srcPath + '\\') || destDirPath.startsWith(srcPath + '/')) {
      return;
    }

    try {
      await window.electronAPI.cutItem(srcPath, destDirPath);
      await this.refreshTree();
    } catch (error) {
      console.error('移动文件失败:', error);
      alert(`移动失败: ${error}`);
    }
  }

  // 显示右键菜单
  private showContextMenu(x: number, y: number, node: FileTreeNode) {
    const isDir = node.isDirectory;
    const parentDir = isDir ? node.path : node.path.replace(/[^/\\]+$/, '').replace(/[\\/]+$/, '');
    const targetDir = isDir ? node.path : parentDir;

    const items: ContextMenuItem[] = [];

    // 新建（文件夹上或文件所在目录）
    items.push({
      label: '新建文件',
      action: () => this.startInlineCreate(targetDir, false)
    });
    items.push({
      label: '新建文件夹',
      action: () => this.startInlineCreate(targetDir, true)
    });

    items.push({ separator: true });

    // 重命名
    items.push({
      label: '重命名',
      action: () => this.startInlineRename(node)
    });

    // 删除
    items.push({
      label: '删除',
      action: () => this.confirmDelete(node)
    });

    items.push({ separator: true });

    // 复制/剪切
    items.push({
      label: '复制',
      action: () => {
        window.electronAPI.copyItem(node.path, '');  // 仅设置剪贴板
      }
    });
    items.push({
      label: '剪切',
      action: () => {
        window.electronAPI.cutItem(node.path, '');  // 仅设置剪贴板
      }
    });

    // 粘贴（仅文件夹显示）
    if (isDir) {
      items.push({
        label: '粘贴',
        action: async () => {
          try {
            await window.electronAPI.pasteItem(node.path);
            await this.refreshTree();
          } catch (error) {
            alert(`粘贴失败: ${error}`);
          }
        }
      });
    }

    this.contextMenu.show(x, y, items);
  }

  // 内联创建文件/文件夹（供右键菜单与菜单栏新建调用）
  async startInlineCreate(parentDir: string | null, isFolder: boolean) {
    if (!parentDir) {
      alert('请先打开项目');
      return;
    }
    // 找到对应的目录节点并展开
    const nodeEl = this.findNodeEl(parentDir);
    if (nodeEl) {
      const childrenContainer = nodeEl.querySelector('.tree-children') as HTMLElement;
      if (childrenContainer) {
        childrenContainer.style.display = 'block';
        const content = nodeEl.querySelector('.tree-node-content') as HTMLElement;
        if (content) content.classList.add('expanded');
      }
    }
    // 同步登记展开态，否则随后的 refreshTree 重建时会把父目录折叠回去
    this.expandedPaths.add(parentDir.toLowerCase());

    // 创建临时节点显示内联输入框
    const targetContainer = nodeEl?.querySelector('.tree-children') || this.container;
    const tempDiv = document.createElement('div');
    tempDiv.className = 'tree-node tree-node-inline';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tree-inline-input';
    input.placeholder = isFolder ? '文件夹名称' : '文件名称';

    tempDiv.appendChild(input);
    targetContainer.insertBefore(tempDiv, targetContainer.firstChild);
    input.focus();
    this.inlineInput = input;

    const cleanup = () => {
      if (this.inlineInput === input) this.inlineInput = null;
      tempDiv.remove();
    };

    let committed = false;
    const commit = async () => {
      if (committed) return;
      const name = input.value.trim();
      if (!name) {
        cleanup();
        return;
      }
      committed = true;
      try {
        // 主进程把异常转成了 { success:false }，不会 reject，必须显式判断
        const result = isFolder
          ? await window.electronAPI.createFolder(parentDir, name)
          : await window.electronAPI.createFile(parentDir, name);
        if (!result.success) throw new Error(result.error ?? '未知错误');
        cleanup();
        await this.refreshTree();
      } catch (error) {
        alert(`创建失败: ${error}`);
        cleanup();
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      }
    });

    input.addEventListener('blur', () => {
      void commit();
    });
  }

  // 内联重命名
  private startInlineRename(node: FileTreeNode) {
    const nodeEl = this.findNodeEl(node.path);
    if (!nodeEl) return;

    const nameEl = nodeEl.querySelector('.tree-name') as HTMLElement;
    if (!nameEl) return;

    const oldName = node.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tree-inline-input';
    input.value = oldName;

    nameEl.replaceWith(input);
    input.focus();
    input.select();
    this.inlineInput = input;

    const finishEditing = () => {
      if (this.inlineInput === input) this.inlineInput = null;
    };

    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      finishEditing();
      const newName = input.value.trim();
      if (!newName || newName === oldName) {
        // 恢复原名
        nameEl.textContent = oldName;
        input.replaceWith(nameEl);
        return;
      }
      try {
        await window.electronAPI.renameItem(node.path, newName);
        await this.refreshTree();
      } catch (error) {
        alert(`重命名失败: ${error}`);
        nameEl.textContent = oldName;
        input.replaceWith(nameEl);
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        committed = true;
        finishEditing();
        nameEl.textContent = oldName;
        input.replaceWith(nameEl);
      }
    });

    input.addEventListener('blur', () => {
      void commit();
    });
  }

  // 确认删除
  private async confirmDelete(node: FileTreeNode) {
    const type = node.isDirectory ? '文件夹' : '文件';
    if (!confirm(`确定删除${type} "${node.name}" 吗？此操作不可恢复。`)) return;

    try {
      await window.electronAPI.deleteItem(node.path);
      await this.refreshTree();
    } catch (error) {
      alert(`删除失败: ${error}`);
    }
  }

  // 刷新文件树（供外部编排调用）
  async refreshTree(): Promise<boolean> {
    if (!this.root) return false;
    this.contextMenu.hide();
    try {
      const tree = await window.electronAPI.scanTree(this.root.path);
      this.root = tree;
      this.render();
      this.onTreeChanged?.();
      return true;
    } catch (error) {
      console.error('刷新文件树失败:', error);
      return false;
    }
  }

  // 是否正在进行内联命名（此时刷新会清掉输入框，上层应跳过）
  isEditing(): boolean {
    return this.inlineInput !== null;
  }

  // 选中高亮（同一时刻仅一个节点）
  private select(content: HTMLElement) {
    if (this.selectedContent === content) return;
    this.selectedContent?.classList.remove('selected');
    this.selectedContent = content;
    content.classList.add('selected');
    this.selectedPath =
      (content.closest('.tree-node') as HTMLElement | null)?.dataset.path?.toLowerCase() ?? null;
  }
}
