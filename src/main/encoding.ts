import iconv from 'iconv-lite';

// 文件编码缓存：路径 -> 编码（保存时保持原编码写回）
const encodingCache = new Map<string, string>();

/**
 * 解码文件内容，自动识别 UTF-8 / GBK
 * UTF-8 校验失败时回退到 GBK（国内老 Java 项目常见）
 */
export function decodeBuffer(buf: Buffer, filePath?: string): { content: string; encoding: string } {
  let content: string;
  let encoding: string;

  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    content = decoder.decode(buf);
    encoding = 'UTF-8';
  } catch {
    content = iconv.decode(buf, 'gbk');
    encoding = 'GBK';
  }

  if (filePath) {
    encodingCache.set(filePath, encoding);
  }
  return { content, encoding };
}

/**
 * 按文件原编码编码内容（未记录过则默认 UTF-8）
 */
export function encodeContent(content: string, filePath?: string): Buffer {
  const encoding = filePath ? encodingCache.get(filePath) : undefined;
  if (encoding === 'GBK') {
    return iconv.encode(content, 'gbk');
  }
  return Buffer.from(content, 'utf-8');
}
