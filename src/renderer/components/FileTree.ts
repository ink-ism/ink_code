import { FileTreeNode } from '../../common/types';
import { fileIconSvg, folderIconSvg, CHEVRON_SVG } from '../services/icons';

export class FileTree {
  private container: HTMLElement;
  private root: FileTreeNode | null = null;
  private selectedContent: HTMLElement | null = null;
  public onFileClick?: (filePath: string) => void;

  constructor(container: HTMLElement) {
    this.container = container;
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
    } else {
      content.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(content);
        this.onFileClick?.(node.path);
      });
    }

    return div;
  }

  // 选中高亮（同一时刻仅一个节点）
  private select(content: HTMLElement) {
    if (this.selectedContent === content) return;
    this.selectedContent?.classList.remove('selected');
    this.selectedContent = content;
    content.classList.add('selected');
  }
}
