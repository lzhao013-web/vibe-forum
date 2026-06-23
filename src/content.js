// content.js —— 内容生成编排层
//
// 把 store(缓存)+ llm(调用)+ prompts(prompt)+ fallback(本地兜底)串起来。
// 每个函数:先查缓存,未命中则【LLM 优先】生成 → 校验 → 存缓存 → 返回。
// LLM 失败时:用本地 fallback 兜底(同样存缓存,保证不出戏、可演示)。
// 一旦某 key 生成过(无论 LLM 还是 fallback),后续永远读缓存。

import { store } from './store.js';
import { llm } from './llm.js';
import { prompts } from './prompts.js';
import * as fb from './fallback.js';

// ---- schema 校验辅助 ----
function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}
function str(v, fallback = '') {
  return typeof v === 'string' ? v : fallback;
}
function num(v, fallback = 0) {
  return Number.isFinite(Number(v)) ? Number(v) : fallback;
}
function arr(v) {
  return Array.isArray(v) ? v : [];
}
function pick(obj, fields, fallbacks = {}) {
  const out = {};
  const strFields = new Set(['id', 'name', 'title', 'author', 'desc', 'content', 'created', 'lastReply', 'snippet', 'boardId', 'boardName', 'avatar', 'icon']);
  for (const f of fields) {
    if (strFields.has(f)) {
      out[f] = str(obj[f], fallbacks[f] ?? '');
    } else if (f === 'pinned') {
      out[f] = !!obj[f];
    } else {
      out[f] = num(obj[f], fallbacks[f] ?? 0);
    }
  }
  return out;
}

function sanitizeId(id) {
  let s = String(id).trim();
  if (!s.startsWith('gen_') && !s.startsWith('user_')) {
    s = 'gen_' + s;
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, '');
}

