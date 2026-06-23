// 端到端集成测试:在 Node 里模拟浏览器环境,跑完整 content 流程
// 目标:验证缓存一致性、fallback 降级、发帖、回复等核心逻辑

// ---- mock 全局环境 ----
const memStore = {};
globalThis.localStorage = {
  getItem: (k) => (k in memStore ? memStore[k] : null),
  setItem: (k, v) => { memStore[k] = String(v); },
  removeItem: (k) => { delete memStore[k]; },
  get length() { return Object.keys(memStore).length; },
  key: (i) => Object.keys(memStore)[i] || null,
};
// mock fetch:直接失败,触发 fallback
globalThis.fetch = async () => {
  const e = new Error('mock: no network in test');
  throw e;
};
globalThis.window = { scrollTo() {} };
globalThis.location = { hash: '' };

// ---- 加载被测模块 ----
const { store } = await import('../src/store.js');
const content = await import('../src/content.js');
const fb = await import('../src/fallback.js');

// 模拟已注册用户
store.setUser({ name: '测试用户', theme: '编程 / 技术', createdAt: Date.now() });

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS', msg); }
  else { fail++; console.log('  FAIL', msg); }
}
// 深相等(缓存一致性验证:内容相等即可,不必引用相等)
function deepEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

console.log('\n=== 1. 板块生成(fallback) ===');
const { boards } = await content.getBoards();
assert(boards.length >= 4, `生成 ${boards.length} 个板块(≥4)`);
assert(boards.every((b) => b.id && b.name), '每个板块有 id 和 name');
// 一致性:再次获取应返回内容相同(命中缓存)
const { boards: boards2 } = await content.getBoards();
assert(deepEq(boards, boards2), '二次获取命中缓存(内容一致)');

console.log('\n=== 2. 板块 id 查询 ===');
const board0 = await content.getBoardById(boards[0].id);
assert(board0.id === boards[0].id, '能查到存在的板块');
const boardX = await content.getBoardById('not_exist');
assert(boardX.id === 'not_exist', '不存在板块返回兜底构造');

console.log('\n=== 3. 热帖 ===');
const { topics: hot } = await content.getHotPage(1);
assert(hot.length === 6, `生成 ${hot.length} 条热帖(=6)`);
assert(hot.every((t) => t.id && t.title && t.author), '每条热帖字段完整');
const { topics: hot2 } = await content.getHotPage(1);
assert(deepEq(hot, hot2), '热帖二次获取命中缓存');

console.log('\n=== 4. 板块帖子列表 + 分页一致性 ===');
const { topics: f1 } = await content.getForumPage(boards[0].id, 1);
const { topics: f1b } = await content.getForumPage(boards[0].id, 1);
assert(deepEq(f1, f1b), '板块第1页二次获取命中缓存');
assert(f1.length === 12, `第1页 ${f1.length} 条(=12)`);
const { topics: f2 } = await content.getForumPage(boards[0].id, 2);
assert(f1[0].id !== f2[0].id, '第1页和第2页内容不同');

console.log('\n=== 5. 帖子详情 + 列表→详情一致性 ===');
const t0 = f1[0];
const detail = await content.getTopicDetail(t0.id, t0);
assert(detail.title === t0.title, '详情标题与列表一致(不出戏)');
assert(detail.author === t0.author, '详情作者与列表一致');
assert(detail.content && detail.content.length > 10, '详情正文非空');
const detail2 = await content.getTopicDetail(t0.id, t0);
assert(deepEq(detail, detail2), '详情二次获取命中缓存');

