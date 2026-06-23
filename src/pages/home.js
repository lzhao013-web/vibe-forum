// pages/home.js —— 首页:热帖 + 板块网格 + 顶栏

import { ui } from '../ui.js';
import { getBoards, getHotPage } from '../content.js';
import { store } from '../store.js';

export async function homePage(params, query, mount) {
  if (!store.isLoggedIn()) {
    location.hash = '#/register';
    return;
  }

  ui.renderHeader();
  const user = store.getUser();

  // 先渲染骨架,然后并行加载板块和热帖
  mount.innerHTML = `
    <div class="home-grid">
      <div class="home-main">
        <section class="card section">
          <div class="section-head">
            <h2>🔥 热门讨论</h2>
            <span class="section-sub">正在被热议的帖子</span>
          </div>
          <div id="hot-container">${ui.loadingBlock()}</div>
        </section>
      </div>
      <aside class="home-side">
        <section class="card section">
          <div class="section-head"><h2>🗂 板块</h2></div>
          <div id="boards-container">${ui.loadingBlock()}</div>
        </section>
        <section class="card section welcome-card">
          <div class="welcome-emoji">👋</div>
          <p>欢迎回来,<strong>${ui.escapeHtml(user.name)}</strong></p>
          <p class="welcome-note">你关注的「${ui.escapeHtml(user.theme)}」板块有新动态啦</p>
        </section>
      </aside>
    </div>`;

  // 并行加载
  loadHot();
  loadBoards();

  async function loadHot() {
    const container = document.getElementById('hot-container');
    try {
      const { topics } = await getHotPage(1);
      container.innerHTML = renderHotList(topics);
      bindHotLinks(container);
    } catch (e) {
      container.innerHTML = renderError(e, loadHot, '热帖');
    }
  }

  async function loadBoards() {
    const container = document.getElementById('boards-container');
    try {
      const { boards } = await getBoards();
      container.innerHTML = renderBoardGrid(boards);
      container.querySelectorAll('.board-card').forEach((card) => {
        card.addEventListener('click', () => {
          location.hash = `#/forum/${card.dataset.id}`;
        });
      });
    } catch (e) {
      container.innerHTML = renderError(e, loadBoards, '板块');
    }
  }
}

function renderHotList(topics) {
  if (!topics.length) return '<p class="muted">还没有热帖</p>';
  return `<div class="topic-list">${topics.map(renderHotItem).join('')}</div>`;
}

function renderHotItem(t) {
  const link = ui.topicLink(t.id, t);
  return `
    <a class="topic-item" href="${link}">
      <span class="topic-avatar">${ui.userAvatar(t.author || '?')}</span>
      <div class="topic-main">
        <div class="topic-title">${ui.escapeHtml(t.title)}</div>
        <div class="topic-meta">
          <a class="meta-board" href="#/forum/${encodeURIComponent(t.boardId || 'general')}" onclick="event.stopPropagation()">${ui.escapeHtml(t.boardName || '板块')}</a>
          <span>@${ui.escapeHtml(t.author)}</span>
          <span>${ui.fmtNum(t.replies)} 回复</span>
          <span class="meta-time">${ui.escapeHtml(t.lastReply || '')}</span>
        </div>
      </div>
    </a>`;
}

function bindHotLinks(container) {
  // 阻止 meta-board 冒泡触发整行跳转
  container.querySelectorAll('.meta-board').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
}

function renderBoardGrid(boards) {
  if (!boards.length) return '<p class="muted">还没有板块</p>';
  return `<div class="board-grid">${boards
    .map(
      (b) => `
    <div class="board-card" data-id="${ui.escapeHtml(b.id)}">
      <div class="board-icon">${ui.escapeHtml(b.icon || '📌')}</div>
      <div class="board-info">
        <div class="board-name">${ui.escapeHtml(b.name)}</div>
        <div class="board-desc">${ui.escapeHtml(b.desc || '')}</div>
      </div>
      <div class="board-count">${ui.fmtNum(b.todayPosts)}</div>
    </div>`
    )
    .join('')}</div>`;
}

function renderError(e, retryFn, label) {
  window.__vf_retry = retryFn;
  return `<div class="error-block">
    <p>😵 ${label}加载失败:${ui.escapeHtml(e.message || '网络错误,请稍后重试')}</p>
    <button class="btn btn-primary" onclick="window.__vf_retry && window.__vf_retry()">重试</button>
  </div>`;
}
