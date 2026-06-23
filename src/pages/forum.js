// pages/forum.js —— 板块页:帖子列表 + 分页

import { ui } from '../ui.js';
import { getBoardById, getForumPage } from '../content.js';
import { store } from '../store.js';

const PAGE_SIZE = 12;
const MAX_PAGES = 8; // 板块显示的页数上限(够浏览,不无限)

export async function forumPage(params, query, mount) {
  if (!store.isLoggedIn()) {
    location.hash = '#/register';
    return;
  }

  const boardId = params.id;
  let page = parseInt(query.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;

  ui.renderHeader();
  const board = await getBoardById(boardId);

  mount.innerHTML = `
    <div class="forum-head card section">
      <div class="forum-head-row">
        <div class="forum-title-wrap">
          <span class="forum-icon">${ui.escapeHtml(board.icon || '📌')}</span>
          <div>
            <h1 class="forum-title">${ui.escapeHtml(board.name)}</h1>
            <p class="forum-desc muted">${ui.escapeHtml(board.desc || '讨论区')}</p>
          </div>
        </div>
        <a class="btn btn-primary" href="#/newpost?board=${encodeURIComponent(boardId)}">+ 发新帖</a>
      </div>
    </div>

    <div class="card section">
      <div id="forum-list">${ui.skeletonList(PAGE_SIZE, { lines: 1 })}</div>
    </div>

    <div id="forum-pager" class="pager"></div>
  `;

  await loadPage(boardId, board, page);
}

async function loadPage(boardId, board, page) {
  const container = document.getElementById('forum-list');
  const pager = document.getElementById('forum-pager');

  try {
    const { topics } = await getForumPage(boardId, page);
    container.innerHTML = renderTopicRows(topics);
    container.querySelectorAll('.topic-item').forEach((item) => {
      item.addEventListener('click', () => {
        location.hash = ui.topicLink(item.dataset.id, {
          title: item.dataset.title,
          boardId: boardId,
          boardName: board.name,
          author: item.dataset.author,
          replies: item.dataset.replies,
        });
      });
    });
    pager.innerHTML = renderPager(boardId, page, topics.length);
  } catch (e) {
    window.__vf_retry = () => loadPage(boardId, board, page);
    container.innerHTML = `<div class="error-block">
      <p>😵 帖子列表加载失败:${ui.escapeHtml(e.message || '网络错误,请稍后重试')}</p>
      <button class="btn btn-primary" onclick="window.__vf_retry && window.__vf_retry()">重试</button>
    </div>`;
    pager.innerHTML = '';
  }
}

function renderTopicRows(topics) {
  if (!topics.length) return '<p class="muted">这个板块还没有帖子,来发第一帖吧</p>';
  return `<div class="topic-list">${topics.map(renderTopicRow).join('')}</div>`;
}

function renderTopicRow(t) {
  const titleHtml = t.pinned
    ? `<span class="pin-tag">置顶</span> ${ui.escapeHtml(t.title)}`
    : ui.escapeHtml(t.title);
  return `
    <div class="topic-item" data-id="${ui.escapeHtml(t.id)}" data-title="${ui.escapeHtml(t.title)}" data-author="${ui.escapeHtml(t.author || '')}" data-replies="${t.replies}">
      <span class="topic-avatar">${ui.userAvatar(t.author || '?')}</span>
      <div class="topic-main">
        <div class="topic-title">${titleHtml}</div>
        <div class="topic-meta">
          <span>@${ui.escapeHtml(t.author)}</span>
          <span>${ui.fmtNum(t.replies)} 回复</span>
          <span>${ui.fmtNum(t.views)} 浏览</span>
          <span class="meta-time">${ui.escapeHtml(t.lastReply || '')}</span>
        </div>
      </div>
    </div>`;
}

function renderPager(boardId, page, loadedCount) {
  const hasPrev = page > 1;
  const hasNext = loadedCount >= PAGE_SIZE && page < MAX_PAGES;
  // 页码窗口:首页、末页、当前页 ±2
  const pages = new Set([1, page - 2, page - 1, page, page + 1, page + 2, MAX_PAGES]);
  const nums = [...pages].filter((n) => n >= 1 && n <= MAX_PAGES).sort((a, b) => a - b);

  let html = '<div class="pager-inner">';
  if (hasPrev) {
    html += `<a class="pager-btn" href="#/forum/${encodeURIComponent(boardId)}?page=${page - 1}">‹ 上一页</a>`;
  }
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) html += '<span class="pager-ellipsis">…</span>';
    if (n === page) {
      html += `<span class="pager-btn pager-current">${n}</span>`;
    } else {
      html += `<a class="pager-btn" href="#/forum/${encodeURIComponent(boardId)}?page=${n}">${n}</a>`;
    }
    prev = n;
  }
  if (hasNext) {
    html += `<a class="pager-btn" href="#/forum/${encodeURIComponent(boardId)}?page=${page + 1}">下一页 ›</a>`;
  }
  html += '</div>';
  return html;
}
