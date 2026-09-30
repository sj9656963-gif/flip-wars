// 실행: node e2e/visual.mjs  (V_SKIP_BUILD=1이면 빌드 생략, V_ONLY=adv|arena|menus 로 일부만)
// 휴대폰 크기(390×844, 터치)로 타이틀 → 모험 1라운드(조준·카드) → 결과 → 강화·방법·설정 → 같이 하기 2명·4인 난투를 찍고 오류를 확인.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'e2e', 'out');
fs.mkdirSync(outDir, { recursive: true });
const out = (n) => path.join(outDir, n);
const only = process.env.V_ONLY ?? '';
if (!process.env.V_SKIP_BUILD) execSync('npx vite build --logLevel warn', { cwd: root, stdio: 'inherit' });

const server = await preview({ root, preview: { port: 4181, strictPort: false }, logLevel: 'warn' });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

async function phone() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}?e2e`);
  await page.waitForFunction(() => !!window.__fw);
  return { ctx, page };
}

const phase = (p) => p.evaluate(() => window.__fw.phase());
const waitPhase = (p, ph, timeout = 8000) => p.waitForFunction((x) => window.__fw.phase() === x, ph, { timeout });

try {
  if (!only || only === 'adv') {
    const { ctx, page } = await phone();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: out('m-title.png') });
    await page.tap('[data-go="adventure"]');
    await page.waitForTimeout(700);
    await page.screenshot({ path: out('m-countdown.png') });
    await waitPhase(page, 'play');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: out('m-play-start.png') });
    // 조준: 화면 위쪽 왼편으로 끌기
    const cdp = await ctx.newCDPSession(page);
    const touch = async (pts) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
      for (const [x, y] of pts.slice(1)) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
        await page.waitForTimeout(30);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await touch([
      [195, 500],
      [170, 420],
      [140, 330],
    ]);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: out('m-play-aim.png') });
    const s1 = await page.evaluate(() => window.__fw.state());
    check('조준 후 내 땅이 늘어남', s1.teams[0].tiles > 117, `내 땅 ${s1.teams[0].tiles}, 공 ${s1.balls}`);
    // 병사 카드
    await page.evaluate(() => window.__fw.points(0, 200));
    await page.waitForTimeout(200);
    await page.tap('.card[data-card="soldiers"]');
    await page.waitForTimeout(1600);
    await page.screenshot({ path: out('m-play-soldiers.png') });
    const s2 = await page.evaluate(() => window.__fw.state());
    check('병사 카드 → 병사 출동', s2.teams[0].cardsUsed === 1 && s2.units > 0, `병사 ${s2.units}`);
    await page.evaluate(() => window.__fw.ff(20));
    await page.waitForTimeout(600);
    await page.screenshot({ path: out('m-play-mid.png') });
    // 끝까지
    await page.evaluate(() => window.__fw.ff(120));
    await waitPhase(page, 'results', 10000);
    await page.waitForTimeout(500);
    await page.screenshot({ path: out('m-results.png') });
    const saved = await page.evaluate(() => window.__fw.save());
    check('결과 화면 · 코인 저장', saved.coins > 0, `코인 ${saved.coins}, 라운드 ${saved.round}`);
    await page.tap('#r-up');
    await page.waitForTimeout(400);
    await page.screenshot({ path: out('m-upgrades.png') });
    await page.tap('#s-upgrades [data-back]');
    await page.tap('#s-results [data-go="title"]');
    await page.waitForTimeout(500);
    await page.tap('[data-go="howto"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: out('m-howto.png'), fullPage: false });
    await page.tap('#s-howto [data-back]');
    await page.tap('[data-go="settings"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: out('m-settings.png') });
    await ctx.close();
  }

  if (!only || only === 'arena') {
    // 같이 하기 2명
    const { ctx, page } = await phone();
    await page.waitForTimeout(800);
    await page.tap('[data-go="local"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: out('m-local-setup.png') });
    await page.tap('#local-start');
    await waitPhase(page, 'play');
    await page.evaluate(() => window.__fw.ff(12));
    await page.waitForTimeout(700);
    await page.screenshot({ path: out('m-local2.png') });
    const s = await page.evaluate(() => window.__fw.state());
    check('같이 하기 2명 판', s.mode === 'local' && s.teams.length === 2, `${s.cols}×${s.rows}`);
    await page.tap('.hud-pause');
    await page.waitForTimeout(300);
    await page.screenshot({ path: out('m-pause.png') });
    await page.tap('#p-quit');
    await page.waitForTimeout(500);
    // 4인 난투
    await page.tap('[data-go="brawl"]');
    await waitPhase(page, 'play');
    await page.evaluate(() => window.__fw.ff(15));
    await page.waitForTimeout(700);
    await page.screenshot({ path: out('m-brawl.png') });
    const b = await page.evaluate(() => window.__fw.state());
    check('4인 난투 판', b.teams.length === 4 && b.mode === 'brawl', `공 ${b.balls}, 병사 ${b.units}`);
    await ctx.close();
    // 같이 하기 4명 (태블릿)
    const tab = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const tp = await tab.newPage();
    tp.on('pageerror', (e) => errors.push(String(e)));
    await tp.goto(`${base}?e2e`);
    await tp.waitForFunction(() => !!window.__fw);
    await tp.tap('[data-go="local"]');
    await tp.tap('#seats li:nth-child(3) .seg button:nth-child(1)');
    await tp.tap('#seats li:nth-child(4) .seg button:nth-child(1)');
    await tp.tap('#local-start');
    await tp.waitForFunction(() => window.__fw.phase() === 'play', null, { timeout: 8000 });
    await tp.evaluate(() => window.__fw.ff(10));
    await tp.waitForTimeout(700);
    await tp.screenshot({ path: out('t-local4.png') });
    await tab.close();
    // PC 가로 화면
    const pc = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pp = await pc.newPage();
    pp.on('pageerror', (e) => errors.push(String(e)));
    await pp.goto(`${base}?e2e`);
    await pp.waitForFunction(() => !!window.__fw);
    await pp.waitForTimeout(1500);
    await pp.screenshot({ path: out('d-title.png') });
    await pp.click('[data-go="adventure"]');
    await pp.waitForFunction(() => window.__fw.phase() === 'play', null, { timeout: 8000 });
    await pp.mouse.move(560, 260);
    await pp.evaluate(() => window.__fw.ff(8));
    await pp.waitForTimeout(700);
    await pp.screenshot({ path: out('d-play.png') });
    const man = await (await fetch(new URL('manifest.webmanifest', base))).json();
    check('설치 정보(manifest)', man.name === '땅따먹기 대작전' && man.icons.length >= 3);
    await pc.close();
  }
  check('오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('실행', false, e instanceof Error ? e.stack : String(e));
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
const bad = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - bad.length}/${checks.length} 통과`);
process.exit(bad.length ? 1 : 0);
