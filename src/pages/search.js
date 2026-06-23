// pages/search.js —— 搜索结果页

import { ui } from '../ui.js';
import { getSearch } from '../content.js';
import { store } from '../store.js';

export async function searchPage(params, query, mount) {
  if (!store.isLoggedIn()) {
    location.hash = '#/register';
    return;
  }

  ui.renderHeader();
  const q = (query.q || '').trim();

  mount.innerHTML = `
    <div class="card section">
      <div class="search-head">
        <h2>🔍 搜索结果</h2>
      </div>
      <div id="search-query-display"></div>
      <div id="search-container">${q ? ui.skeletonList(5, { lines: 2 }) : ''}</div>
    </div>`;

  if (!q) {
    document.getElementById('search-query-display').innerHTML =
      '<p class="muted">在上方搜索框输入关键词试试</p>';
    document.getElementById('search-container').innerHTML = '';
    bindSearchBox();
    return;
  }

  document.getElementById('search-query-display').innerHTML =
    `<p class="search-q">关于 <strong>“${ui.escapeHtml(q)}”</strong> 的搜索结果</p>`;
  bindSearchBox();

  await doSearch(q);
}

async function doSearch(q) {
  const container = document.getElementById('search-container');
  try {
    const { results } = await getSearch(q);
    container.innerHTML = renderResults(results);
    container.querySelectorAll('.topic-item').forEach((item) => {
      item.addEventListener('click', () => {
        location.hash = ui.topicLink(item.dataset.id, {
          title: item.dataset.title,
          boardId: item.dataset.boardId,
          boardName: item.dataset.boardName,
          author: item.dataset.author,
          replies: item.dataset.replies,
        });
      });
    });
  } catch (e) {
    window.__vf_retry_search = () => doSearch(q);
    container.innerHTML = `<div class="error-block">
      <p>😵 搜索失败:${ui.escapeHtml(e.message || '网络错误,请稍后重试')}</p>
      <button class="btn btn-primary" onclick="window.__vf_retry_search && window.__vf_retry_search()">重试</button>
    </div>`;
  }
}

function renderResults(results) {
  if (!results.length) {
    return `<div class="state-empty"><p>没有找到相关结果 😢<br>换个关键词试试?</p></div>`;
  }
  return `<div class="topic-list">${results
    .map(
      (r) => `
    <div class="topic-item search-item" data-id="${ui.escapeHtml(r.id)}" data-title="${ui.escapeHtml(r.title)}" data-board-id="${ui.escapeHtml(r.boardId)}" data-board-name="${ui.escapeHtml(r.boardName)}" data-author="${ui.escapeHtml(r.author || '')}" data-replies="${r.replies}">
      <span class="topic-avatar">${ui.userAvatar(r.author || '?')}</span>
      <div class="topic-main">
        <div class="topic-title">${ui.escapeHtml(r.title)}</div>
        ${r.snippet ? `<div class="topic-snippet">${ui.escapeHtml(r.snippet)}</div>` : ''}
        <div class="topic-meta">
          <span class="meta-board">${ui.escapeHtml(r.boardName || '板块')}</span>
          <span>@${ui.escapeHtml(r.author || '')}</span>
          <span>${ui.fmtNum(r.replies)} 回复</span>
        </div>
      </div>
    </div>`
    )
    .join('')}</div>`;
}

// 搜索页里保留一个搜索框,方便换词
function bindSearchBox() {
  const wrap = document.querySelector('.search-head');
  if (!wrap || wrap.querySelector('#search-input')) return;
  const form = document.createElement('form');
  form.className = 'header-search';
  form.style.maxWidth = '100%';
  form.style.marginBottom = '8px';
  form.innerHTML = `
    <input type="text" id="search-input" placeholder="搜索…" autocomplete="off" />
    <button type="submit" aria-label="搜索">🔍</button>`;
  wrap.appendChild(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = document.getElementById('search-input').value.trim();
    if (v) location.hash = `#/search?q=${encodeURIComponent(v)}`;
  });
}
