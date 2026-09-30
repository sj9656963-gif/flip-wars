// 실행: node e2e/pwa.mjs  (먼저 npm run build)
// 배포된 주소 점검: PowerShell에서 $env:PWA_URL='https://아이디.github.io/flip-wars/'; node e2e/pwa.mjs
// 홈 화면 앱 점검: 설치 정보 → 서비스 워커 등록 → 다시 열면 서비스 워커가 맡음 → 인터넷을 끊고 다시 열어도 게임이 됨
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const liveUrl = process.env.PWA_URL ? process.env.PWA_URL.replace(/\/?$/, '/') : '';
const server = liveUrl ? null : await preview({ root, preview: { port: 4182, strictPort: false }, logLevel: 'warn' });
const base = liveUrl || server.resolvedUrls.local[0];
let serverOpen = !!server;
const closeServer = async () => {
  if (!serverOpen) return;
  serverOpen = false;
  server.httpServer.closeAllConnections?.();
  await new Promise((r) => server.httpServer.close(r));
};
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const ready = () => page.waitForFunction(() => !!window.__fw, null, { timeout: 30000 });

try {
  const res = await fetch(new URL('manifest.webmanifest', base));
  const manifest = await res.json();
  const iconOk = await Promise.all(manifest.icons.map(async (i) => (await fetch(new URL(i.src, base))).ok));
  check('설치 정보(manifest)·아이콘', res.ok && manifest.name === '땅따먹기 대작전' && iconOk.every(Boolean), manifest.icons.map((i) => i.sizes).join(', '));
  const sw = await (await fetch(new URL('sw.js', base))).text();
  check('sw.js 빌드', !sw.includes('__VERSION__') && !sw.includes('__PRECACHE__'));

  await page.goto(`${base}?e2e&sw`);
  await ready();
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return { scope: r.scope, state: r.active?.state ?? null };
  });
  check('서비스 워커 등록 (사이트 주소 범위)', reg.state === 'activated' && reg.scope === base, JSON.stringify(reg));
  await page.reload();
  await ready();
  check('다시 열면 서비스 워커가 맡음', await page.evaluate(() => !!navigator.serviceWorker.controller));
  await page.waitForTimeout(1500);

  await ctx.setOffline(true);
  await closeServer();
  await page.reload();
  await ready();
  await page.tap('[data-go="adventure"]');
  await page.waitForFunction(() => window.__fw.phase() === 'play', null, { timeout: 10000 });
  await page.evaluate(() => window.__fw.ff(8));
  const st = await page.evaluate(() => ({ online: navigator.onLine, st: window.__fw.state() }));
  check('인터넷 없이 다시 열고 게임 진행', !st.online && st.st.time > 7 && st.st.teams[0].tiles > 0, `시간 ${st.st.time.toFixed(1)}초, 내 땅 ${st.st.teams[0].tiles}`);
  check('오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('실행', false, e instanceof Error ? e.stack : String(e));
} finally {
  await browser.close();
  await closeServer();
}
const bad = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - bad.length}/${checks.length} 통과`);
process.exit(bad.length ? 1 : 0);
