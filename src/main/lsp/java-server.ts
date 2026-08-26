/**
 * Java Language Server (Eclipse JDT LS) 配置
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { app } from 'electron';

/**
 * 检测 Java 运行时版本（java -version 输出在 stderr，需同时捕获）
 */
export function detectJavaVersion(): string | null {
  try {
    const result = spawnSync('java', ['-version'], { encoding: 'utf-8', timeout: 5000 });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    const match = output.match(/version "(\d+[\.\d]*)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * 检测 Java 主版本号
 */
export function detectJavaMajorVersion(): number {
  const version = detectJavaVersion();
  if (!version) return 0;
  const parts = version.split('.');
  // Java 9+ 直接用第一个数字，Java 8 及之前是 1.x
  const major = parseInt(parts[0], 10);
  return major === 1 ? parseInt(parts[1], 10) : major;
}

/**
 * 查找 JDT LS 启动器 jar
 * @param configPath JDT LS 配置目录（用户指定或自动检测）
 */
export function findJdtLauncher(configPath: string): string | null {
  // 查找 plugins 目录下的 org.eclipse.equinox.launcher_*.jar
  const pluginsDir = join(configPath, 'plugins');
  if (!existsSync(pluginsDir)) return null;

  try {
    const { readdirSync } = require('fs');
    const files = readdirSync(pluginsDir) as string[];
    const launcher = files.find(f => f.startsWith('org.eclipse.equinox.launcher_') && f.endsWith('.jar'));
    if (launcher) {
      return join(pluginsDir, launcher);
    }
  } catch {
    // 忽略
  }
  return null;
}

/**
 * 内置 JDT LS 路径（随安装包分发）
 * 打包后位于 resources/jdtls（extraResources），开发模式位于项目根 resources/jdtls
 */
export function findBundledJdtPath(): string | null {
  // 打包环境：process.resourcesPath 指向安装包 resources 目录
  const packagedPath = join(process.resourcesPath, 'jdtls');
  if (existsSync(join(packagedPath, 'plugins'))) return packagedPath;
  // 开发环境：项目根目录下的 resources/jdtls
  const devPath = join(app.getAppPath(), 'resources', 'jdtls');
  if (existsSync(join(devPath, 'plugins'))) return devPath;
  return null;
}

/**
 * 常见 JDT LS 安装路径（Windows）
 */
export function findDefaultJdtPath(): string | null {
  const candidates = [
    join(process.env.USERPROFILE || '', '.vscode', 'extensions'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'JDT_LS'),
    join(process.env.PROGRAMFILES || '', 'JDT_LS'),
    'C:\\jdt-ls'
  ];

  for (const base of candidates) {
    if (!existsSync(base)) continue;

    // 在 VS Code 扩展目录中查找
    if (base.includes('.vscode')) {
      try {
        const { readdirSync } = require('fs');
        const dirs = readdirSync(base) as string[];
        const jdtDir = dirs.find(d => d.startsWith('redhat.java-'));
        if (jdtDir) {
          const serverDir = join(base, jdtDir, 'server');
          if (existsSync(serverDir)) return serverDir;
        }
      } catch {
        // 忽略
      }
    } else {
      if (existsSync(base)) return base;
    }
  }

  return null;
}

/**
 * 当前平台对应的 JDT LS 配置目录
 */
function jdtConfigDir(): string {
  if (process.platform === 'win32') return 'config_win';
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'config_mac_arm' : 'config_mac';
  }
  return process.arch === 'arm64' ? 'config_linux_arm' : 'config_linux';
}

/**
 * 构建 JDT LS 启动参数
 */
export function buildJdtArgs(launcherJar: string, workspacePath: string): string[] {
  return [
    '-Declipse.application=org.eclipse.jdt.ls.core.id1',
    '-Dosgi.bundles.defaultStartLevel=4',
    '-Declipse.product=org.eclipse.jdt.ls.core.product',
    '-Dlog.level=ALL',
    '-noverify',
    '-Xmx1G',
    '--add-modules=ALL-SYSTEM',
    '--add-opens', 'java.base/java.util=ALL-UNNAMED',
    '--add-opens', 'java.base/java.lang=ALL-UNNAMED',
    '-jar', launcherJar,
    '-configuration', join(launcherJar, '..', '..', jdtConfigDir()),
    '-data', workspacePath
  ];
}
