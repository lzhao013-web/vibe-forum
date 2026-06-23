# 💬 Vibe Forum

> 一个**没有固定内容**的论坛——你看到的每一条帖子、每一个板块、每一次回复,都是在你进入的那一刻由 AI 实时生成的。

这不是一个真实的社区。它是一个"无限生成式"的论坛体验:所有内容由 LLM 即时虚构,你看过的内容会保存在浏览器里,保证你不会"出戏"——同一个帖子,第二次点进去,还是第一次看到的样子。

## 特性

- 🎭 **全 AI 生成**:首页热帖、板块、帖子正文、回复楼层、搜索结果,全部由 LLM 实时虚构
- 🧠 **不会出戏**:所有你看过的内容写入浏览器 `localStorage`,同一页面二次访问内容完全一致(分页、楼层都稳定)
- 🎨 **按你的兴趣定制**:首次进入选一个主题(技术 / 游戏 / 动漫 / 生活…),整个论坛围绕它生成
- ✍️ **可以真的发帖**:你发的帖子和回复会被永久保存(在你浏览器里),出现在板块和热帖里
- 🛡️ **离线兜底**:即使没配 LLM Key,也会用本地生成器跑起一个能用的论坛(质量略低,但结构完整)
- ☁️ **Vercel 一键部署**:静态前端 + 一个 Serverless Function,零配置

## 技术栈

- 前端:原生 HTML / CSS / ES Module(无构建步骤)
- 后端:单个 Vercel Serverless Function(`/api/generate`),只负责隐藏 API Key + 代理 LLM
- LLM:任何 OpenAI 兼容的 `chat/completions` 接口(智谱 GLM / DeepSeek / OpenAI 等,可配置)
- 存储:浏览器 `localStorage`(无数据库,无服务端状态)

## 本地运行

### 1. 准备 LLM Key

复制 `.env.example` 为 `.env`,填入你的 API Key:

```bash
cp .env.example .env
```

```env
# 默认配置(智谱 GLM,glm-4-flash 有免费额度)
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_API_KEY=你的key
LLM_MODEL=glm-4-flash
```

> 不填 Key 也能跑——会自动降级到本地生成器,生成内容稍显模板化,但功能完整。

### 2. 启动开发服务器

```bash
npm start
# 或:node dev-server.mjs
```

打开 http://localhost:3000

> `dev-server.mjs` 是一个零依赖的 Node 服务器(服务静态文件 + 代理 `/api`)。
> 如果你装了 Vercel CLI,也可以用 `vercel dev`。

## 部署到 Vercel

1. 把项目推到 GitHub
2. 在 Vercel 导入该仓库
3. 在项目的 **Settings → Environment Variables** 里添加(和 `.env` 里一样):
   - `LLM_BASE_URL`
   - `LLM_API_KEY`
   - `LLM_MODEL`
4. Deploy

就这么简单。Vercel 会自动识别 `api/` 目录为 Serverless Functions,其余为静态资源。

## 项目结构

```
vibe-forum/
├── index.html              # 单页应用入口
├── vercel.json             # Vercel 路由配置
├── dev-server.mjs          # 本地开发服务器(零依赖)
├── .env.example            # 环境变量模板
├── api/
│   └── generate.js         # 唯一的 Serverless Function(代理 LLM)
├── src/
│   ├── app.js              # 入口 + 路由注册
│   ├── router.js           # hash 路由
│   ├── store.js            # localStorage 缓存层(一致性核心)
│   ├── llm.js              # LLM 调用封装
│   ├── prompts.js          # 各场景 prompt 构造
│   ├── content.js          # 内容编排(LLM 优先 + fallback + 缓存)
│   ├── fallback.js         # 离线兜底生成器
│   ├── ui.js               # 共享 UI 工具
│   └── pages/              # 各页面
│       ├── register.js     # 注册(昵称 + 选主题)
│       ├── home.js         # 首页(热帖 + 板块)
│       ├── forum.js        # 板块页(帖子列表 + 分页)
│       ├── topic.js        # 帖子页(楼主 + 回复楼层)
│       ├── search.js       # 搜索页
│       └── newpost.js      # 发帖页
├── styles/
│   └── main.css            # 全部样式(V2EX/Reddit 现代卡片风)
└── tests/                  # 测试
    ├── router.test.mjs     # 路由匹配
    └── e2e.test.mjs        # 端到端业务逻辑
```

## 核心设计:为什么"不会出戏"

整个体验的关键是一个原则:**任何内容一旦生成,就立刻完整存入 `localStorage`,之后永远读缓存,绝不再调用 LLM。**

`store.js` 的 `getOrGenerate(key, generator)` 是唯一入口:

- 第一次请求某内容(如"板块 tech 的第 2 页")→ 调 LLM 生成 → 存缓存 → 返回
- 之后任何时刻再请求同一内容 → 直接返回缓存,**值完全相同**

这意味着:你今天逛过的帖子,明天再点进去,标题、正文、回复楼层,一字不差。论坛对你来说是一个连贯的、真实的地方——尽管它最初是 AI 编的。

## 测试

```bash
npm test
```

包含路由匹配测试和端到端业务逻辑测试(缓存一致性、发帖、回复、降级等,共 44 项断言)。

## 隐私

- 你的昵称、选的主题、看过的所有内容,都**只存在你自己的浏览器**里
- 清除浏览器数据 / 点击右上角"重置"按钮 = 一切重来
- 服务端不保存任何用户数据,Serverless Function 也完全无状态

## 切换 LLM 提供商

改 `.env`(本地)或 Vercel 环境变量(线上)的三个值即可。常见的 OpenAI 兼容接口:

| 提供商 | LLM_BASE_URL | LLM_MODEL |
|--------|--------------|-----------|
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |

## License

MIT
