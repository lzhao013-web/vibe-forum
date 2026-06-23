// /api/generate —— 唯一的 Serverless Function
// 职责:隐藏 API Key,把前端构造好的 messages 透传到 OpenAI 兼容的 chat/completions 接口。
// 函数本身无状态:所有内容缓存都在浏览器 localStorage,这里只是个转发器。

export default async function handler(req, res) {
  // CORS(本地 dev 用 vercel dev 走同源,这里保留以备前端跨域场景)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const baseUrl = process.env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'glm-4-flash';

  if (!apiKey) {
    return res.status(500).json({
      error: 'Server missing LLM_API_KEY env var. Set it in .env (local) or Vercel project settings.'
    });
  }

  const {
    messages,
    json = false,
    temperature = 0.9,
    max_tokens = 2000,
  } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages is required and must be a non-empty array' });
  }

  const payload = {
    model,
    messages,
    temperature,
    max_tokens,
  };
  if (json) {
    // 让支持 OpenAI 风格 response_format 的接口返回 JSON
    payload.response_format = { type: 'json_object' };
  }

  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: 'Upstream returned non-JSON', raw: text.slice(0, 500) });
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'Upstream LLM error',
        detail: data,
      });
    }

    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to reach LLM', message: String(e) });
  }
}
