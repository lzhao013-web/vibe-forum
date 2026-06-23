// llm.js —— 调用 /api/generate 的封装
//
// 提供 chat(messages, opts) 和 chatJson(messages, opts) 两个函数。
// chatJson 会强制 LLM 返回 JSON 对象,解析失败时重试 1 次。
// 上游报错时抛出,由调用方决定如何降级(本应用:不污染缓存,显示友好提示)。

const ENDPOINT = '/api/generate';

async function callApi(body) {
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data?.error || data?.detail?.error?.message || `HTTP ${resp.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

// 从 OpenAI 兼容响应里取 content
function extractContent(data) {
  return (
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.message?.reasoning_content ?? // 某些接口
    ''
  );
}

async function chat(messages, opts = {}) {
  const data = await callApi({
    messages,
    json: false,
    temperature: opts.temperature ?? 0.9,
    max_tokens: opts.max_tokens ?? 2000,
  });
  return extractContent(data).trim();
}

// 返回解析后的 JSON 对象。失败重试 1 次(带"只输出JSON"的提醒)。
async function chatJson(messages, opts = {}) {
  const temperature = opts.temperature ?? 0.9;
  const max_tokens = opts.max_tokens ?? 2000;

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await callApi({
        messages,
        json: true,
        temperature,
        max_tokens,
      });
      const content = extractContent(data).trim();
      // 有些接口即使指定了 json_object 也会包代码块,容错处理
      const cleaned = content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      return JSON.parse(cleaned);
    } catch (e) {
      lastErr = e;
      // 第二次尝试:在末尾追加更强约束
      if (attempt === 0) {
        messages = [
          ...messages,
          { role: 'user', content: '请只输出合法的 JSON 对象,不要任何额外文字或代码块标记。' },
        ];
      }
    }
  }
  throw lastErr;
}

export const llm = { chat, chatJson };
