import { FileTreeNode } from '../../common/types';
import { fileIconSvg, folderIconSvg, CHEVRON_SVG } from '../services/icons';
import { ContextMenu, ContextMenuItem } from './ContextMenu';

export class FileTree {
  private container: HTMLElement;
  private root: FileTreeNode | null = null;
  private selectedContent: HTMLElement | null = null;
  private contextMenu: ContextMenu;
  // 内联编辑状态
  private inlineInput: HTMLInputElement | null = null;
  private inlineCallback: ((name: string) => void) | null = null;
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
    this.root = tree;
    this.selectedContent = null;
    this.render();
  }

  private render() {
    this.container.innerHTML = '';
    if (!this.root) return;

    if (this.root.children) {
      for (const child of this.root.children) {
        this.container.appendChild(this.renderNode(child));
      }
    }
  }

  private renderNode(node: FileTreeNode): HTMLElement {
    const div = document.createElement('div');
    div.className = 'tree-node';
    div.dataset.path = node.path;

    const content = document.createElement('div');
    content.className = 'tree-node-content';

    // 图标
    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    if (node.isDirectory) {
      // 折叠箭头 + 文件夹图标
      const chevron = document.createElement('span');
      chevron.className = 'tree-chevron-wrap';
      chevron.innerHTML = CHEVRON_SVG;
      content.appendChild(chevron);
      icon.innerHTML = folderIconSvg(false);
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
      childrenContainer.style.display = 'none';
      div.appendChild(childrenContainer);

      let loaded = false;

      // 如果已经有 children 数据，先渲染
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          childrenContainer.appendChild(this.renderNode(child));
        }
        loaded = true;
      }

      content.addEventListener('click', async (e) => {
        e.stopPropagation();
        const isExpanded = childrenContainer.style.display !== 'none';
        childrenContainer.style.display = isExpanded ? 'none' : 'block';
        // 更新展开状态（箭头旋转 + 文件夹开合形态）
        content.classList.toggle('expanded', !isExpanded);
        icon.innerHTML = folderIconSvg(!isExpanded);

        // 懒加载子目录（仅当 children 为空时）
        if (!loaded && !isExpanded) {
          try {
            const children = await window.electronAPI.scanDirectory(node.path);
            node.children = children;
            childrenContainer.innerHTML = '';
            for (const child of children) {
              childrenContainer.appendChild(this.renderNode(child));
            }
            loaded = true;
          } catch (error) {
            console.error('加载子目录失败:', error);
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
    const nodeEl = this.container.querySelector(`[data-path="${parentDir}"]`);
    if (nodeEl) {
      const childrenContainer = nodeEl.querySelector('.tree-children') as HTMLElement;
      if (childrenContainer) {
        childrenContainer.style.display = 'block';
        const content = nodeEl.querySelector('.tree-node-content') as HTMLElement;
        if (content) content.classList.add('expanded');
      }
    }

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

    const cleanup = () => {
      tempDiv.remove();
    };

    const commit = async () => {
      const name = input.value.trim();
      if (!name) {
        cleanup();
        return;
      }
      try {
        await window.electronAPI.createFile(parentDir, name);
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
    const nodeEl = this.container.querySelector(`[data-path="${node.path}"]`);
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

    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
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

  // 刷新文件树
  private async refreshTree() {
    if (!this.root) return;
    try {
      const tree = await window.electronAPI.scanTree(this.root.path);
      this.setTree(tree);
      this.onTreeChanged?.();
    } catch (error) {
      console.error('刷新文件树失败:', error);
    }
  }

  // 选中高亮（同一时刻仅一个节点）
  private select(content: HTMLElement) {
    if (this.selectedContent === content) return;
    this.selectedContent?.classList.remove('selected');
    this.selectedContent = content;
    content.classList.add('selected');
  }
}
