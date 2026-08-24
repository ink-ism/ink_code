// monaco-editor 内部模块无官方类型声明，仅使用 computeRanges 计算缩进折叠范围
declare module 'monaco-editor/esm/vs/editor/contrib/folding/browser/indentRangeProvider' {
  export function computeRanges(
    model: any,
    offSide: boolean,
    markers?: { start: RegExp; end: RegExp },
    foldingRangesLimit?: { limit: number; update: () => void }
  ): {
    length: number;
    getStartLineNumber(index: number): number;
    getEndLineNumber(index: number): number;
  };
}
