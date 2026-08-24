import { EditorSettings } from '../../common/types';

// 可选主题列表
const THEME_OPTIONS = [
  { value: 'ink-java-dark', label: '深色 (Ink Dark+)' },
  { value: 'vs-dark', label: '深色 (VS Dark)' },
  { value: 'vs-light', label: '浅色 (VS Light)' },
  { value: 'hc-black', label: '高对比度 (High Contrast)' }
];

/**
 * 设置面板（模态对话框）
 * 可配置：配置文件保存目录、主题配色、字体大小
 */
export class SettingsPanel {
  private overlay: HTMLElement;
  private configRootInput: HTMLInputElement;
  private themeSelect: HTMLSelectElement;
  private fontSizeInput: HTMLInputElement;
  private onSaved?: (settings: EditorSettings) => void;

  constructor(onSaved?: (settings: EditorSettings) => void) {
    this.onSaved = onSaved;

    // 遮罩层
    this.overlay = document.createElement('div');
    this.overlay.id = 'settings-overlay';
    this.overlay.hidden = true;

    this.overlay.innerHTML = `
      <div class="settings-dialog">
        <div class="settings-title">设置</div>
        <div class="settings-body">
          <div class="settings-field">
            <label for="settings-config-root">配置文件保存目录</label>
            <div class="settings-row">
              <input type="text" id="settings-config-root" placeholder="配置文件夹路径">
              <button id="settings-browse" class="settings-btn-secondary">浏览</button>
            </div>
            <div class="settings-hint">配置将分文件夹存放：settings/（编辑器配置）、history/（最近项目）</div>
          </div>
          <div class="settings-field">
            <label for="settings-theme">主题配色</label>
            <select id="settings-theme"></select>
          </div>
          <div class="settings-field">
            <label for="settings-font-size">编辑器字体大小</label>
            <input type="number" id="settings-font-size" min="10" max="32" step="1">
          </div>
        </div>
        <div class="settings-actions">
          <button id="settings-save" class="settings-btn-primary">保存</button>
          <button id="settings-cancel" class="settings-btn-secondary">取消</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    this.configRootInput = this.overlay.querySelector('#settings-config-root')!;
    this.themeSelect = this.overlay.querySelector('#settings-theme')!;
    this.fontSizeInput = this.overlay.querySelector('#settings-font-size')!;

    // 动态填充主题选项（避免 innerHTML 拼接动态内容）
    for (const t of THEME_OPTIONS) {
      const option = document.createElement('option');
      option.value = t.value;
      option.textContent = t.label;
      this.themeSelect.appendChild(option);
    }

    // 浏览选择目录
    this.overlay.querySelector('#settings-browse')!.addEventListener('click', async () => {
      const dir = await window.electronAPI.browseDir();
      if (dir) {
        this.configRootInput.value = dir;
      }
    });

    // 保存
    this.overlay.querySelector('#settings-save')!.addEventListener('click', () => this.save());

    // 取消
    this.overlay.querySelector('#settings-cancel')!.addEventListener('click', () => this.hide());

    // 点击遮罩关闭
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.hide();
    });
  }

  /**
   * 打开设置面板，加载当前配置
   */
  async show() {
    const result = await window.electronAPI.getSettings();
    if (result.success && result.settings) {
      const s = result.settings as EditorSettings;
      this.configRootInput.value = s.configRoot;
      this.themeSelect.value = s.theme;
      this.fontSizeInput.value = String(s.fontSize ?? 14);
    }
    this.overlay.hidden = false;
  }

  hide() {
    this.overlay.hidden = true;
  }

  private async save() {
    const settings: EditorSettings = {
      configRoot: this.configRootInput.value.trim(),
      theme: this.themeSelect.value,
      fontSize: parseInt(this.fontSizeInput.value, 10) || 14
    };

    const result = await window.electronAPI.saveSettings(settings);
    if (result.success) {
      this.hide();
      this.onSaved?.(settings);
    } else {
      alert(`保存配置失败: ${result.error}`);
    }
  }
}
