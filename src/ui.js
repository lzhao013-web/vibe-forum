// ui.js —— 共享 UI 工具:头部、toast、骨架屏、加载文案、时间/数字格式化

import { store } from './store.js';

// ---- 全局 DOM 引用 ----
const headerEl = () => document.getElementById('app-header');
const toastEl = () => document.getElementById('toast');

// ---- 顶栏 ----
function renderHeader() {
  const el = headerEl();
  if (!el) return;
  const user = store.getUser();
  if (!user) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="header-inner">
      <a class="header-logo" href="#/">
        <span class="logo-emoji">💬</span>
        <span class="logo-text">Vibe Forum</span>
      </a>
      <form class="header-search" id="header-search-form">
        <input type="text" id="header-search-input" placeholder="搜索帖子、话题、用户…" autocomplete="off" />
        <button type="submit" aria-label="搜索">🔍</button>
      </form>
      <div class="header-user">
        <span class="user-avatar" title="${escapeHtml(user.name)}">${userAvatar(user.name)}</span>
        <span class="user-name">${escapeHtml(user.name)}</span>
        <button class="header-reset" id="header-reset" title="切换账号">⏻</button>
      </div>
    </div>`;

  // 搜索提交
  document.getElementById('header-search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('header-search-input').value.trim();
    if (q) location.hash = `#/search?q=${encodeURIComponent(q)}`;
  });

  // 切换账号(实际是清空本机会话,重新进入)
  document.getElementById('header-reset').addEventListener('click', () => {
    if (confirm('确定要切换账号吗?当前账号的浏览记录将被清除。')) {
      store.resetAll();
      location.hash = '#/register';
    }
  });
}

function hideHeader() {
  const el = headerEl();
  if (el) {
    el.classList.add('hidden');
    el.innerHTML = '';
  }
}

// ---- Toast ----
let toastTimer = null;
function toast(msg, type = 'info') {
  const el = toastEl();
  if (!el) return;
  el.textContent = msg;
  el.className = `toast toast-${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('hidden');
  }, 3000);
}

// ---- 骨架屏 ----
function skeletonList(count = 6, opts = {}) {
  const avatar = opts.avatar !== false;
  const lines = opts.lines || 1;
  let items = '';
  for (let i = 0; i < count; i++) {
    let body = '';
    for (let j = 0; j < lines; j++) {
      body += `<div class="sk-line" style="width:${60 + ((i + j) % 3) * 12}%"></div>`;
    }
    items += `
      <div class="sk-row">
        ${avatar ? '<div class="sk-avatar"></div>' : ''}
        <div class="sk-content">${body}</div>
      </div>`;
  }
  return `<div class="skeleton-list">${items}</div>`;
}

function skeletonGrid(count = 5) {
  let items = '';
  for (let i = 0; i < count; i++) {
    items += `
      <div class="sk-card">
        <div class="sk-icon"></div>
        <div class="sk-card-body">
          <div class="sk-line" style="width:50%"></div>
          <div class="sk-line" style="width:80%;height:10px;margin-top:6px"></div>
        </div>
      </div>`;
  }
  return `<div class="skeleton-grid">${items}</div>`;
}

// ---- 加载文案(缓解等待焦虑) ----
const LOADING_LINES = [
  '正在加载…',
  '正在拉取最新内容…',
  '快好了,稍等…',
  '正在整理帖子…',
  '加载中,请稍候…',
  '正在获取数据…',
  '马上就好…',
];
function loadingLine() {
  return LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)];
}

function loadingBlock(text) {
  const id = 'lb_' + Math.random().toString(36).slice(2, 8);
  // 动态轮播文案,缓解等待焦虑
  setTimeout(() => {
    const el = document.getElementById(id + '_p');
    if (!el) return;
    const lines = [text || loadingLine(), '正在加载…', '正在拉取最新内容…', '快好了,稍等…'];
    let i = 0;
    el._vfTimer = setInterval(() => {
      i = (i + 1) % lines.length;
      const cur = document.getElementById(id + '_p');
      if (cur) cur.textContent = lines[i];
      else clearInterval(el._vfTimer);
    }, 1800);
  }, 50);
  return `<div class="loading-block" id="${id}">
    <div class="loading-spinner"></div>
    <p id="${id}_p">${escapeHtml(text || loadingLine())}</p>
  </div>`;
}

// ---- 工具函数 ----
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 根据昵称 hash 选一个 emoji 头像(稳定)
const AVATARS = ['🐱', '🦊', '🐼', '🐧', '🦉', '🐹', '🐯', '🐸', '🦝', '🐨', '🐵', '🦄', '🐙', '🐳', '🦁', '🐰'];
function userAvatar(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

// 相对时间格式化(若 LLM 已给相对时间就直接用)
function fmtNum(n) {
  n = Number(n) || 0;
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

// 构造带 meta 的 topic 链接 hash,保证列表→详情标题/作者一致(不出戏)
// meta:{ title, boardId, boardName, author, replies }
function topicLink(id, meta = {}) {
  const params = new URLSearchParams();
  if (meta.title) params.set('title', meta.title);
  if (meta.boardId) params.set('boardId', meta.boardId);
  if (meta.boardName) params.set('boardName', meta.boardName);
  if (meta.author) params.set('author', meta.author);
  if (meta.replies != null) params.set('replies', meta.replies);
  const qs = params.toString();
  return `#/topic/${encodeURIComponent(id)}${qs ? '?' + qs : ''}`;
}

// 把带 \n\n 的正文渲染成段落
function renderContent(text) {
  if (Array.isArray(text)) text = text.join('\n\n');
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// 错误状态块
function errorBlock(msg, retryFn) {
  return `<div class="error-block">
    <p>😵 ${escapeHtml(msg || '生成失败,请稍后再试')}</p>
    ${retryFn ? `<button class="btn btn-primary" onclick="window.__vf_retry && window.__vf_retry()">重试</button>` : ''}
  </div>`;
}

export const ui = {
  renderHeader,
  hideHeader,
  toast,
  skeletonList,
  skeletonGrid,
  loadingLine,
  loadingBlock,
  escapeHtml,
  userAvatar,
  fmtNum,
  renderContent,
  topicLink,
  errorBlock,
};
