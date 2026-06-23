// pages/register.js —— 注册页:昵称 + 主题选择
// 主题:预设标签 + 自定义输入框

import { store } from '../store.js';
import { ui } from '../ui.js';

const PRESET_THEMES = [
  { id: 'tech', label: '技术 / 编程', emoji: '💻' },
  { id: 'game', label: '游戏', emoji: '🎮' },
  { id: 'anime', label: '动漫 / 二次元', emoji: '🌸' },
  { id: 'movie', label: '影视 / 音娱', emoji: '🎬' },
  { id: 'life', label: '生活 / 闲聊', emoji: '☕' },
  { id: 'sport', label: '体育', emoji: '⚽' },
  { id: 'fiction', label: '幻想 / 同人', emoji: '🏰' },
  { id: 'food', label: '美食', emoji: '🍜' },
];

let selectedTheme = null;

export async function registerPage(params, query, mount) {
  // 已登录直接跳走
  if (store.isLoggedIn()) {
    location.hash = '#/';
    return;
  }

  ui.hideHeader();
  mount.innerHTML = renderShell();

  const nameInput = document.getElementById('reg-name');
  const customInput = document.getElementById('reg-custom-theme');
  const submitBtn = document.getElementById('reg-submit');
  const errEl = document.getElementById('reg-error');

  // 主题标签点击
  mount.querySelectorAll('.theme-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      mount.querySelectorAll('.theme-chip').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
      selectedTheme = chip.dataset.theme;
      customInput.value = '';
      validate();
    });
  });

  // 自定义输入:清掉预设选择
  customInput.addEventListener('input', () => {
    if (customInput.value.trim()) {
      mount.querySelectorAll('.theme-chip').forEach((c) => c.classList.remove('selected'));
      selectedTheme = null;
    }
    validate();
  });

  nameInput.addEventListener('input', validate);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitBtn.click();
    }
  });

  function validate() {
    const name = nameInput.value.trim();
    const custom = customInput.value.trim();
    const ok = name.length >= 1 && (selectedTheme || custom.length >= 1);
    submitBtn.disabled = !ok;
  }

  submitBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const custom = customInput.value.trim();
    if (!name) return;
    let themeLabel;
    if (custom) {
      themeLabel = custom;
    } else if (selectedTheme) {
      themeLabel = PRESET_THEMES.find((t) => t.id === selectedTheme)?.label || selectedTheme;
    } else {
      return;
    }

    errEl.textContent = '';
    store.setUser({
      name,
      theme: themeLabel,
      createdAt: Date.now(),
    });
    ui.toast(`欢迎来到论坛,${name}!`, 'success');
    location.hash = '#/';
  });

  validate();
  nameInput.focus();
}

function renderShell() {
  return `
  <div class="register-wrap">
    <div class="register-card">
      <div class="register-hero">
        <div class="hero-emoji">💬</div>
        <h1>欢迎来到 Vibe Forum</h1>
        <p class="hero-sub">一个自由开放的交流社区。<br>在这里分享见闻、提出问题、认识志同道合的朋友。<br>填好昵称和感兴趣的方向,加入讨论吧。</p>
      </div>

      <div class="reg-field">
        <label for="reg-name">你的昵称</label>
        <input type="text" id="reg-name" maxlength="20" placeholder="给自己起个论坛 ID" autocomplete="off" />
      </div>

      <div class="reg-field">
        <label>你最常逛哪类板块?(我们会优先展示相关内容)</label>
        <div class="theme-chips">
          ${PRESET_THEMES.map(
            (t) => `<button type="button" class="theme-chip" data-theme="${t.id}">
              <span class="chip-emoji">${t.emoji}</span>${t.label}
            </button>`
          ).join('')}
        </div>
        <input type="text" id="reg-custom-theme" maxlength="30" placeholder="或者自己写一个(如:复古游戏、机械键盘、登山…)" autocomplete="off" />
      </div>

      <div id="reg-error" class="reg-error"></div>

      <button id="reg-submit" class="btn btn-primary btn-block" disabled>进入论坛 →</button>

      <p class="reg-note">提示:昵称设置后可在右上角随时修改。</p>
    </div>
  </div>`;
}
