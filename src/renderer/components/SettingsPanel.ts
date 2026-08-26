import { EditorSettings, TasksConfig, TaskScriptEntry, TaskScriptConfig, ProjectTaskConfig } from '../../common/types';

// 可选主题列表
const THEME_OPTIONS = [
  { value: 'ink-java-dark', label: '深色 (Ink Dark+)' },
  { value: 'vs-dark', label: '深色 (VS Dark)' },
  { value: 'vs-light', label: '浅色 (VS Light)' },
  { value: 'hc-black', label: '高对比度 (High Contrast)' }
];

// 自动保存选项
const AUTO_SAVE_OPTIONS = [
  { value: 'off', label: '关闭' },
  { value: 'afterDelay', label: '延迟保存' },
  { value: 'onFocusChange', label: '焦点切换时保存' }
];

// 换行选项
const WORD_WRAP_OPTIONS = [
  { value: 'off', label: '关闭' },
  { value: 'on', label: '开启' }
];

/**
 * 设置面板（模态对话框）
 * 可配置：配置文件保存目录、主题配色、字体大小、自动保存、Tab 大小、换行、小地图、Java Server 路径
 */
export class SettingsPanel {
  private overlay: HTMLElement;
  private configRootInput: HTMLInputElement;
  private themeSelect: HTMLSelectElement;
  private fontSizeInput: HTMLInputElement;
  private autoSaveSelect: HTMLSelectElement;
  private autoSaveDelayInput: HTMLInputElement;
  private tabSizeInput: HTMLInputElement;
  private wordWrapSelect: HTMLSelectElement;
  private minimapCheckbox: HTMLInputElement;
  private javaServerPathInput: HTMLInputElement;
  private buildScriptInput: HTMLInputElement;
  private runScriptInput: HTMLInputElement;
  private onSaved?: (settings: EditorSettings) => void;
  // 任务配置（打开面板时加载，保存时写回）
  private tasksConfig: TasksConfig = { global: { buildScript: '', runScript: '' }, projects: {} };
  private taskScope: 'global' | 'project' = 'global';
  // 当前打开的项目路径（由外部写入；为空时项目级配置不可用）
  public projectPath: string | null = null;

