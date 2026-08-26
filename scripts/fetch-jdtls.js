/**
 * 下载 Eclipse JDT Language Server 并解压到 resources/jdtls
 * 用法: node scripts/fetch-jdtls.js          （自动选择最新 milestone 版本）
 *       node scripts/fetch-jdtls.js 1.40.0   （指定版本）
 * 注意: JDT LS 1.41+ 需要 Java 21+ 运行；Java 17 环境请使用 1.40.0
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MILESTONES_URL = 'https://download.eclipse.org/jdtls/milestones/';
const targetDir = path.join(__dirname, '..', 'resources', 'jdtls');

// 解析目录列表页中的链接名（兼容单/双引号、绝对路径，取最后一段）
function parseListing(html) {
  const names = new Set();
  for (const m of html.matchAll(/href=["']([^"']+)["']/g)) {
    const href = m[1];
    if (/^(https?:)?\/\//.test(href)) continue; // 外部链接
    const seg = href.split('/').filter(Boolean).pop();
    if (!seg || seg === '..' || seg === '.') continue;
    names.add(seg);
  }
  return [...names];
}

// 版本号比较（如 1.40.0）
function compareVersion(a, b) {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`请求失败 ${url}: HTTP ${res.status}`);
  return res.text();
}

async function resolveVersion(specified) {
  if (specified) return specified;
  console.log('正在获取 JDT LS milestone 版本列表...');
  const entries = parseListing(await fetchText(MILESTONES_URL));
  const versions = entries.filter(e => /^\d+\.\d+(\.\d+)?$/.test(e));
  if (versions.length === 0) throw new Error('未找到任何 milestone 版本');
  versions.sort(compareVersion);
  return versions[versions.length - 1];
}

async function resolveArchive(version) {
  const html = await fetchText(`${MILESTONES_URL}${version}/`);
  // 文件链接可能指向 download.php 镜像页，直接从页面提取文件名构造直链
  const m = html.match(/jdt-language-server-[^"'\s<>]+?\.tar\.gz/);
  if (!m) throw new Error(`版本 ${version} 下未找到 jdt-language-server tar.gz`);
  return `${MILESTONES_URL}${version}/${m[0]}`;
}

async function download(url, dest) {
  console.log(`下载: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败: HTTP ${res.status}`);
  const total = parseInt(res.headers.get('content-length') || '0', 10);
  const chunks = [];
  let received = 0;
  let lastPercent = -1;
  for await (const chunk of res.body) {
    chunks.push(chunk);
    received += chunk.length;
    if (total > 0) {
      const percent = Math.floor((received / total) * 100);
      if (percent !== lastPercent && percent % 5 === 0) {
        lastPercent = percent;
        console.log(`  ${percent}%  (${(received / 1024 / 1024).toFixed(1)} MB)`);
      }
    }
  }
  fs.writeFileSync(dest, Buffer.concat(chunks));
  console.log(`下载完成: ${(received / 1024 / 1024).toFixed(1)} MB`);
}

async function main() {
  const specified = process.argv[2];
  const version = await resolveVersion(specified);
  console.log(`选定版本: ${version}`);

  const archiveUrl = await resolveArchive(version);
  const tmpFile = path.join(__dirname, '..', 'tmp', `jdtls-${version}.tar.gz`);
  fs.mkdirSync(path.dirname(tmpFile), { recursive: true });

  await download(archiveUrl, tmpFile);

  // 清理旧目录并解压（Windows 10+ 自带 bsdtar）
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  console.log('解压中...');
  execFileSync('tar', ['-xzf', tmpFile, '-C', targetDir], { stdio: 'inherit' });

  fs.writeFileSync(path.join(targetDir, 'JDTLS_VERSION'), version, 'utf-8');
  fs.rmSync(tmpFile, { force: true });

  console.log(`\n完成: JDT LS ${version} 已解压到 resources/jdtls`);
}

main().catch(err => {
  console.error('失败:', err.message || err);
  process.exit(1);
});
