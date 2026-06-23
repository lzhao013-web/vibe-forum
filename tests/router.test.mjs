// 路由匹配测试
import { compilePattern, matchPath } from '../src/router.js';

const patterns = ['/', '/register', '/forum/:id', '/topic/:id', '/search', '/newpost'];
const compiled = patterns.map(compilePattern);

const cases = [
  { path: '/', expect: {} },
  { path: '/register', expect: {} },
  { path: '/forum/tech', expect: { id: 'tech' } },
  { path: '/topic/gen_abc', expect: { id: 'gen_abc' } },
  { path: '/topic/user_123_xyz', expect: { id: 'user_123_xyz' } },
  { path: '/topic/has-dash', expect: { id: 'has-dash' } },
  { path: '/search', expect: {} },
  { path: '/newpost', expect: {} },
  { path: '/forum/%E6%8A%80%E6%9C%AF', expect: { id: '技术' } },
  { path: '/unknown', expect: null },
  // 边界:多段参数模式 /forum/:id/sub
];

let pass = 0, fail = 0;
for (const { path, expect } of cases) {
  const got = matchPath(compiled, path);
  const ok = JSON.stringify(got) === JSON.stringify(expect);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), path, '=>', JSON.stringify(got), ok ? '' : `(期望 ${JSON.stringify(expect)})`);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
