// router.js —— 极简 hash 路由
// 支持 #/、#/forum/<id>?page=n、#/topic/<id>?page=n、#/search?q=、#/newpost?board=

const routes = [];

// 把 "/forum/:id" 这种模式编译成 { regex, keys }
// 顺序很重要:先用占位符替换 :param,再转义元字符,最后把占位符还原成正则分组。
export function compilePattern(pattern) {
  const keys = [];
  pattern = pattern.replace(/\/+$/, '') || '/';
  // 占位符标记参数,记录顺序
  pattern = pattern.replace(/:(\w+)/g, (_, k) => {
    keys.push(k);
    return `\u0000${keys.length - 1}\u0000`;
  });
  // 转义正则元字符(/ 不需要转义)
  pattern = pattern.replace(/[\\^$.*+?()|[\]{}]/g, '\\$&');
  // 占位符还原成捕获组
  pattern = pattern.replace(/\u0000(\d+)\u0000/g, () => '([^/?#]+)');
  return { regex: new RegExp('^' + pattern + '$'), keys };
}

// 纯函数:给定已编译的路由列表和 path,返回匹配结果
export function matchPath(compiledRoutes, path) {
  for (const r of compiledRoutes) {
    const m = r.regex.exec(path);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(m[i + 1]);
      });
      return params;
    }
  }
  return null;
}

function add(pattern, handler) {
  routes.push({ ...compilePattern(pattern), handler });
}

function parseHash() {
  // hash 形如 "#/forum/abc?page=2" 或 "#/search?q=xx"
  let h = location.hash.replace(/^#/, '');
  if (!h) h = '/';
  const [pathPart, queryPart = ''] = h.split('?');
  const path = pathPart.replace(/\/+$/, '') || '/';
  const query = {};
  if (queryPart) {
    new URLSearchParams(queryPart).forEach((v, k) => {
      query[k] = v;
    });
  }
  return { path, query };
}

let currentCleanup = null;

// 内部:同时返回 handler 和 params(render 用)
function findRoute(path) {
  for (const r of routes) {
    const m = r.regex.exec(path);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(m[i + 1]);
      });
      return { handler: r.handler, params };
    }
  }
  return null;
}

async function render(mount) {
  // 上一页的清理函数(如取消滚动监听等)
  if (typeof currentCleanup === 'function') {
    try {
      currentCleanup();
    } catch {}
    currentCleanup = null;
  }

  const { path, query } = parseHash();
  const found = findRoute(path);

  // 返回的清理函数会被存到 currentCleanup
  if (found) {
    const maybeCleanup = await found.handler(found.params, query, mount);
    if (typeof maybeCleanup === 'function') currentCleanup = maybeCleanup;
  } else {
    mount.innerHTML = '<div class="state-empty"><p>页面不存在 <a href="#/">回首页</a></p></div>';
  }

  // 滚动到顶部
  window.scrollTo(0, 0);
}

function navigate(to) {
  location.hash = to;
}

function onChange(mount) {
  render(mount);
}

export const router = {
  add,
  navigate,
  start(mount) {
    window.addEventListener('hashchange', () => onChange(mount));
    onChange(mount);
  },
};
