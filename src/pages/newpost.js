// pages/newpost.js —— 发帖页
// 用户填标题+正文,提交后写入缓存(不调 LLM),并跳转到帖子页

import { ui } from '../ui.js';
import { getBoards, createUserPost } from '../content.js';
import { store } from '../store.js';

export async function newPostPage(params, query, mount) {
  if (!store.isLoggedIn()) {
    location.hash = '#/register';
    return;
  }

  ui.renderHeader();

  // 预选板块(从 query.board 来)
  const preBoard = query.board || '';

  let boards = [];
  try {
    const data = await getBoards();
    boards = data.boards;
  } catch {
    // 板块还没生成出来也允许发帖(用一个通用板块)
  }

  mount.innerHTML = renderShell(boards, preBoard);

  const boardSelect = document.getElementById('np-board');
  const titleInput = document.getElementById('np-title');
  const contentInput = document.getElementById('np-content');
  const submitBtn = document.getElementById('np-submit');

  function validate() {
    const ok = boardSelect.value && titleInput.value.trim() && contentInput.value.trim();
    submitBtn.disabled = !ok;
  }
  [boardSelect, titleInput, contentInput].forEach((el) => el.addEventListener('input', validate));

  submitBtn.addEventListener('click', () => {
    const boardId = boardSelect.value;
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    if (!boardId || !title || !content) return;

    const boardName = boards.find((b) => b.id === boardId)?.name || boardId;
    const detail = createUserPost(boardId, boardName, title, content);
    ui.toast('发帖成功!', 'success');
    location.hash = ui.topicLink(detail.id, {
      title: detail.title,
      boardId: detail.boardId,
      boardName: detail.boardName,
      author: detail.author,
      replies: detail.replies,
    });
  });

  validate();
  titleInput.focus();
}

function renderShell(boards, preBoard) {
  const options = boards.length
    ? boards
        .map(
          (b) =>
            `<option value="${ui.escapeHtml(b.id)}" ${b.id === preBoard ? 'selected' : ''}>${ui.escapeHtml(b.icon || '')} ${ui.escapeHtml(b.name)}</option>`
        )
        .join('')
    : `<option value="general">💬 综合讨论</option>`;

  return `
    <div class="card section newpost-card">
      <div class="section-head"><h2>✍️ 发新帖</h2></div>

      <div class="reg-field">
        <label for="np-board">选择板块</label>
        <select id="np-board" class="np-select">
          <option value="">— 请选择板块 —</option>
          ${options}
        </select>
      </div>

      <div class="reg-field">
        <label for="np-title">标题</label>
        <input type="text" id="np-title" maxlength="60" placeholder="一句话说清你想聊的" autocomplete="off" />
      </div>

      <div class="reg-field">
        <label for="np-content">正文</label>
        <textarea id="np-content" class="np-content" rows="8" placeholder="展开说说…(空行分段)"></textarea>
      </div>

      <button id="np-submit" class="btn btn-primary btn-block" disabled>发布</button>
      <p class="reg-note">发帖前请确认内容符合社区规范,发布后即公开可见。</p>
    </div>`;
}
