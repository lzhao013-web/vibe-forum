// pages/topic.js —— 帖子内容页:楼主帖(1楼) + 回复楼层(分页) + 回复框

import { ui } from '../ui.js';
import { getTopicDetail, getTopicRepliesPage, appendUserReply } from '../content.js';
import { store } from '../store.js';

const REPLIES_PER_PAGE = 10;

export async function topicPage(params, query, mount) {
  if (!store.isLoggedIn()) {
    location.hash = '#/register';
    return;
  }

  const topicId = params.id;
  let page = parseInt(query.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;

  ui.renderHeader();

  // 初始骨架
  mount.innerHTML = `
    <div id="topic-detail">${ui.skeletonList(1, { lines: 4 })}</div>
    <div id="topic-replies">${ui.skeletonList(5)}</div>
  `;

  // 先拿详情(楼主帖)。topicMeta 来自 query(列表跳转时带上),用于保证标题/作者一致
  const topicMeta = parseMeta(query);
  let detail;
  try {
    detail = await getTopicDetail(topicId, topicMeta);
  } catch (e) {
    document.getElementById('topic-detail').innerHTML = errorBox(e, () => topicPage(params, query, mount));
    document.getElementById('topic-replies').innerHTML = '';
    return;
  }

  // 渲染详情区
  document.getElementById('topic-detail').innerHTML = renderDetail(detail);

  // 加载回复(分页)
  await loadReplies(topicId, page, detail);

  // 绑定回复框
  bindReplyBox(topicId, detail);
}

// 从 query 里解析列表传来的 meta(标题/板块/作者/回复数)
function parseMeta(query) {
  const meta = {};
  if (query.title) meta.title = query.title;
  if (query.boardId) meta.boardId = query.boardId;
  if (query.boardName) meta.boardName = query.boardName;
  if (query.author) meta.author = query.author;
  if (query.replies) meta.replies = parseInt(query.replies, 10);
  return meta;
}

async function loadReplies(topicId, page, detail) {
  const container = document.getElementById('topic-replies');
  const totalReplies = detail.replies || 0;

  // 用户刚发的帖(自己发的,还没有任何回复):绝不生成 AI 回复,
  // 直接显示空状态等真实回复。否则会出现"一发帖就一堆回复"的穿帮。
  if (detail.isUserPost && totalReplies === 0 && page === 1) {
    container.innerHTML = renderEmptyReplies(topicId, detail);
    return;
  }

  try {
    const { replies } = await getTopicRepliesPage(topicId, page, detail);
    // 实际回复数优先(用户帖 detail.replies 可能滞后,以生成的为准,且不少于已加载的)
    const effectiveTotal = Math.max(totalReplies, replies.length);
    container.innerHTML = renderReplies(replies, effectiveTotal, page, topicId, detail);
  } catch (e) {
    // 回复生成失败不致命:显示空状态 + 重试
    window.__vf_retry_replies = () => loadReplies(topicId, page, detail);
    container.innerHTML = `
      <div class="card section">
        <div class="error-block">
          <p>😵 回复加载失败:${ui.escapeHtml(e.message || '未知错误')}</p>
          <button class="btn btn-primary" onclick="window.__vf_retry_replies && window.__vf_retry_replies()">重试</button>
        </div>
      </div>`;
  }
}

function renderDetail(d) {
  const tag = d.isUserPost ? '<span class="pin-tag pin-mine">我的</span>' : '';
  return `
    <div class="card topic-detail-card">
      <div class="topic-detail-head">
        <a class="back-link" href="#/forum/${encodeURIComponent(d.boardId)}">‹ ${ui.escapeHtml(d.boardName || '板块')}</a>
        <h1 class="topic-detail-title">${tag}${ui.escapeHtml(d.title)}</h1>
      </div>
      <div class="floor floor-op">
        <div class="floor-left">
          <span class="floor-avatar">${ui.escapeHtml(d.avatar || '🙂')}</span>
          <div class="floor-author">
            <span class="floor-name">${ui.escapeHtml(d.author)}</span>
            <span class="floor-time">${ui.escapeHtml(d.created || '')}</span>
          </div>
        </div>
        <span class="floor-num">1 楼</span>
      </div>
      <div class="floor-content">${ui.renderContent(d.content)}</div>
      <div class="topic-actions">
        <span class="action-chip">💬 ${ui.fmtNum(d.replies)}</span>
        <span class="action-chip">👁 ${ui.fmtNum(Math.max(d.replies * 8, 50))}</span>
      </div>
    </div>`;
}

// 空回复状态(用户帖暂无回复时):只显示提示 + 回复框,绝不生成 AI 回复
function renderEmptyReplies(topicId, detail) {
  return renderReplies([], 0, 1, topicId, detail);
}

function renderReplies(replies, totalReplies, page, topicId, detail) {
  if (!replies || !replies.length) {
    return `<div class="card section empty-replies">
      <p class="muted">还没有人回复,来说点什么吧 👇</p>
    </div>${renderReplyBox(topicId, detail)}`;
  }
  const totalPages = Math.max(1, Math.ceil((totalReplies || replies.length) / REPLIES_PER_PAGE));
  return `
    <div class="card section">
      <div class="replies-head">全部回复 <span class="muted">${ui.fmtNum(totalReplies)}</span></div>
      ${replies.map((r) => renderFloor(r)).join('')}
    </div>
    ${renderPager(topicId, page, totalPages, detail)}
    ${renderReplyBox(topicId, detail)}`;
}

function renderFloor(r) {
  const mineTag = r.isUserReply ? '<span class="pin-tag pin-mine">我</span>' : '';
  return `
    <div class="floor">
      <div class="floor-left">
        <span class="floor-avatar small">${ui.escapeHtml(r.avatar || '🙂')}</span>
        <div class="floor-author">
          <span class="floor-name">${mineTag}${ui.escapeHtml(r.author)}</span>
          <span class="floor-time">${ui.escapeHtml(r.created || '')}</span>
        </div>
      </div>
      <span class="floor-num">${r.floor} 楼</span>
    </div>
    <div class="floor-content floor-content-reply">${ui.renderContent(r.content)}</div>`;
}

function renderReplyBox(topicId, detail) {
  return `
    <div class="card section reply-box">
      <div class="reply-head">发表回复</div>
      <textarea id="reply-input" class="reply-input" rows="3" placeholder="说点什么…"></textarea>
      <div class="reply-actions">
        <button id="reply-submit" class="btn btn-primary">回复</button>
      </div>
    </div>`;
}

function bindReplyBox(topicId, detail) {
  const submit = document.getElementById('reply-submit');
  const input = document.getElementById('reply-input');
  if (!submit || !input) return;
  submit.addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) {
      ui.toast('回复内容不能为空', 'error');
      return;
    }
    appendUserReply(topicId, text, detail);
    ui.toast('回复成功', 'success');
    // 跳回第 1 页查看新回复。必须带上完整 meta(title 等),
    // 否则 URL 缺 title → 缓存 key 不一致 → 刚发的回复查不到
    location.hash = pagerLink(topicId, detail, 1);
  });
}