console.log('\n=== 5b. 回归:id 碰撞不串台(同 id 不同 title 应是不同内容) ===');
// 模拟 bug 场景:同一个 id,但带一个完全不同的标题,
// 不应返回上面 t0 的缓存内容(否则就是串台 bug 复发)
const fakeMeta = { ...t0, title: '一个完全不同的独特标题_测试不串台', boardId: 'general', boardName: '综合' };
const detailB = await content.getTopicDetail(t0.id, fakeMeta);
assert(detailB.title === fakeMeta.title, '同id不同title:详情标题用新title(不串台)');
assert(detailB.title !== t0.title, '同id不同title:标题确实不同');
assert(detailB.content !== detail.content, '同id不同title:正文是新生成的(非旧缓存)');
// 二次访问同 title 仍命中自己的缓存
const detailB2 = await content.getTopicDetail(t0.id, fakeMeta);
assert(deepEq(detailB, detailB2), '同id同title二次获取命中缓存');
// 原始 t0 的缓存未被污染
const detailAgain = await content.getTopicDetail(t0.id, t0);
assert(deepEq(detail, detailAgain), '原帖缓存未被串台污染');

console.log('\n=== 6. 回复楼层 ===');
const { replies } = await content.getTopicRepliesPage(t0.id, 1, t0);
assert(replies.length === 10, `生成 ${replies.length} 条回复(=10)`);
assert(replies[0].floor === 2, `第1条回复是2楼(=${replies[0].floor})`);
assert(replies[9].floor === 11, `第10条回复是11楼(=${replies[9].floor})`);
const { replies: r2 } = await content.getTopicRepliesPage(t0.id, 2, t0);
assert(r2[0].floor === 12, '第2页第1条是12楼');

console.log('\n=== 6b. 回归:翻页 meta 不全时仍与第1页同缓存域 ===');
// 模拟翻页场景:第2页的 meta 只带 title(像分页链接传过来的精简 meta),
// 必须和上面用完整 t0 查到的第2页是同一份内容(楼层连续、不重新生成)
const page2Meta = { title: t0.title }; // 只有 title
const { replies: r2b } = await content.getTopicRepliesPage(t0.id, 2, page2Meta);
assert(deepEq(r2, r2b), '翻页用精简meta仍命中同一缓存(楼层连续不串台)');
// 第1页二次访问也不变
const { replies: r1again } = await content.getTopicRepliesPage(t0.id, 1, page2Meta);
assert(deepEq(replies, r1again), '第1页用精简meta二次访问仍一致');

console.log('\n=== 7. 搜索 ===');
const { results } = await content.getSearch('测试关键词');
assert(results.length === 8, `搜索结果 ${results.length} 条(=8)`);
assert(results.every((r) => r.title.includes('测试关键词')), '结果标题包含关键词');
const { results: res2 } = await content.getSearch('测试关键词');
assert(deepEq(results, res2), '搜索二次获取命中缓存');

console.log('\n=== 8. 用户发帖 ===');
const beforeHotCount = (await content.getHotPage(1)).topics.length;
const newPost = content.createUserPost(boards[0].id, boards[0].name, '我的测试新帖', '这是正文第一段。\n\n这是第二段。');
assert(newPost.id.startsWith('user_'), `新帖 id 以 user_ 开头`);
assert(newPost.isUserPost === true, '标记为用户帖');
assert(newPost.author === '测试用户', '楼主是当前用户');
// 新帖应出现在板块第1页顶部
const { topics: f1After } = await content.getForumPage(boards[0].id, 1);
assert(f1After[0].id === newPost.id, '新帖出现在板块第1页顶部');
// 新帖应出现在热帖顶部
const { topics: hotAfter } = await content.getHotPage(1);
assert(hotAfter[0].id === newPost.id, '新帖出现在热帖顶部');
// 新帖详情可读
const npDetail = await content.getTopicDetail(newPost.id, newPost);
assert(npDetail.content.includes('这是正文第一段'), '用户帖详情正文正确');

