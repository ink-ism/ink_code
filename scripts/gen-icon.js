/**
 * 生成应用图标 build/icon.ico（256x256 32bpp BMP 编码 ICO）
 * 图案：深色圆角方块背景 + 白色墨滴（Ink）
 * 用法：node scripts/gen-icon.js
 */
const fs = require('fs');
const path = require('path');

const SIZE = 256;

// 判断点是否在圆角方块内
function inRoundRect(x, y) {
  const margin = 12;
  const r = 48;
  const x0 = margin, y0 = margin, x1 = SIZE - margin, y1 = SIZE - margin;
  if (x < x0 || x > x1 || y < y0 || y > y1) return 0;
  // 四个圆角
  const corners = [
    [x0 + r, y0 + r], [x1 - r, y0 + r],
    [x0 + r, y1 - r], [x1 - r, y1 - r]
  ];
  for (const [cx, cy] of corners) {
    const inX = (cx === x0 + r) ? x < cx : x > cx;
    const inY = (cy === y0 + r) ? y < cy : y > cy;
    if (inX && inY) {
      const dx = x - cx, dy = y - cy;
      return dx * dx + dy * dy <= r * r ? 1 : 0;
    }
  }
  return 1;
}

// 判断点是否在墨滴内（圆形底部 + 三角形尖顶）
function inDrop(x, y) {
  const cx = SIZE / 2;
  const cy = SIZE * 0.60;   // 圆心
  const R = SIZE * 0.22;    // 圆半径
  const tipY = SIZE * 0.18; // 尖端

  const dx = x - cx, dy = y - cy;
  if (dx * dx + dy * dy <= R * R) return true;
  // 尖端三角：顶点 (cx, tipY)，底边为圆的左右切点
  if (y >= tipY && y <= cy) {
    const t = (y - tipY) / (cy - tipY); // 0..1
    const half = R * t;
    if (Math.abs(x - cx) <= half) return true;
  }
  return false;
}

// 2x2 超采样抗锯齿
function coverage(fn, x, y) {
  let c = 0;
  for (const ox of [0.25, 0.75]) {
    for (const oy of [0.25, 0.75]) {
      if (fn(x + ox, y + oy)) c++;
    }
  }
  return c / 4;
}

// 生成像素（BGRA，自上而下）
const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    const bg = coverage(inRoundRect, x, y);
    const drop = coverage(inDrop, x, y);
    // 背景：墨蓝渐变（左上亮 -> 右下深）
    const g = (x + y) / (SIZE * 2);
    const bgR = Math.round(38 + g * -12);
    const bgG = Math.round(50 + g * -16);
    const bgB = Math.round(92 + g * -24);
    // 前景墨滴：近白色
    const fR = 244, fG = 246, fB = 250;
    const a = bg; // 整体透明度由圆角方块决定
    const r = Math.round(fR * drop + bgR * (1 - drop));
    const gg = Math.round(fG * drop + bgG * (1 - drop));
    const b = Math.round(fB * drop + bgB * (1 - drop));
    pixels[i] = b;
    pixels[i + 1] = gg;
    pixels[i + 2] = r;
    pixels[i + 3] = Math.round(a * 255);
  }
}

// ---- 组装 ICO ----
// ICO header: reserved(2) + type(2) + count(2)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2); // 1 = ICO
header.writeUInt16LE(1, 4); // 一张图

// BMP info header（40 字节，height 为实际两倍）
const bih = Buffer.alloc(40);
bih.writeUInt32LE(40, 0);
bih.writeInt32LE(SIZE, 4);
bih.writeInt32LE(SIZE * 2, 8);
bih.writeUInt16LE(1, 12);
bih.writeUInt16LE(32, 14); // bpp
bih.writeUInt32LE(0, 16);  // BI_RGB
bih.writeUInt32LE(SIZE * SIZE * 4, 20);

// BMP 数据为自下而上
const rows = [];
for (let y = SIZE - 1; y >= 0; y--) {
  rows.push(pixels.subarray(y * SIZE * 4, (y + 1) * SIZE * 4));
}
const xorData = Buffer.concat(rows);
// AND mask：32bpp 带 alpha 时全 0 即可
const andMask = Buffer.alloc(((SIZE + 31) >> 5) * 4 * SIZE);

const imageData = Buffer.concat([bih, xorData, andMask]);

// 目录项（16 字节）
const entry = Buffer.alloc(16);
entry[0] = 0; // 256 用 0 表示
entry[1] = 0;
entry[2] = 0; // 无调色板
entry[3] = 0;
entry.writeUInt16LE(1, 4);  // planes
entry.writeUInt16LE(32, 6); // bpp
entry.writeUInt32LE(imageData.length, 8);
entry.writeUInt32LE(6 + 16, 12); // 数据偏移

const ico = Buffer.concat([header, entry, imageData]);

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'icon.ico');
fs.writeFileSync(outPath, ico);
console.log('已生成图标:', outPath, `(${(ico.length / 1024).toFixed(1)} KB)`);
