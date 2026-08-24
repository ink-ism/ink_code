import { FileSymbol } from '../../common/types';

export class OutlinePanel {
  private container: HTMLElement;
  private symbols: FileSymbol[] = [];
  public onSymbolClick?: (line: number) => void;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  setSymbols(symbols: FileSymbol[]) {
    this.symbols = symbols;
    this.render();
  }

  private render() {
    this.container.replaceChildren();

    if (this.symbols.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'outline-empty';
      empty.textContent = '无符号信息';
      this.container.appendChild(empty);
      return;
    }

    // 按层级结构组织：顶层类 → 方法/字段
    const topLevel = this.symbols.filter(s => !s.parent);
    
    for (const symbol of topLevel) {
      this.container.appendChild(this.renderSymbol(symbol));
      
      // 渲染子符号
      const children = this.symbols.filter(s => s.parent === symbol.name);
      if (children.length > 0) {
        const childContainer = document.createElement('div');
        childContainer.className = 'outline-children';
        for (const child of children) {
          childContainer.appendChild(this.renderSymbol(child));
        }
        this.container.appendChild(childContainer);
      }
    }
  }

  private renderSymbol(symbol: FileSymbol): HTMLElement {
    const div = document.createElement('div');
    div.className = `outline-symbol outline-symbol-${symbol.kind}`;

    const icon = document.createElement('span');
    icon.className = 'outline-icon';
    icon.textContent = this.getSymbolIcon(symbol.kind);
    div.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'outline-name';
    name.textContent = symbol.name;
    div.appendChild(name);

    div.addEventListener('click', () => {
      this.onSymbolClick?.(symbol.line);
    });

    return div;
  }

  private getSymbolIcon(kind: string): string {
    switch (kind) {
      case 'class': return 'C';
      case 'interface': return 'I';
      case 'enum': return 'E';
      case 'method': return 'M';
      case 'field': return 'F';
      default: return '?';
    }
  }
}