// 头像 hash(与 ui.userAvatar 一致)
const AVATARS = ['🐱', '🦊', '🐼', '🐧', '🦉', '🐹', '🐯', '🐸', '🦝', '🐨', '🐵', '🦄', '🐙', '🐳', '🦁', '🐰'];
function hashAvatar(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

// 统一的 LLM 调用 + 校验:成功返回校验后的数据,失败返回 { __fallback: true }
// normalize:把 LLM 原始返回转成标准结构;至少返回非空数组/对象才算成功。
async function tryLLM(buildPrompt, normalize, label) {
  try {
    const user = store.getUser();
    const data = await llm.chatJson(buildPrompt(user), { temperature: 1.0 });
    const result = normalize(data);
    if (!result) throw new Error(`${label} 校验失败`);
    return result;
  } catch (e) {
    console.warn(`[vibe-forum] 在线获取「${label}」失败,已启用本地缓存模式:`, e.message);
    return { __fallback: true, error: e.message };
  }
}

// ============ 板块列表 ============
export async function getBoards() {
  return store.getOrGenerate(store.keys.boards(), async () => {
    const user = store.getUser();
    const r = await tryLLM(
      (u) => prompts.boards(u.theme),
      (data) => {
        const boards = arr(data.boards)
          .filter(isObj)
          .map((b) => pick(b, ['id', 'name', 'desc', 'icon', 'todayPosts'], { icon: '📌' }))
          .filter((b, i, self) => b.id && self.findIndex((x) => x.id === b.id) === i)
          .map((b) => ({ ...b, id: b.id.replace(/[^a-zA-Z0-9_-]/g, '') }))
          .filter((b) => b.id);
        return boards.length ? { boards } : null;
      },
      '板块'
    );
    if (r.__fallback) return fb.fallbackBoards(user.theme);
    return r;
  });
}

export async function getBoardById(boardId) {
  const { boards } = await getBoards();
  return boards.find((x) => x.id === boardId) ||
    { id: boardId, name: boardId, desc: '讨论区', icon: '📌', todayPosts: 0 };
}

// ============ 热帖 ============
export async function getHotPage(page) {
  return store.getOrGenerate(store.keys.hotPage(page), async () => {
    const user = store.getUser();
    const { boards } = await getBoards();
    const r = await tryLLM(
      (u) => prompts.hotTopics(u.theme, boards),
      (data) => {
        const topics = arr(data.topics)
          .filter(isObj)
          .map((t) => pick(t, ['id', 'title', 'boardId', 'boardName', 'author', 'replies', 'lastReply'], { replies: 0 }))
          .filter((t) => t.id && t.title)
          .map((t) => ({ ...t, id: sanitizeId(t.id) }));
        return topics.length ? { topics } : null;
      },
      '热帖'
    );
    if (r.__fallback) return fb.fallbackHot(user.theme, boards);
    return r;
  });
}

// ============ 板块帖子列表 ============
export async function getForumPage(boardId, page) {
  return store.getOrGenerate(store.keys.forumPage(boardId, page), async () => {
    const user = store.getUser();
    const board = await getBoardById(boardId);
    const r = await tryLLM(
      (u) => prompts.forumPage(u.theme, board, page),
      (data) => {
        const topics = arr(data.topics)
          .filter(isObj)
          .map((t) => pick(t, ['id', 'title', 'author', 'replies', 'views', 'lastReply', 'pinned'], { replies: 0, views: 0 }))
          .filter((t) => t.id && t.title)
          .map((t) => ({ ...t, id: sanitizeId(t.id), boardId }));
        return topics.length ? { topics } : null;
      },
      '板块帖子'
    );
    if (r.__fallback) return fb.fallbackForumPage(user.theme, board, page);
    return r;
  });
}

// ============ 帖子详情 ============
export async function getTopicDetail(topicId, topicMeta) {
  const title = topicMeta?.title;
  return store.getOrGenerate(store.keys.topic(topicId, title), async () => {
    if (topicId.startsWith('user_')) {
      const existing = store.get(store.keys.topic(topicId, title));
      if (existing) return existing;
    }
    const user = store.getUser();
    const board = await getBoardById(topicMeta?.boardId || 'general');
    const titleHint = topicMeta?.title || '一个有趣的讨论';
    const r = await tryLLM(
      (u) => prompts.topicDetail(u.theme, board, titleHint),
      (data) => {
        const detail = pick(data, ['title', 'author', 'avatar', 'created', 'boardId', 'boardName', 'content'], {
          title: titleHint,
          avatar: '🙂',
          created: '不久前',
          boardId: board.id,
          boardName: board.name,
          author: topicMeta?.author || '匿名',
        });
        if (!detail.content) return null;
        // 【一致性】列表传来的 title / author / boardName 是权威的,必须覆盖 LLM 的,
        // 否则列表→详情标题不一致会"出戏"。LLM 只负责生成正文。
        if (topicMeta?.title) detail.title = topicMeta.title;
        if (topicMeta?.author) detail.author = topicMeta.author;
        if (topicMeta?.boardName) detail.boardName = topicMeta.boardName;
        detail.id = topicId;
        detail.replies = topicMeta?.replies ?? num(data.replies, randReplies());
        detail.isUserPost = false;
        return detail;
      },
      '帖子详情'
    );
    if (r.__fallback) {
      const d = fb.fallbackTopicDetail(user.theme, board, titleHint);
      d.id = topicId;
      d.replies = topicMeta?.replies ?? randReplies();
      d.isUserPost = false;
      // 一致性:同样用列表的权威字段覆盖
      if (topicMeta?.title) d.title = topicMeta.title;
      if (topicMeta?.author) d.author = topicMeta.author;
      if (topicMeta?.boardName) d.boardName = topicMeta.boardName;
      return d;
    }
    return r;
  });
}

// ============ 帖子回复 ============
const REPLIES_PER_PAGE = 10;
export async function getTopicRepliesPage(topicId, page, topicMeta) {
  return store.getOrGenerate(store.keys.topicRepliesPage(topicId, topicMeta?.title, page), async () => {
    const user = store.getUser();
    const board = await getBoardById(topicMeta?.boardId || 'general');
    const title = topicMeta?.title || '帖子';
    const floorStart = (page - 1) * REPLIES_PER_PAGE + 2;
    const r = await tryLLM(
      (u) => prompts.topicReplies(u.theme, board, title, page, floorStart, topicMeta?.author, topicMeta?.created),
      (data) => {
        const opAuthor = topicMeta?.author;
        const seen = new Set(opAuthor ? [opAuthor] : []);
        const replies = arr(data.replies)
          .filter(isObj)
          .map((rr) => pick(rr, ['author', 'avatar', 'content', 'created'], { avatar: '🙂', created: '不久前' }))
          .filter((rr) => rr.content)
          // 防御:排除和楼主同名的回复(楼主的回复是 1 楼)
          // 且页内用户名去重(同名只保留第一条)
          .filter((rr) => {
            if (seen.has(rr.author)) return false;
            seen.add(rr.author);
            return true;
          });
        if (!replies.length) return null;
        replies.forEach((rr, i) => {
          rr.floor = (page - 1) * REPLIES_PER_PAGE + i + 2;
        });
        return { replies, perPage: REPLIES_PER_PAGE };
      },
      '回复'
    );
    if (r.__fallback) {
      const { replies } = fb.fallbackReplies(user.theme, board, title, page, topicMeta?.author, topicMeta?.created);
      replies.forEach((rr, i) => {
        rr.floor = (page - 1) * REPLIES_PER_PAGE + i + 2;
      });
      return { replies, perPage: REPLIES_PER_PAGE };
    }
    return r;
  });
}

// ============ 搜索 ============
export async function getSearch(query) {
  const q = query.trim();
  if (!q) return { results: [] };
  return store.getOrGenerate(store.keys.search(q), async () => {
    const user = store.getUser();
    const r = await tryLLM(
      (u) => prompts.search(u.theme, q),
      (data) => {
        const results = arr(data.results)
          .filter(isObj)
          .map((s) => pick(s, ['id', 'title', 'boardId', 'boardName', 'author', 'replies', 'snippet'], { replies: 0 }))
          .filter((s) => s.id && s.title)
          .map((s) => ({ ...s, id: sanitizeId(s.id) }));
        return results.length ? { results, query: q } : null;
      },
      '搜索'
    );
    if (r.__fallback) return fb.fallbackSearch(user.theme, q);
    return r;
  });
}

// ============ 用户发帖(写缓存,不调 LLM) ============
export function createUserPost(boardId, boardName, title, content) {
  const user = store.getUser();
  const id = store.newUserTopicId();
  const detail = {
    id,
    title,
    author: user.name,
    avatar: hashAvatar(user.name),
    created: '刚刚',
    boardId,
    boardName,
    content,
    replies: 0,
    isUserPost: true,
    createdAtTs: Date.now(),
  };
  store.set(store.keys.topic(id, title), detail);
  const listItem = {
    id, title, author: user.name, replies: 0, views: 1,
    lastReply: '刚刚', pinned: false, boardId, boardName, isUserPost: true,
  };
  store.prependTopicToForum(boardId, listItem);
  store.prependTopicToHot(listItem);
  return detail;
}

// ============ 用户回复 ============
// topicMeta:{ title } 用于定位正确的缓存 key(与详情 key 一致)
export function appendUserReply(topicId, content, topicMeta) {
  const user = store.getUser();
  const title = topicMeta?.title;
  const page1 = store.get(store.keys.topicRepliesPage(topicId, title, 1));
  if (page1 && Array.isArray(page1.replies)) {
    const floor = page1.replies.length + 2;
    page1.replies.push({
      author: user.name, avatar: hashAvatar(user.name),
      content, created: '刚刚', floor, isUserReply: true,
    });
    store.set(store.keys.topicRepliesPage(topicId, title, 1), page1);
  } else {
    store.set(store.keys.topicRepliesPage(topicId, title, 1), {
      replies: [{ author: user.name, avatar: hashAvatar(user.name), content, created: '刚刚', floor: 2, isUserReply: true }],
      perPage: REPLIES_PER_PAGE,
    });
  }
  const detail = store.get(store.keys.topic(topicId, title));
  if (detail) {
    detail.replies = (detail.replies || 0) + 1;
    store.set(store.keys.topic(topicId, title), detail);
  }
}

// ---- 内部小工具 ----
function randReplies() {
  return Math.floor(Math.random() * 200) + 5;
}