console.log('\n=== 8b. 回归:用户帖 replies=0 不生成 AI 回复 ===');
// 用一个全新的用户帖(replies=0)验证:即使生成回复页,也不该有 AI 回复
// (newPost.replies===0,且它的回复 key 未被生成过)
// 直接验证:newPost 不应该有任何"凭空出现"的回复
// 这里通过检查 content 层不会为 replies=0 的用户帖生成回复来确认
// (loadReplies 的早返回在 topic.js,此处验证数据层:newPost 的 replies 仍为 0)
assert(npDetail.replies === 0, '新发的用户帖回复数为 0(未凭空生成 AI 回复)');

console.log('\n=== 8c. 回归:回复不与楼主同名 + 不重复 + 时间不早于发帖(直接测 fallback) ===');
// 直接测 fallback 函数,避免被旧缓存干扰
const fbBoard = { id: 'qa', name: '求助问答', desc: '', icon: '❓' };
const fbOp = '我是楼主';
const fbOpCreated = '8 小时前';
const { replies: fbReplies } = fb.fallbackReplies('编程', fbBoard, '测试标题', 1, fbOp, fbOpCreated);
assert(fbReplies.every((r) => r.author !== fbOp), '回复中没有和楼主同名的');
const fbNames = fbReplies.map((r) => r.author);
assert(new Set(fbNames).size === fbNames.length, '同一页回复用户名不重复');
// 时间不倒挂:回复时间都应晚于(≤)发帖的 8 小时前
function hoursAgo(text) {
  if (!text) return null;
  if (/刚刚|刚才/.test(text)) return 0;
  const m = text.match(/(\d+)\s*(分钟|小时|天|周)/);
  if (!m) return /昨天/.test(text) ? 24 : null;
  const n = parseInt(m[1], 10);
  const u = m[2];
  return u === '分钟' ? n / 60 : u === '小时' ? n : u === '天' ? n * 24 : n * 24 * 7;
}
const opH = hoursAgo(fbOpCreated);
const badTime = fbReplies.find((r) => {
  const rh = hoursAgo(r.created);
  return rh != null && rh > opH + 0.5;
});
assert(!badTime, `回复时间不早于发帖(发帖${fbOpCreated},所有回复应更新)`);

console.log('\n=== 9. 用户回复 ===');
content.appendUserReply(t0.id, '我来回复一下', t0);
const { replies: rAfter } = await content.getTopicRepliesPage(t0.id, 1, t0);
const lastReply = rAfter[rAfter.length - 1];
assert(lastReply.author === '测试用户', '新回复作者是当前用户');
assert(lastReply.content === '我来回复一下', '新回复内容正确');
assert(lastReply.isUserReply === true, '标记为用户回复');
// 帖子回复数应 +1
const detailAfter = await content.getTopicDetail(t0.id, t0);
assert(detailAfter.replies === (detail.replies + 1), `帖子回复数 +1 (${detail.replies}→${detailAfter.replies})`);

console.log('\n=== 9b. 回归:回复后用精简 meta 仍能读到回复(URL 丢 title 不串台) ===');
// 模拟回复提交后跳转的 URL 只带了 page(老 bug 场景):
// 回复是 appendUserReply 用 detail.title 写的,
// 之后即使 meta 只有 title(从详情重建)也能读到那条回复
const metaTitleOnly = { title: t0.title };
const { replies: rFromMeta } = await content.getTopicRepliesPage(t0.id, 1, metaTitleOnly);
const lastFromMeta = rFromMeta[rFromMeta.length - 1];
assert(lastFromMeta && lastFromMeta.content === '我来回复一下', '精简meta仍能读到刚发的回复(不串台)');
assert(deepEq(rFromMeta, rAfter), '精简meta与完整meta读到同一份回复');

console.log('\n=== 10. 重置 ===');
const idBefore = newPost.id;
store.resetAll();
assert(store.get(store.keys.topic(idBefore, '我的测试新帖')) === null, '重置后帖子缓存被清空');
assert(store.getUser() === null, '重置后用户信息被清空');

console.log(`\n========== ${pass} passed, ${fail} failed ==========`);
process.exit(fail > 0 ? 1 : 0);
