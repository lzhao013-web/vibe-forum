// prompts.js —— 各场景的 prompt 构造
//
// 所有 prompt 都注入用户主题(theme)作为"世界设定",保证调性统一。
// 所有输出都要求 JSON,字段在 SYSTEM_PROMPT 里统一说明。

const SYSTEM_PROMPT = `你正在为一个真实存在的中文论坛生成内容。这个论坛里有大量真实的网友在发帖、回复、讨论,你负责呈现其中的帖子、板块、用户发言。

核心规则:
1. 你输出的所有内容必须是合法的 JSON 对象(当被要求时),不要输出任何额外文字、解释或代码块标记。
2. 一切都要真实自然:用户名要像真人的网名,帖子标题和正文要像真人在论坛里的真实表达,有时间感、情绪、口语化、错别字、网络用语。
3. 内容要多样化:不同帖子有不同的语气、长度、话题角度,避免千篇一律。
4. 用户名风格多样:中英文、数字、符号混用,像真实的中文论坛 ID(如"熬夜的猫"、"老王_3F"、"null_pointer"、"麦田守望者07"、"今天也要加油")。
5. 时间用相对表达(如"3 小时前"、"昨天 14:23"、"2 分钟前"),避免绝对时间冲突。
6. 内容健康、友善,可以有小争论但不要攻击性或敏感内容。
7. 【最重要的规则】生成的所有内容必须看起来完全像真实网友的发言。绝对不能在任何地方出现以下字眼或暗示:AI、人工智能、机器人、模型、生成、自动、虚构、虚拟、扮演、你是谁、对不起我不能等。如果帖子里有人问"你是不是机器人/这是不是AI写的",回复要像真实网友那样(例如"???你在说什么""楼主没事吧""笑死")。
8. 不要给自己加戏,不要解释,不要输出任何元说明。直接给出论坛内容本身。`;

function themeLine(theme) {
  return `这个论坛的整体氛围和内容主题是:【${theme}】。所有板块、帖子、回复都应围绕这个主题展开,让用户感觉这是一个真实的、活跃的相关兴趣社区。`;
}

// ---- 生成板块(首页用) ----
// 输出: { boards: [{ id, name, desc, icon, todayPosts }] }
function boards(theme) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${themeLine(theme)}

请为这个论坛生成 5 个板块(讨论分区)。要求:
- 板块名简洁有力(2-6 字),紧扣主题,涵盖该主题下的主要讨论方向。
- 每个板块有 emoji 图标、一句话简介、今日帖数(随机的合理数字)。
- id 用英文小写短词,作为 URL 标识(如 "tech"、"chat")。

输出 JSON,格式:
{
  "boards": [
    { "id": "tech", "name": "技术杂谈", "desc": "聊技术和折腾", "icon": "💻", "todayPosts": 38 }
  ]
}`,
    },
  ];
}

// ---- 生成热帖(首页用) ----
// 输出: { topics: [{ id, title, boardId, boardName, author, replies, lastReply }] }
function hotTopics(theme, boardsList) {
  const boardHints = boardsList.map((b) => `${b.id}(${b.name})`).join('、');
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${themeLine(theme)}

这是论坛的板块列表: ${boardHints}

请生成 6 条"热门帖子"展示在首页。要求:
- 标题吸引人、像真实热帖(可带疑问、感叹、分享、吐槽等多种语气)。
- 帖子分散在不同板块,boardId 必须来自上面列出的板块 id。
- author 是虚拟用户名,replies 是回复数(几十到几百),lastReply 是相对时间。
- id 用 "gen_" 开头加简短随机串(如 "gen_8f3a")。

输出 JSON:
{
  "topics": [
    { "id": "gen_xxxx", "title": "...", "boardId": "tech", "boardName": "技术杂谈", "author": "...", "replies": 124, "lastReply": "3 小时前" }
  ]
}`,
    },
  ];
}

