// store.js —— 整个论坛一致性的核心
//
// 关键原则:任何内容由 LLM 生成后,完整内容立刻存入 localStorage,
// 之后永远读缓存,绝不再调 LLM。同一个 key 第二次访问必然返回相同内容。
//
// 所有缓存读写都过这个模块,以保证"不会出戏"。

const PREFIX = 'vf_'; // vibe-forum 命名空间前缀,避免污染

// ---- 底层读写 ----
function read(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    // localStorage 满了或被禁用:降级为内存(本会话内仍一致,刷新后失效)
    console.warn('[vibe-forum] localStorage 写入失败,降级到内存缓存', e);
    memFallback[key] = value;
  }
}

const memFallback = {};

// ---- 统一入口:有缓存直接返回,无则生成并缓存 ----
// generator 是一个返回 Promise 的异步函数,只在未命中时调用。
// 注意:对同一个 key 并发的多次请求,这里不去做重;但本应用是用户点击驱动的,
// 实践中不会对同一个未命中的 key 并发触发,故够用。
async function getOrGenerate(key, generator) {
  const cached = read(key);
  if (cached !== null) return cached;

  const generated = await generator();
  if (generated !== null && generated !== undefined) {
    write(key, generated);
  }
  return generated;
}

// 同步读(只用于已知一定存在的缓存,如 user/boards)
function get(key) {
  return read(key);
}

// 写(覆盖)
function set(key, value) {
  write(key, value);
}

function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {}
  delete memFallback[key];
}

// ---- 命名空间 key 构造器 ----
// 集中在这里,避免散落各处拼字符串拼错
// 注意:topic 的缓存 key 包含 title,因为 id 在系统中不保证全局唯一
// (LLM/不同列表可能产出重复 id)。用 (id, title) 双键,既保证"同一帖子二次
// 访问内容一致",又避免不同内容因 id 碰撞而串台。
function titleSlug(title) {
  // 把标题压成短 slug 作为 key 的一部分,保留可读性
  return String(title || '').slice(0, 40).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
}
const keys = {
  user: () => 'user',
  boards: () => 'boards',
  hotPage: (n) => `hot:p${n}`,
  forumPage: (boardId, n) => `forum:${boardId}:p${n}`,
  // topic key 必须同时含 id 和 title,防止 id 碰撞串台
  topic: (id, title) => `topic:${id}:${titleSlug(title)}`,
  topicRepliesPage: (id, title, n) => `topic:${id}:${titleSlug(title)}:replies:p${n}`,
  search: (q) => `search:${q}`,
};

// ---- 业务辅助 ----

function getUser() {
  return get(keys.user());
}

function setUser(user) {
  set(keys.user(), user);
}

function isLoggedIn() {
  return getUser() !== null;
}

// 用户发帖 / 回复时生成稳定的 ID(基于时间戳,因为真发帖需要持久)
function newUserTopicId() {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 重置整个论坛(清空所有缓存)
function resetAll() {
  try {
    const toDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) toDelete.push(k);
    }
    toDelete.forEach((k) => localStorage.removeItem(k));
  } catch {}
  Object.keys(memFallback).forEach((k) => delete memFallback[k]);
}

// 把一条新帖子插入某板块第 1 页列表的顶部(用于用户发帖)
function prependTopicToForum(boardId, topicListItem) {
  const k = keys.forumPage(boardId, 1);
  const existing = get(k);
  if (existing && Array.isArray(existing.topics)) {
    existing.topics.unshift(topicListItem);
    set(k, existing);
  }
}

// 把一条新帖子加入首页热帖顶部(让它更显眼)
function prependTopicToHot(topicListItem) {
  const k = keys.hotPage(1);
  const existing = get(k);
  if (existing && Array.isArray(existing.topics)) {
    existing.topics.unshift(topicListItem);
    set(k, existing);
  }
}

export const store = {
  getOrGenerate,
  get,
  set,
  remove,
  keys,
  getUser,
  setUser,
  isLoggedIn,
  newUserTopicId,
  resetAll,
  prependTopicToForum,
  prependTopicToHot,
};