  constructor(onSaved?: (settings: EditorSettings) => void) {
    this.onSaved = onSaved;

    // 遮罩层
    this.overlay = document.createElement('div');
    this.overlay.id = 'settings-overlay';
    this.overlay.hidden = true;

    this.overlay.innerHTML = `
      <div class="settings-dialog">
        <div class="settings-title">设置</div>
        <div class="settings-layout">
          <div class="settings-nav">
            <button class="settings-nav-item active" data-section="general">基础配置</button>
            <button class="settings-nav-item" data-section="editor">编辑器</button>
            <button class="settings-nav-item" data-section="language">代码智能</button>
            <button class="settings-nav-item" data-section="tasks">编译运行</button>
          </div>
          <div class="settings-body">
            <div class="settings-section active" data-section="general">
              <div class="settings-section-title">基础配置</div>
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
            <div class="settings-section" data-section="editor">
              <div class="settings-section-title">编辑器</div>
              <div class="settings-field">
                <label for="settings-auto-save">自动保存</label>
                <select id="settings-auto-save"></select>
              </div>
              <div class="settings-field">
                <label for="settings-auto-save-delay">自动保存延迟 (ms)</label>
                <input type="number" id="settings-auto-save-delay" min="100" max="10000" step="100">
              </div>
              <div class="settings-field">
                <label for="settings-tab-size">Tab 缩进宽度</label>
                <input type="number" id="settings-tab-size" min="2" max="8" step="2">
              </div>
              <div class="settings-field">
                <label for="settings-word-wrap">自动换行</label>
                <select id="settings-word-wrap"></select>
              </div>
              <div class="settings-field">
                <label class="settings-checkbox-label">
                  <input type="checkbox" id="settings-minimap">
                  <span>显示小地图</span>
                </label>
              </div>
            </div>
            <div class="settings-section" data-section="language">
              <div class="settings-section-title">代码智能</div>
              <div class="settings-field">
                <label for="settings-java-server-path">Java Language Server 路径</label>
                <div class="settings-row">
                  <input type="text" id="settings-java-server-path" placeholder="留空则自动检测">
                  <button id="settings-browse-java" class="settings-btn-secondary">浏览</button>
                </div>
                <div class="settings-hint">需要 Java 17+ 环境，留空将自动检测常见安装路径</div>
              </div>
            </div>
            <div class="settings-section" data-section="tasks" id="settings-tasks-section">
              <div class="settings-section-title">编译运行</div>
              <div class="settings-field">
                <label>配置级别</label>
                <div class="settings-row">
                  <label class="settings-checkbox-label">
                    <input type="radio" name="task-scope" value="global" checked>
                    <span>系统级（全局默认）</span>
                  </label>
                  <label class="settings-checkbox-label">
                    <input type="radio" name="task-scope" value="project">
                    <span>当前项目</span>
                  </label>
                </div>
                <div class="settings-hint">项目级优先于系统级；项目级未配置的字段自动回退系统级</div>
              </div>
              <div id="settings-task-global-fields">
                <div class="settings-field">
                  <label for="settings-build-script">编译脚本（.bat / .ps1）</label>
                  <div class="settings-row">
                    <input type="text" id="settings-build-script" placeholder="绝对路径，或相对项目根的路径">
                    <button id="settings-browse-build" class="settings-btn-secondary">浏览</button>
                  </div>
                </div>
                <div class="settings-field">
                  <label for="settings-run-script">运行脚本（.bat / .ps1）</label>
                  <div class="settings-row">
                    <input type="text" id="settings-run-script" placeholder="绝对路径，或相对项目根的路径">
                    <button id="settings-browse-run" class="settings-btn-secondary">浏览</button>
                  </div>
                  <div class="settings-hint">在项目根目录下执行；快捷键：编译 Ctrl+Shift+B / 运行 F5 / 编译并运行 Ctrl+F5</div>
                </div>
              </div>
              <div id="settings-task-project-fields" hidden>
                <div class="settings-field">
                  <label>编译脚本列表（.bat / .ps1）</label>
                  <div id="task-build-rows" class="task-script-rows"></div>
                  <button id="task-add-build" class="settings-btn-secondary task-script-add">+ 添加编译脚本</button>
                </div>
                <div class="settings-field">
                  <label>运行脚本列表（.bat / .ps1）</label>
                  <div id="task-run-rows" class="task-script-rows"></div>
                  <button id="task-add-run" class="settings-btn-secondary task-script-add">+ 添加运行脚本</button>
                </div>
                <div class="settings-hint">多个脚本时执行前弹窗选择；“编译并运行”依次执行全部编译脚本后再依次执行全部运行脚本</div>
              </div>
            </div>
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
    this.autoSaveSelect = this.overlay.querySelector('#settings-auto-save')!;
    this.autoSaveDelayInput = this.overlay.querySelector('#settings-auto-save-delay')!;
    this.tabSizeInput = this.overlay.querySelector('#settings-tab-size')!;
    this.wordWrapSelect = this.overlay.querySelector('#settings-word-wrap')!;
    this.minimapCheckbox = this.overlay.querySelector('#settings-minimap')!;
    this.javaServerPathInput = this.overlay.querySelector('#settings-java-server-path')!;
    this.buildScriptInput = this.overlay.querySelector('#settings-build-script')!;
    this.runScriptInput = this.overlay.querySelector('#settings-run-script')!;

    // 动态填充主题选项
    for (const t of THEME_OPTIONS) {
      const option = document.createElement('option');
      option.value = t.value;
      option.textContent = t.label;
      this.themeSelect.appendChild(option);
    }

    // 动态填充自动保存选项
    for (const o of AUTO_SAVE_OPTIONS) {
      const option = document.createElement('option');
      option.value = o.value;
      option.textContent = o.label;
      this.autoSaveSelect.appendChild(option);
    }

    // 动态填充换行选项
    for (const w of WORD_WRAP_OPTIONS) {
      const option = document.createElement('option');
      option.value = w.value;
      option.textContent = w.label;
      this.wordWrapSelect.appendChild(option);
    }

    // 浏览选择目录
    this.overlay.querySelector('#settings-browse')!.addEventListener('click', async () => {
      const dir = await window.electronAPI.browseDir();
      if (dir) {
        this.configRootInput.value = dir;
      }
    });

    // 浏览选择 Java Server 路径
    this.overlay.querySelector('#settings-browse-java')!.addEventListener('click', async () => {
      const dir = await window.electronAPI.browseDir();
      if (dir) {
        this.javaServerPathInput.value = dir;
      }
    });

    // 任务配置：级别切换时重新填充输入框
    const scopeRadios = this.overlay.querySelectorAll<HTMLInputElement>('input[name="task-scope"]');
    scopeRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        this.taskScope = radio.value as 'global' | 'project';
        this.fillTaskInputs();
      });
    });

    // 浏览选择脚本文件
    this.overlay.querySelector('#settings-browse-build')!.addEventListener('click', async () => {
      const file = await window.electronAPI.browseFile();
      if (file) this.buildScriptInput.value = file;
    });
    this.overlay.querySelector('#settings-browse-run')!.addEventListener('click', async () => {
      const file = await window.electronAPI.browseFile();
      if (file) this.runScriptInput.value = file;
    });

    // 项目级列表：添加空行
    this.overlay.querySelector('#task-add-build')!.addEventListener('click', () => {
      this.overlay.querySelector('#task-build-rows')!.appendChild(this.createScriptRow({ name: '', script: '' }));
    });
    this.overlay.querySelector('#task-add-run')!.addEventListener('click', () => {
      this.overlay.querySelector('#task-run-rows')!.appendChild(this.createScriptRow({ name: '', script: '' }));
    });

    // 左侧菜单切换右侧分区
    this.overlay.querySelectorAll<HTMLElement>('.settings-nav-item').forEach((item) => {
      item.addEventListener('click', () => this.activateSection(item.dataset.section ?? 'general'));
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
   * @param section 可选，定位到指定分区（如 'tasks' 编译运行）
   */
  async show(section?: string) {
    const result = await window.electronAPI.getSettings();
    if (result.success && result.settings) {
      const s = result.settings as EditorSettings;
      this.configRootInput.value = s.configRoot;
      this.themeSelect.value = s.theme;
      this.fontSizeInput.value = String(s.fontSize ?? 14);
      this.autoSaveSelect.value = s.autoSave ?? 'off';
      this.autoSaveDelayInput.value = String(s.autoSaveDelay ?? 1000);
      this.tabSizeInput.value = String(s.tabSize ?? 4);
      this.wordWrapSelect.value = s.wordWrap ?? 'off';
      this.minimapCheckbox.checked = s.minimap !== false;
      this.javaServerPathInput.value = s.javaServerPath ?? '';
    }

    // 加载任务配置，默认展示系统级
    try {
      const tr = await window.electronAPI.getTasksConfig();
      if (tr.success && tr.config) {
        this.tasksConfig = tr.config;
      }
    } catch {
      // 忽略，使用内存中已有配置
    }
    this.taskScope = 'global';
    (this.overlay.querySelector('input[name="task-scope"][value="global"]') as HTMLInputElement).checked = true;
    const projectRadio = this.overlay.querySelector('input[name="task-scope"][value="project"]') as HTMLInputElement;
    projectRadio.disabled = !this.projectPath;
    projectRadio.title = this.projectPath ? '' : '需先打开项目';
    this.fillTaskInputs();

    this.overlay.hidden = false;

    // 定位到指定分区（默认基础配置）
    this.activateSection(section && this.overlay.querySelector(`.settings-section[data-section="${section}"]`) ? section : 'general');
  }

  // 切换左侧菜单与右侧分区的激活状态
  private activateSection(section: string) {
    this.overlay.querySelectorAll<HTMLElement>('.settings-nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.section === section);
    });
    this.overlay.querySelectorAll<HTMLElement>('.settings-section').forEach((el) => {
      el.classList.toggle('active', el.dataset.section === section);
    });
    const body = this.overlay.querySelector('.settings-body');
    if (body) body.scrollTop = 0;
  }

  // 归一化项目级配置为列表格式（兼容旧版单条格式）
  private normalizeProject(cfg: ProjectTaskConfig | TaskScriptConfig): { build: TaskScriptEntry[]; run: TaskScriptEntry[] } {
    const next = cfg as ProjectTaskConfig;
    if (Array.isArray(next.buildScripts) || Array.isArray(next.runScripts)) {
      return {
        build: (next.buildScripts || []).filter((e) => e && e.script && e.script.trim()),
        run: (next.runScripts || []).filter((e) => e && e.script && e.script.trim())
      };
    }
    const legacy = cfg as TaskScriptConfig;
    return {
      build: legacy.buildScript && legacy.buildScript.trim() ? [{ name: '', script: legacy.buildScript.trim() }] : [],
      run: legacy.runScript && legacy.runScript.trim() ? [{ name: '', script: legacy.runScript.trim() }] : []
    };
  }

  // 创建一条脚本配置行（名称 + 路径 + 浏览 + 删除）
  private createScriptRow(entry: { name: string; script: string }): HTMLElement {
    const row = document.createElement('div');
    row.className = 'task-script-row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'task-script-name';
    nameInput.placeholder = '名称（可选）';
    nameInput.value = entry.name;

    const pathInput = document.createElement('input');
    pathInput.type = 'text';
    pathInput.className = 'task-script-path';
    pathInput.placeholder = '绝对路径，或相对项目根的路径';
    pathInput.value = entry.script;

    const browseBtn = document.createElement('button');
    browseBtn.className = 'settings-btn-secondary';
    browseBtn.textContent = '浏览';
    browseBtn.addEventListener('click', async () => {
      const file = await window.electronAPI.browseFile();
      if (file) pathInput.value = file;
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'settings-btn-secondary task-script-del';
    delBtn.textContent = '删除';
    delBtn.title = '删除该脚本';
    delBtn.addEventListener('click', () => row.remove());

    row.appendChild(nameInput);
    row.appendChild(pathInput);
    row.appendChild(browseBtn);
    row.appendChild(delBtn);
    return row;
  }

  // 收集列表容器中的行（过滤路径为空的行）
  private collectRows(selector: string): TaskScriptEntry[] {
    const rows = this.overlay.querySelectorAll<HTMLElement>(`${selector} .task-script-row`);
    const result: TaskScriptEntry[] = [];
    rows.forEach((row) => {
      const name = (row.querySelector('.task-script-name') as HTMLInputElement).value.trim();
      const script = (row.querySelector('.task-script-path') as HTMLInputElement).value.trim();
      if (script) result.push({ name, script });
    });
    return result;
  }

  // 按当前选中的作用域填充输入区
  private fillTaskInputs() {
    const globalFields = this.overlay.querySelector('#settings-task-global-fields') as HTMLElement;
    const projectFields = this.overlay.querySelector('#settings-task-project-fields') as HTMLElement;
    globalFields.hidden = this.taskScope !== 'global';
    projectFields.hidden = this.taskScope !== 'project';

    if (this.taskScope === 'global') {
      this.buildScriptInput.value = this.tasksConfig.global.buildScript ?? '';
      this.runScriptInput.value = this.tasksConfig.global.runScript ?? '';
      return;
    }

    // 项目级：渲染多脚本列表（空时给一行空行方便录入）
    const cfg = this.projectPath ? this.tasksConfig.projects[this.projectPath] : undefined;
    const lists = cfg ? this.normalizeProject(cfg) : { build: [], run: [] };
    const renderList = (selector: string, entries: TaskScriptEntry[]) => {
      const container = this.overlay.querySelector(selector)!;
      container.innerHTML = '';
      const source = entries.length > 0 ? entries : [{ name: '', script: '' }];
      source.forEach((e) => container.appendChild(this.createScriptRow(e)));
    };
    renderList('#task-build-rows', lists.build);
    renderList('#task-run-rows', lists.run);
  }

  hide() {
    this.overlay.hidden = true;
  }

  private async save() {
    const settings: EditorSettings = {
      configRoot: this.configRootInput.value.trim(),
      theme: this.themeSelect.value,
      fontSize: parseInt(this.fontSizeInput.value, 10) || 14,
      autoSave: this.autoSaveSelect.value as 'off' | 'afterDelay' | 'onFocusChange',
      autoSaveDelay: parseInt(this.autoSaveDelayInput.value, 10) || 1000,
      tabSize: parseInt(this.tabSizeInput.value, 10) || 4,
      wordWrap: this.wordWrapSelect.value as 'off' | 'on',
      minimap: this.minimapCheckbox.checked,
      javaServerPath: this.javaServerPathInput.value.trim()
    };

    const result = await window.electronAPI.saveSettings(settings);
    if (!result.success) {
      alert(`保存配置失败: ${result.error}`);
      return;
    }

    // 保存任务配置（只更新当前选中级别：系统级单条 / 项目级多列表）
    if (this.taskScope === 'project' && this.projectPath) {
      this.tasksConfig.projects[this.projectPath] = {
        buildScripts: this.collectRows('#task-build-rows'),
        runScripts: this.collectRows('#task-run-rows')
      };
    } else {
      this.tasksConfig.global = {
        buildScript: this.buildScriptInput.value.trim(),
        runScript: this.runScriptInput.value.trim()
      };
    }
    const taskResult = await window.electronAPI.saveTasksConfig(this.tasksConfig);
    if (!taskResult.success) {
      alert(`保存编译运行配置失败: ${taskResult.error}`);
      return;
    }

    this.hide();
    this.onSaved?.(settings);
  }
}