// ---- 生成某板块某页的帖子列表 ----
// 输出: { topics: [...], totalReplies 类似... }
// 同一 page 内容需稳定(由前端缓存保证)
function forumPage(theme, board, page) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${themeLine(theme)}

当前板块:【${board.name}】(简介:${board.desc})。
请生成该板块第 ${page} 页的帖子列表(每页 12 条)。

要求:
- 标题风格贴合该板块主题,多种语气(求助、分享、讨论、吐槽、安利、打听)。
- 第 1 页可包含 1-2 条"置顶"帖(在 title 前自然带 [置顶] 标记)。
- author 是虚拟用户名,replies 是回复数,views 是浏览数(通常 > replies)。
- lastReply 是相对时间,第 1 页的比第 2 页的更近(分页时间感连续)。
- id 用 "gen_" 开头。

输出 JSON:
{
  "topics": [
    { "id": "gen_xxxx", "title": "...", "author": "...", "replies": 23, "views": 412, "lastReply": "1 小时前", "pinned": false }
  ]
}`,
    },
  ];
}

// ---- 生成帖子详情(楼主帖) ----
// 输出: { title, author, authorAvatar(emoji), created, content(字符串或段落数组), boardName }
function topicDetail(theme, board, titleHint) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${themeLine(theme)}

请生成一个帖子的完整内容。这个帖子位于【${board.name}】板块,标题是: "${titleHint}"。

要求:
- author 是虚拟用户名,带一个 emoji 作为头像。
- created 是发帖相对时间(如"2 天前")。
- content 是正文,自然分段,像一个真人在论坛发的帖(可有背景、问题、观点、@某人 等),长度适中(150-400 字)。
- 语气符合标题和板块。

输出 JSON:
{
  "title": "...",
  "author": "...",
  "avatar": "🦊",
  "created": "2 天前",
  "boardId": "${board.id}",
  "boardName": "${board.name}",
  "content": "第一段...\\n\\n第二段..."
}`,
    },
  ];
}

// ---- 生成回复楼层(某帖某页) ----
// 输出: { replies: [{ author, avatar, content, created }] }
function topicReplies(theme, board, topicTitle, page, floorStart) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${themeLine(theme)}

帖子标题: "${topicTitle}",位于【${board.name}】板块。
这是该帖回复的第 ${page} 页(楼层从第 ${floorStart} 楼开始),请生成 10 条回复。

要求:
- 回复风格多样:有人赞同、有人反驳、有人补充、有人抖机灵、有人跑题、有人 @ 楼主。
- 不同楼层语气、长度都不同,部分回复可简短(一句话),少数较长。
- author 各不相同,都是虚拟用户名,带 emoji 头像。
- created 是相对时间,楼层越靠后时间越近(页内有序)。
- 不要回复"我是 AI"之类的破绽。

输出 JSON:
{
  "replies": [
    { "author": "...", "avatar": "🐱", "content": "...", "created": "5 小时前" }
  ]
}`,
    },
  ];
}

// ---- 搜索 ----
// 输出: { results: [{ id, title, boardId, boardName, author, replies, snippet }] }
function search(theme, query) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${themeLine(theme)}

用户在论坛搜索了: "${query}"。
请生成 8 条相关的帖子作为搜索结果。

要求:
- 每条标题和 snippet(内容摘要)都应与查询相关,看起来真是讨论这个话题的帖子。
- boardId/boardName 自拟(围绕主题的合理板块)。
- snippet 是 30-60 字的内容预览,要包含查询关键词的近义表达。
- id 用 "gen_" 开头。

输出 JSON:
{
  "results": [
    { "id": "gen_xxxx", "title": "...", "boardId": "...", "boardName": "...", "author": "...", "replies": 42, "snippet": "..." }
  ]
}`,
    },
  ];
}

export const prompts = {
  boards,
  hotTopics,
  forumPage,
  topicDetail,
  topicReplies,
  search,
};