// 构造带完整 meta 的分页链接(必须保留 title 等,否则翻页后 key 不一致会串台)
function pagerLink(topicId, detail, page) {
  const params = new URLSearchParams();
  if (detail?.title) params.set('title', detail.title);
  if (detail?.boardId) params.set('boardId', detail.boardId);
  if (detail?.boardName) params.set('boardName', detail.boardName);
  if (detail?.author) params.set('author', detail.author);
  if (detail?.replies != null) params.set('replies', detail.replies);
  params.set('page', page);
  return `#/topic/${encodeURIComponent(topicId)}?${params.toString()}`;
}

function renderPager(topicId, page, totalPages, detail) {
  if (totalPages <= 1) return '';
  const nums = pageWindow(page, totalPages);
  let html = '<div class="pager"><div class="pager-inner">';
  if (page > 1) html += `<a class="pager-btn" href="${pagerLink(topicId, detail, page - 1)}">‹ 上一页</a>`;
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) html += '<span class="pager-ellipsis">…</span>';
    html += n === page
      ? `<span class="pager-btn pager-current">${n}</span>`
      : `<a class="pager-btn" href="${pagerLink(topicId, detail, n)}">${n}</a>`;
    prev = n;
  }
  if (page < totalPages) html += `<a class="pager-btn" href="${pagerLink(topicId, detail, page + 1)}">下一页 ›</a>`;
  html += '</div></div>';
  return html;
}

function pageWindow(page, total) {
  const set = new Set([1, page - 1, page, page + 1, total]);
  set.add(Math.max(1, page - 2));
  set.add(Math.min(total, page + 2));
  return [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
}

function errorBox(e, retry) {
  window.__vf_retry_detail = retry;
  return `<div class="card section error-block">
    <p>😵 帖子加载失败:${ui.escapeHtml(e.message || '网络错误,请稍后重试')}</p>
    <button class="btn btn-primary" onclick="window.__vf_retry_detail && window.__vf_retry_detail()">重试</button>
  </div>`;
}
