// fallback.js —— 本地兜底生成器(纯前端,无 LLM)
//
// 用途:当 /api/generate 不可用(未配 key、网络错误、额度耗尽)时,
// 用本地伪随机 + 模板生成"像论坛"的内容,保证应用不崩、可演示。
//
// 关键:这些内容质量不如 LLM,但能保证结构完整、不出戏(一旦生成即缓存)。
// 配合 content.js 的逻辑:LLM 优先,失败才走这里。

// ---- 基于种子的伪随机(保证同一输入同一输出)----
function seedFrom(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// ---- 词库(围绕主题,生成像样的中文论坛内容)----
const USER_NAMES = [
  '熬夜的猫', '老王_3F', 'null_pointer', '麦田守望者07', '深夜搬砖工', '一只柴犬',
  '代码搬运工', 'CtrlCV工程师', '吃瓜群众甲', '摸鱼大师', '理性分析姬', '键盘侠本侠',
  '夏天的风', '路过的咸鱼', '第三视角', '不知道叫啥', '今天也要加油', '梧桐雨',
  'debug到天明', '一杯拿铁', '隔壁老张', '007号选手', '匿名用户', '潜水三年',
  '破防了老铁', '理性吃瓜', '深夜emo', '技术宅小明', '路飞迷弟', '佛系青年',
];
const TITLES_TECH = [
  '有人遇到过这个 bug 吗?折腾一晚上了', '求推荐一个好用的 xxx', '今天面试被问到了这个问题',
  '分享一个我踩过的巨坑', '关于 xxx 的性能优化,我做了点实验', '为什么 xxx 这么慢?',
  '入职三个月,说点真实的感受', '这行到底还能干几年?', '看到个有趣的开源项目',
  '我是怎么从零学到能干活的', '深夜吐槽一下甲方', '大佬们这个怎么选?',
];
const TITLES_LIFE = [
  '今天遇到一件无语的事', '有没有人和我一样', '求推荐周末好去处', '最近迷上了 xxx',
  '失眠了,随便聊聊', '这天气绝了', '一个关于 xxx 的小问题', '晒晒我最近的 xxx',
  '有没有同好,组个队?', '吐槽一下我室友', '记录一下我的 xxx 之路', '大家平时都怎么 xxx?',
];
const TITLE_PREFIXES = ['【求助】', '【分享】', '【吐槽】', '【讨论】', '【安利】', '【打听】', ''];
const SNIPPETS = [
  '如题,最近在研究这个,感觉有不少坑,想听听大家的经验。',
  '我先说我的情况,然后想问问大家的看法。',
  '这个问题困扰我好几天了,网上查了一圈没找到靠谱答案。',
  '说个真事,昨天遇到一个特别离谱的情况。',
  '纯分享,不喜勿喷。我觉得这个方案还挺有意思的。',
  '看了很多帖子,还是没拿定主意,来问问老哥们。',
  '新手求轻喷,可能问题比较基础。',
  '讨论一下,没有标准答案,想看看不同视角。',
  '我先抛个砖,等大佬们来引玉。',
  '不是钓鱼,真实疑问,求理性讨论。',
];
const PARAGRAPHS = [
  '事情是这样的,{when}我在弄{what}的时候,突然发现{issue}。一开始我还以为是自己的问题,反复检查了好几遍,确认操作没毛病。',
  '后来我去搜了一下,发现遇到这个问题的人还不少,但大多数帖子要么没下文,要么给的方案根本不对症。所以我决定自己折腾一下。',
  '试了好几种办法,其中{attempt}那个稍微有点效果,但还是治标不治本。最后{solution},居然真的解决了。',
  '写这个帖子主要是想记录一下,顺便看看有没有更优雅的方案。如果有大佬路过,还请不吝赐教。',
  '另外吐槽一句,{complaint}。这点真的挺影响体验的,不知道后续会不会改进。',
  '以上只是个人经验,不一定普适,大家理性参考哈。',
  '补充一下,我用的环境是{env},不同版本可能有差异。',
  '先匿了,怕被认出来。其实就是想找个地方说说,憋在心里难受。',
  '没想到这么多人在关注,统一回复一下楼里问得比较多的几个问题。',
  '更新:又试了一下,{update},目前看是稳定的,继续观察。',
];
const WHATS = ['这个功能', '一段代码', '一个配置', '部署', '升级', '调试', '迁移', '重构'];
const ISSUES = ['直接报错了', '性能突然下降', '行为和文档不一致', '时灵时不灵', '日志啥也没打', '莫名其妙挂了'];
const ATTEMPTS = ['改配置', '重启', '清缓存', '降版本', '换网络', '加日志'];
const SOLUTIONS = ['把那个参数调了一下', '换个写法', '加了一层兜底', '换了个依赖', '关掉了某个选项'];
const COMPLAINTS = ['官方文档更新太慢', '报错信息一点用没有', '社区氛围越来越差', '版本之间改动太大不兼容'];
const ENVS = ['最新稳定版', '某个长期支持版', 'Mac 上', 'Windows 上', 'Linux 服务器上'];
const WHENS = ['前两天', '昨天凌晨', '刚才', '上周', '今天上午', '前几个小时'];
const UPDATES = ['稳定运行了一整天', '暂时没复现', '找到了根本原因', '提交了 issue'];
const REPLIES = [
  '同求,蹲一个答案。',
  '我也遇到过,最后是这么解决的:{sol}',
  '帮顶,希望有大佬来解答。',
  '感觉你这个描述不太清楚,能再具体点吗?',
  '哈哈哈这也太真实了。',
  '利益相关,匿了。说实话这事吧,我觉得…',
  '别折腾了,直接换 xxx 吧,省心。',
  '楼主好人,谢谢分享!',
  '我有个疑问,{q}',
  '反对楼上的观点,我的经验恰恰相反。',
  '已经解决了,感谢各位!',
  '马住,回头慢慢看。',
  '这题我会,简单说两句:{ans}',
  '笑死,楼主太会了。',
  '补充一个冷知识:{fact}',
  '别激动,理性讨论。',
];
const REPLYQS = ['你说的 xxx 具体指什么?', '这个方案有没有副作用?', '成本高吗?', '能详细说说吗?'];
const REPLYANS = ['其实就是{sol}', '原理不复杂,关键是{key}', '可以参考官方文档第几节', '我一般这么处理'];
const REPLYFACTS = ['其实这个问题在十年前就有人提过', '某大厂内部有专门的工具处理这个', '这个名词最早出现在某篇论文里'];
const REPLYKEYS = ['先理清需求', '分而治之', '别过早优化', '先把测试写好'];

const AVATARS = ['🐱', '🦊', '🐼', '🐧', '🦉', '🐹', '🐯', '🐸', '🦝', '🐨', '🐵', '🦄', '🐙', '🐳', '🦁', '🐰', '🐲', '🦖', '🐠', '🦋'];

function avatarFor(rng) {
  return pick(rng, AVATARS);
}
function userFor(rng) {
  return pick(rng, USER_NAMES);
}
function fillTemplate(tpl, rng) {
  return tpl
    .replace(/\{when\}/g, () => pick(rng, WHENS))
    .replace(/\{what\}/g, () => pick(rng, WHATS))
    .replace(/\{issue\}/g, () => pick(rng, ISSUES))
    .replace(/\{attempt\}/g, () => pick(rng, ATTEMPTS))
    .replace(/\{solution\}/g, () => pick(rng, SOLUTIONS))
    .replace(/\{complaint\}/g, () => pick(rng, COMPLAINTS))
    .replace(/\{env\}/g, () => pick(rng, ENVS))
    .replace(/\{update\}/g, () => pick(rng, UPDATES))
    .replace(/\{sol\}/g, () => pick(rng, SOLUTIONS))
    .replace(/\{q\}/g, () => pick(rng, REPLYQS))
    .replace(/\{ans\}/g, () => pick(rng, REPLYANS))
    .replace(/\{fact\}/g, () => pick(rng, REPLYFACTS))
    .replace(/\{key\}/g, () => pick(rng, REPLYKEYS));
}
function relTime(rng) {
  const opts = ['刚刚', '1 分钟前', '5 分钟前', '12 分钟前', '半小时前', '1 小时前', '2 小时前', '3 小时前', '5 小时前', '8 小时前', '昨天', '昨天', '2 天前', '3 天前', '5 天前', '上周', '2 周前'];
  return pick(rng, opts);
}

function titleFor(rng, theme) {
  const isTechish = /技|编程|码|it|dev|程序|tech/i.test(theme || '');
  const pool = isTechish ? TITLES_TECH : TITLES_LIFE;
  return pick(rng, TITLE_PREFIXES) + pick(rng, pool).replace(/xxx/g, () => pick(rng, WHATS));
}

// ---- 板块 ----
export function fallbackBoards(theme) {
  const rng = mulberry32(seedFrom('boards:' + theme));
  const isTechish = /技|编程|码|it|dev|程序|tech/i.test(theme || '');
  const presets = isTechish
    ? [
        { id: 'tech', name: '技术杂谈', desc: '聊技术、踩坑、折腾', icon: '💻' },
        { id: 'qa', name: '求助问答', desc: '有问题来这里问', icon: '❓' },
        { id: 'career', name: '职场生涯', desc: '工作、面试、跳槽', icon: '💼' },
        { id: 'share', name: '资源分享', desc: '好东西一起用', icon: '🎁' },
        { id: 'chat', name: '灌水闲聊', desc: '想聊啥聊啥', icon: '☕' },
      ]
    : [
        { id: 'hot', name: '热门讨论', desc: '大家都在聊', icon: '🔥' },
        { id: 'share', name: '分享安利', desc: '好物好剧好去处', icon: '✨' },
        { id: 'qa', name: '求助打听', desc: '不知道就问', icon: '❓' },
        { id: 'chat', name: '闲聊灌水', desc: '随便聊聊', icon: '💬' },
        { id: 'story', name: '故事经历', desc: '说点真事', icon: '📖' },
      ];
  return {
    boards: presets.map((b) => ({ ...b, todayPosts: randInt(rng, 5, 80) })),
  };
}

// ---- 热帖 ----
export function fallbackHot(theme, boards) {
  const rng = mulberry32(seedFrom('hot:' + theme));
  const topics = [];
  for (let i = 0; i < 6; i++) {
    const board = pick(rng, boards);
    topics.push({
      id: `gen_${seedFrom(theme + i).toString(36).slice(0, 6)}`,
      title: titleFor(rng, theme),
      boardId: board.id,
      boardName: board.name,
      author: userFor(rng),
      replies: randInt(rng, 20, 480),
      lastReply: relTime(rng),
    });
  }
  return { topics };
}

// ---- 板块某页帖子 ----
export function fallbackForumPage(theme, board, page) {
  const rng = mulberry32(seedFrom(`forum:${board.id}:p${page}:${theme}`));
  const count = 12;
  const topics = [];
  for (let i = 0; i < count; i++) {
    const pinned = page === 1 && i < 2;
    topics.push({
      id: `gen_${seedFrom(`${board.id}:${page}:${i}`).toString(36).slice(0, 6)}`,
      title: titleFor(rng, theme),
      author: userFor(rng),
      replies: randInt(rng, 0, 320),
      views: randInt(rng, 50, 5000),
      lastReply: relTime(rng),
      pinned,
    });
  }
  return { topics };
}

// ---- 帖子详情 ----
export function fallbackTopicDetail(theme, board, titleHint) {
  const rng = mulberry32(seedFrom(`topic:${board.id}:${titleHint}:${theme}`));
  const paraCount = randInt(rng, 2, 4);
  const content = [];
  const pool = [...PARAGRAPHS];
  for (let i = 0; i < paraCount; i++) {
    const tpl = pool.splice(Math.floor(rng() * pool.length), 1)[0] || pick(rng, PARAGRAPHS);
    content.push(fillTemplate(tpl, rng));
  }
  return {
    title: titleHint,
    author: userFor(rng),
    avatar: avatarFor(rng),
    created: relTime(rng),
    boardId: board.id,
    boardName: board.name,
    content: content.join('\n\n'),
  };
}

// ---- 帖子回复 ----
export function fallbackReplies(theme, board, titleHint, page) {
  const rng = mulberry32(seedFrom(`replies:${board.id}:${titleHint}:p${page}:${theme}`));
  const count = 10;
  const replies = [];
  for (let i = 0; i < count; i++) {
    const tpl = pick(rng, REPLIES);
    replies.push({
      author: userFor(rng),
      avatar: avatarFor(rng),
      content: fillTemplate(tpl, rng),
      created: relTime(rng),
    });
  }
  return { replies };
}

// ---- 搜索 ----
export function fallbackSearch(theme, query) {
  const rng = mulberry32(seedFrom(`search:${query}:${theme}`));
  const count = 8;
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push({
      id: `gen_${seedFrom(`search:${query}:${i}`).toString(36).slice(0, 6)}`,
      title: `${pick(rng, TITLE_PREFIXES)}关于「${query}」的${pick(rng, ['讨论', '分享', '求助', '吐槽'])}`,
      boardId: pick(rng, ['tech', 'chat', 'share', 'qa']),
      boardName: pick(rng, ['综合讨论', '技术杂谈', '资源分享', '求助问答']),
      author: userFor(rng),
      replies: randInt(rng, 5, 200),
      snippet: `这个帖子讨论了 ${query} 相关的话题。${fillTemplate(pick(rng, SNIPPETS), rng)}`,
    });
  }
  return { results, query };
}
