// 앱 진행: 타이틀(뒤에서 AI끼리 대전) → 판 시작(카운트다운) → 게임(입력·시뮬레이션·화면) → 결과·코인·강화.

import './style.css';
import { Sfx } from './audio';
import { initPwa } from './pwa';
import { COLORS, NEUTRAL_CSS } from './render/palette';
import { GameView } from './render/view';
import { loadSave, storeSave, defaultSave } from './save';
import { aiCommands } from './sim/ai';
import { CARD, CARDS, TICK, type CardId } from './sim/constants';
import { createGame, stepGame } from './sim/game';
import { adventureLevel, arenaLevel, demoLevel, type Seat } from './sim/levels';
import { cardsForRound, rewardCoins, UPGRADES, upgradeCost } from './sim/progress';
import type { Command, Game, GameEvent, LevelDef, Side } from './sim/types';
import { formatTime, Hud } from './ui/hud';
import { CARD_ICONS, UI } from './ui/icons';

type ScreenId = 'title' | 'results' | 'upgrades' | 'howto' | 'settings' | 'local' | 'pause';
type Phase = 'menu' | 'countdown' | 'play' | 'paused' | 'ending' | 'results';

interface Session {
  kind: 'adventure' | 'brawl' | 'local';
  level: LevelDef;
  round: number;
  humans: number[];
  seats?: Seat[];
  aiRound?: number;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let save = loadSave();
const sfx = new Sfx();
sfx.sfxOn = save.settings.sfx;
sfx.musicOn = save.settings.music;
const canvas = $<HTMLCanvasElement>('scene');
const view = new GameView(canvas, save.settings.quality);
const hud = new Hud($('hud'), $('toast'), {
  onCard: (team, card) => pressCard(team, card),
  onPause: () => pause(),
});

function pressCard(team: number, card: CardId): void {
  if (phase !== 'play' || !game) return;
  const tm = game.teams[team];
  const def = CARD[card];
  if (!tm.alive || tm.points < def.cost || game.time < tm.cardReady[card]) {
    sfx.nope();
    return;
  }
  pending.push({ type: 'card', team, card });
  hideHint('card');
}

let game: Game | null = null;
let session: Session | null = null;
let phase: Phase = 'menu';
let demoRestart = 0;
let endTimer = 0;
let speed = 1;
const pending: Command[] = [];
let acc = 0;
let last = performance.now();
const screens: ScreenId[] = [];
let localSeats: Seat[] = ['human', 'human', 'off', 'off'];
let localAi = 6;
let hint: '' | 'aim' | 'card' = '';
let hintShown = false;

// 아이콘 채우기
document.querySelectorAll<HTMLElement>('[data-icon]').forEach((e) => {
  const k = e.dataset.icon as keyof typeof UI;
  if (UI[k]) e.innerHTML = UI[k];
});
document.querySelectorAll<HTMLElement>('[data-card-icon]').forEach((e) => {
  e.innerHTML = CARD_ICONS[e.dataset.cardIcon as CardId] ?? '';
});

// ───────────────────────── 화면 전환 ─────────────────────────

function showScreen(id: ScreenId | null, push = true): void {
  document.querySelectorAll<HTMLElement>('.screen').forEach((s) => (s.hidden = true));
  if (!id) {
    screens.length = 0;
    return;
  }
  if (push && screens[screens.length - 1] !== id) screens.push(id);
  const el = $(`s-${id}`);
  el.hidden = false;
  if (id === 'title') renderTitle();
  if (id === 'upgrades') renderUpgrades();
  if (id === 'settings') renderSettings();
  if (id === 'local') renderLocal();
  if (id === 'pause') {
    $<HTMLInputElement>('p-sfx').checked = save.settings.sfx;
    $<HTMLInputElement>('p-music').checked = save.settings.music;
  }
  const first = el.querySelector<HTMLElement>('.btn.primary, .btn, .icon-btn');
  if (first && window.matchMedia('(hover: hover)').matches) first.focus({ preventScroll: true });
}

function back(): void {
  screens.pop();
  const prev = screens.pop();
  if (prev) showScreen(prev);
  else if (phase === 'results') showScreen('results');
  else showScreen('title');
}

function go(target: string): void {
  sfx.unlock();
  sfx.click();
  switch (target) {
    case 'adventure':
      startAdventure(save.round);
      break;
    case 'brawl':
      startBrawl();
      break;
    case 'title':
      toTitle();
      break;
    default:
      showScreen(target as ScreenId);
  }
}

document.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-go], [data-back]');
  if (!t) return;
  if (t.hasAttribute('data-back')) {
    sfx.click();
    back();
  } else go(t.dataset.go ?? 'title');
});

function renderTitle(): void {
  $('t-round').textContent = `라운드 ${save.round}`;
  $('t-coins').textContent = String(save.coins);
  $('t-best').textContent = save.best > 0 ? `최고 기록 라운드 ${save.best} · ${save.stats.wins}승` : '적 기지를 무너뜨려 판 전체를 내 색으로 뒤집으세요';
}

function renderUpgrades(): void {
  $('u-coins').textContent = String(save.coins);
  const list = $('up-list');
  list.replaceChildren();
  for (const u of UPGRADES) {
    const lv = save.upgrades[u.id];
    const max = lv >= u.max;
    const cost = upgradeCost(u, lv);
    const li = document.createElement('li');
    li.className = 'up';
    const pips = Array.from({ length: u.max }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('');
    li.innerHTML = `<div class="up-main"><b>${u.name}</b><span class="up-desc">${u.desc}</span><span class="up-eff">${u.effect(lv)}${max ? '' : ` → <em>${u.effect(lv + 1)}</em>`}</span><span class="pips">${pips}</span></div>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn buy';
    btn.disabled = max || save.coins < cost;
    btn.innerHTML = max ? '최대' : `<i class="coin"></i>${cost}`;
    btn.addEventListener('click', () => {
      if (save.upgrades[u.id] >= u.max || save.coins < cost) return;
      save.coins -= cost;
      save.upgrades[u.id]++;
      storeSave(save);
      sfx.coin();
      renderUpgrades();
    });
    li.append(btn);
    list.append(li);
  }
}

function renderSettings(): void {
  $<HTMLInputElement>('set-sfx').checked = save.settings.sfx;
  $<HTMLInputElement>('set-music').checked = save.settings.music;
  $<HTMLInputElement>('set-vibrate').checked = save.settings.vibrate;
  $('set-quality')
    .querySelectorAll<HTMLButtonElement>('button')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === save.settings.quality)));
}

function bindToggle(id: string, key: 'sfx' | 'music' | 'vibrate'): void {
  $<HTMLInputElement>(id).addEventListener('change', (e) => {
    save.settings[key] = (e.target as HTMLInputElement).checked;
    storeSave(save);
    applySound();
  });
}
bindToggle('set-sfx', 'sfx');
bindToggle('set-music', 'music');
bindToggle('set-vibrate', 'vibrate');
bindToggle('p-sfx', 'sfx');
bindToggle('p-music', 'music');

function applySound(): void {
  sfx.sfxOn = save.settings.sfx;
  sfx.musicOn = save.settings.music;
}

$('set-quality').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-v]');
  if (!b) return;
  save.settings.quality = b.dataset.v === 'low' ? 'low' : 'high';
  storeSave(save);
  view.setQuality(save.settings.quality);
  renderSettings();
});

$('set-reset').addEventListener('click', () => {
  if (!window.confirm('라운드·코인·강화가 모두 처음으로 돌아가요. 계속할까요?')) return;
  const settings = save.settings;
  save = defaultSave();
  save.settings = settings;
  storeSave(save);
  renderSettings();
});

// 같이 하기 자리 고르기
const SEAT_NAMES: { side: Side; label: string; color: keyof typeof COLORS }[] = [
  { side: 'bottom', label: 'P1 · 아래', color: 'blue' },
  { side: 'top', label: 'P2 · 위', color: 'red' },
  { side: 'left', label: 'P3 · 왼쪽', color: 'green' },
  { side: 'right', label: 'P4 · 오른쪽', color: 'amber' },
];

function renderLocal(): void {
  const list = $('seats');
  list.replaceChildren();
  SEAT_NAMES.forEach((s, k) => {
    const li = document.createElement('li');
    li.innerHTML = `<b class="dot" style="background:${COLORS[s.color].css}"></b><span>${s.label}</span>`;
    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const [v, label] of [
      ['human', '사람'],
      ['ai', 'AI'],
      ['off', '없음'],
    ] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute('aria-pressed', String(localSeats[k] === v));
      b.disabled = k < 2 && v === 'off';
      b.addEventListener('click', () => {
        localSeats[k] = v;
        sfx.click();
        renderLocal();
      });
      seg.append(b);
    }
    li.append(seg);
    list.append(li);
  });
  $('ai-level')
    .querySelectorAll<HTMLButtonElement>('button')
    .forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === localAi)));
  const humans = localSeats.filter((s) => s === 'human').length;
  const warn = $('local-warn');
  warn.hidden = humans > 0;
  warn.textContent = '사람이 한 명은 있어야 해요.';
  $<HTMLButtonElement>('local-start').disabled = humans === 0;
}

$('ai-level').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-v]');
  if (!b) return;
  localAi = Number(b.dataset.v);
  sfx.click();
  renderLocal();
});

$('local-start').addEventListener('click', () => {
  sfx.unlock();
  startLocal();
});

// ───────────────────────── 판 시작 ─────────────────────────

function startDemo(): void {
  session = null;
  game = createGame(demoLevel((Math.random() * 1e9) | 0));
  view.setGame(game, { camera: 'tilt', humans: [] });
  hud.hide();
  layout();
  phase = 'menu';
  demoRestart = 0;
}

function toTitle(): void {
  sfx.stopMusic();
  hideHint();
  $('countdown').hidden = true;
  startDemo();
  screens.length = 0;
  showScreen('title');
}

function startAdventure(round: number): void {
  const level = adventureLevel(round, save.upgrades);
  begin({ kind: 'adventure', level, round, humans: [0] });
}

function startBrawl(): void {
  const aiRound = Math.max(2, Math.min(18, save.best + 1));
  const level = arenaLevel({ mode: 'brawl', seats: ['human', 'ai', 'ai', 'ai'], aiRound, up: save.upgrades, seed: (Math.random() * 1e9) | 0 });
  begin({ kind: 'brawl', level, round: aiRound, humans: [0], aiRound });
}

function startLocal(): void {
  const seats = [...localSeats];
  const level = arenaLevel({ mode: 'local', seats, aiRound: localAi, seed: (Math.random() * 1e9) | 0 });
  const humans = level.teams.map((t, i) => (t.control === 'human' ? i : -1)).filter((i) => i >= 0);
  begin({ kind: 'local', level, round: localAi, humans, seats, aiRound: localAi });
}

function begin(s: Session): void {
  session = s;
  game = createGame(s.level);
  const shared = s.humans.length === 1 && s.kind !== 'local';
  view.setGame(game, { camera: s.kind === 'local' ? 'top' : 'tilt', humans: s.humans });
  hud.setup(game, s.humans, s.level.label, shared);
  lastGateHits = 0;
  showScreen(null);
  layout();
  pending.length = 0;
  acc = 0;
  endTimer = 0;
  countdown(s.level.label);
}

function countdown(label: string): void {
  phase = 'countdown';
  const box = $('countdown');
  const num = $('cd-num');
  $('cd-label').textContent = label;
  box.hidden = false;
  let n = 3;
  const tick = () => {
    if (phase !== 'countdown') return;
    if (n > 0) {
      num.textContent = String(n);
      num.classList.remove('pop');
      void num.offsetWidth;
      num.classList.add('pop');
      sfx.count(n);
      n--;
      window.setTimeout(tick, 650);
    } else {
      num.textContent = '시작!';
      num.classList.remove('pop');
      void num.offsetWidth;
      num.classList.add('pop');
      sfx.count(0);
      phase = 'play';
      last = performance.now();
      acc = 0;
      sfx.startMusic();
      window.setTimeout(() => (box.hidden = true), 550);
      maybeHint();
    }
  };
  tick();
}

function pause(): void {
  if (phase !== 'play' && phase !== 'countdown') return;
  phase = 'paused';
  sfx.stopMusic();
  $('countdown').hidden = true;
  showScreen('pause');
}

function resume(): void {
  if (phase !== 'paused') return;
  showScreen(null);
  phase = 'play';
  last = performance.now();
  sfx.unlock();
  sfx.startMusic();
}

$('p-resume').addEventListener('click', () => {
  sfx.click();
  resume();
});
$('p-restart').addEventListener('click', () => {
  sfx.click();
  if (session) restart();
});
$('p-quit').addEventListener('click', () => {
  sfx.click();
  toTitle();
});

function restart(): void {
  const s = session;
  if (!s) return;
  if (s.kind === 'adventure') startAdventure(s.round);
  else if (s.kind === 'brawl') startBrawl();
  else startLocal();
}

// ───────────────────────── 도움말 (1라운드) ─────────────────────────

function maybeHint(): void {
  if (save.tutorial || session?.kind !== 'adventure' || session.round !== 1) return;
  hint = 'aim';
  hintShown = true;
  const box = $('hint');
  $('hint-text').textContent = '화면을 누른 채 끌어서 조준해요';
  box.className = 'aim';
  box.hidden = false;
}

function hideHint(kind?: 'aim' | 'card'): void {
  if (kind && hint !== kind) return;
  $('hint').hidden = true;
  hint = '';
}

function hintCards(): void {
  if (!hintShown || hint || !game || save.tutorial) return;
  const tm = game.teams[0];
  if (tm.points < CARD.soldiers.cost || tm.cardsUsed > 0) return;
  const r = hud.cardRect(0, 'soldiers');
  if (!r) return;
  hint = 'card';
  hintShown = false;
  const box = $('hint');
  $('hint-text').textContent = '포인트가 모였어요! 병사 카드를 눌러 보내 보세요';
  box.className = 'card';
  const cx = r.left + r.width / 2;
  const bx = Math.min(window.innerWidth - 150, Math.max(150, cx));
  box.style.setProperty('--x', `${bx}px`);
  box.style.setProperty('--y', `${r.top}px`);
  box.style.setProperty('--hand', `${cx - bx}px`);
  box.hidden = false;
  window.setTimeout(() => hideHint('card'), 7000);
}

// ───────────────────────── 입력 ─────────────────────────

const pointers = new Map<number, number>();

function teamForPoint(x: number, y: number): number {
  const s = session;
  if (!s || !game) return -1;
  if (s.humans.length === 1) return s.humans[0];
  const dx = (x - window.innerWidth / 2) / window.innerWidth;
  const dy = (y - window.innerHeight / 2) / window.innerHeight;
  let best = -1;
  let bs = -Infinity;
  for (const h of s.humans) {
    const side = game.teams[h].side;
    const v = side === 'bottom' ? dy : side === 'top' ? -dy : side === 'left' ? -dx : dx;
    if (v > bs) {
      bs = v;
      best = h;
    }
  }
  return best;
}

function aimAt(team: number, x: number, y: number): void {
  const p = view.pick(x, y);
  if (!p) return;
  for (let i = pending.length - 1; i >= 0; i--) {
    const c = pending[i];
    if (c.type === 'aim' && c.team === team) pending.splice(i, 1);
  }
  pending.push({ type: 'aim', team, x: p.x, z: p.z });
  hideHint('aim');
}

canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (!game || phase !== 'play') return;
  const team = teamForPoint(e.clientX, e.clientY);
  if (team < 0) return;
  pointers.set(e.pointerId, team);
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* 이미 끝난 포인터 */
  }
  aimAt(team, e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', (e) => {
  if (!game || phase !== 'play') return;
  let team = pointers.get(e.pointerId);
  if (team === undefined && e.pointerType === 'mouse' && session?.humans.length === 1) team = session.humans[0];
  if (team === undefined) return;
  aimAt(team, e.clientX, e.clientY);
});
const endPointer = (e: PointerEvent) => pointers.delete(e.pointerId);
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p') {
    if (phase === 'play') pause();
    else if (phase === 'paused') resume();
    return;
  }
  if (phase === 'play' && session && /^[1-6]$/.test(e.key)) {
    const tm = game?.teams[session.humans[0]];
    const card = tm?.cards[Number(e.key) - 1];
    if (tm && card) pressCard(tm.id, card);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (phase === 'play' || phase === 'countdown') pause();
    sfx.stopMusic();
  }
});

// ───────────────────────── 사건 → 소리·진동·끝 ─────────────────────────

function vibrate(ms: number | number[]): void {
  if (save.settings.vibrate && 'vibrate' in navigator) navigator.vibrate(ms);
}

let lastGateHits = 0;

function handleEvents(events: readonly GameEvent[]): void {
  const g = game;
  if (!g) return;
  view.onEvents(events);
  if (!session) return;
  hud.onEvents(events, g, view);
  const humans = session.humans;
  let flips = 0;
  for (const e of events) {
    switch (e.t) {
      case 'flip':
        if (e.delay === 0 && humans.includes(e.to)) flips++;
        break;
      case 'shot':
        if (humans.includes(e.team)) sfx.shot();
        break;
      case 'gold':
        if (humans.includes(e.team)) sfx.coin();
        break;
      case 'card':
        if (humans.includes(e.team)) {
          sfx.card();
          if (e.card === 'freeze') sfx.freeze();
        } else if (e.card === 'freeze') sfx.freeze();
        break;
      case 'gate':
        if (humans.includes(e.team)) sfx.gate();
        break;
      case 'explode':
        sfx.boom();
        vibrate(40);
        break;
      case 'baseHit':
        if (humans.includes(e.team)) {
          sfx.hit();
          vibrate(15);
        }
        break;
      case 'eliminated':
        sfx.boom();
        vibrate([60, 40, 90]);
        break;
      case 'fever':
        sfx.feverStart();
        sfx.setFever(true);
        break;
      case 'end':
        phase = 'ending';
        endTimer = e.winner >= 0 && g.endReason === 'ko' ? 2.6 : 1.6;
        sfx.stopMusic();
        hideHint();
        break;
      default:
        break;
    }
  }
  if (flips) sfx.pop();
  // × 팻말 통과 소리 (공이 많으니 가끔만)
  let hits = 0;
  for (const gt of g.gates) hits += gt.hits;
  if (hits < lastGateHits) lastGateHits = hits;
  if (hits - lastGateHits >= 8) {
    lastGateHits = hits;
    sfx.gate();
  }
}

// ───────────────────────── 결과 ─────────────────────────

function showResults(): void {
  const g = game;
  const s = session;
  if (!g || !s) return;
  phase = 'results';
  const kicker = $('r-kicker');
  const title = $('r-title');
  const sub = $('r-sub');
  const next = $<HTMLButtonElement>('r-next');
  const retry = $<HTMLButtonElement>('r-retry');
  const up = $('r-up');
  const coinsRow = $('r-coins-row');
  const stats = $('r-stats');
  // 땅 비율 막대
  const bar = $('r-bar');
  bar.replaceChildren();
  const parts: [number, string][] = [
    [g.teams[0].tiles, COLORS[g.teams[0].color].css],
    [g.playable - g.teams.reduce((a, t) => a + t.tiles, 0), NEUTRAL_CSS],
    ...g.teams.slice(1).map((t): [number, string] => [t.tiles, COLORS[t.color].css]),
  ];
  for (const [v, c] of parts) {
    const i = document.createElement('i');
    i.className = 'seg';
    i.style.flexGrow = String(v);
    i.style.background = c;
    bar.append(i);
  }
  const row = (k: string, v: string) => `<li><span>${k}</span><b>${v}</b></li>`;
  save.stats.played++;
  if (s.kind === 'local') {
    const w = g.winner >= 0 ? g.teams[g.winner] : null;
    kicker.textContent = s.level.label;
    title.textContent = w ? `${w.name} 승리!` : '무승부';
    title.style.color = w ? COLORS[w.color].css : '';
    sub.textContent = w ? (g.endReason === 'ko' ? '마지막까지 기지를 지켰어요' : '시간 종료 · 땅을 가장 넓게 차지했어요') : '땅 넓이가 같았어요';
    stats.innerHTML = [...g.teams]
      .sort((a, b) => a.rank - b.rank)
      .map((t) => row(`${t.rank}위 · ${t.name}`, `${Math.round((t.tiles / g.playable) * 100)}% · ${t.flips}칸`))
      .join('');
    coinsRow.hidden = true;
    next.textContent = '다시 하기';
    next.onclick = () => restart();
    retry.hidden = true;
    up.hidden = true;
    sfx.fanfare(true);
  } else {
    const me = g.teams[0];
    const win = g.winner === 0;
    const share = me.tiles / g.playable;
    const coins = rewardCoins({ win, ko: g.endReason === 'ko', share, round: s.round, gold: me.gold });
    save.coins += coins;
    save.stats.flips += me.flips;
    if (win) save.stats.wins++;
    title.style.color = '';
    if (s.kind === 'adventure') {
      kicker.textContent = s.level.label;
      if (win) {
        save.best = Math.max(save.best, s.round);
        if (s.round >= save.round) save.round = s.round + 1;
      }
      next.textContent = win ? `다음 라운드 ${s.round + 1}` : '다시 도전';
      next.onclick = () => startAdventure(win ? s.round + 1 : s.round);
      retry.hidden = !win;
      retry.onclick = () => startAdventure(s.round);
      const nextCards = cardsForRound(s.round + 1).filter((c) => !cardsForRound(s.round).includes(c));
      if (win && nextCards.length) sub.dataset.unlock = `새 카드: ${nextCards.map((c) => CARD[c].name).join(', ')}`;
      else delete sub.dataset.unlock;
    } else {
      kicker.textContent = `4인 난투 · ${me.rank}위`;
      next.textContent = '한 판 더';
      next.onclick = () => startBrawl();
      retry.hidden = true;
    }
    title.textContent = win ? '승리!' : s.kind === 'brawl' ? `${me.rank}위` : '패배';
    title.classList.toggle('lose', !win);
    sub.textContent =
      g.endReason === 'ko'
        ? win
          ? '적 기지를 무너뜨리고 판 전체를 뒤집었어요!'
          : me.alive
            ? '다른 팀이 모든 기지를 무너뜨렸어요'
            : '기지가 무너졌어요. 강화하고 다시 도전해 보세요'
        : win
          ? `시간 종료 · 땅을 더 많이 차지했어요 (${Math.round(share * 100)}%)`
          : `시간 종료 · 땅이 더 적었어요 (${Math.round(share * 100)}%)`;
    if (sub.dataset.unlock) sub.textContent += ` · ${sub.dataset.unlock}`;
    stats.innerHTML = [
      row('차지한 땅', `${Math.round(share * 100)}%`),
      row('뒤집은 칸', `${me.flips}`),
      row('금화', `${me.gold}`),
      row('쓰러뜨린 적 병사', `${me.kills}`),
      row('남은 시간', formatTime(g.duration - g.time)),
    ].join('');
    coinsRow.hidden = false;
    $('r-coins').textContent = String(coins);
    up.hidden = false;
    sfx.fanfare(win);
  }
  save.tutorial = save.tutorial || s.kind === 'adventure';
  storeSave(save);
  showScreen('results');
}

// ───────────────────────── 화면 크기 ─────────────────────────

function layout(): void {
  view.resize(window.innerWidth, window.innerHeight, hud.insets());
}

window.addEventListener('resize', () => layout());
window.visualViewport?.addEventListener('resize', () => layout());

// ───────────────────────── 매 프레임 ─────────────────────────

function frame(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  const g = game;
  if (g) {
    const stepping = phase === 'play' || phase === 'ending' || (phase === 'menu' && !session);
    if (stepping) {
      acc += dt * speed;
      const maxSteps = speed > 1 ? 1200 : 5;
      let steps = 0;
      while (acc >= TICK && steps < maxSteps) {
        const cmds = pending.splice(0);
        aiCommands(g, cmds);
        stepGame(g, cmds);
        if (g.events.length) {
          handleEvents(g.events);
          g.events.length = 0;
        }
        acc -= TICK;
        steps++;
      }
      if (steps >= maxSteps) acc = 0;
    }
    if (phase === 'menu' && !session && g.over) {
      if (!demoRestart) demoRestart = now + 2500;
      else if (now > demoRestart) startDemo();
    }
  }
  view.frame(dt, Math.min(1, acc / TICK));
  if (g && session && phase !== 'menu') hud.frame(g, view);
  if (phase === 'play') hintCards();
  if (phase === 'ending') {
    endTimer -= dt;
    if (endTimer <= 0) showResults();
  }
  requestAnimationFrame(frame);
}

// ───────────────────────── 시작 ─────────────────────────

initPwa($<HTMLButtonElement>('install'));
startDemo();
showScreen('title');
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});

// 자동 점검용 (주소에 ?e2e가 있을 때만)
if (new URLSearchParams(location.search).has('e2e')) {
  (window as unknown as { __fw: unknown }).__fw = {
    phase: () => phase,
    state: () =>
      game && {
        time: game.time,
        over: game.over,
        winner: game.winner,
        teams: game.teams.map((t) => ({ tiles: t.tiles, points: t.points, hp: t.hp, alive: t.alive, units: t.units, cardsUsed: t.cardsUsed })),
        balls: game.balls.n,
        units: game.units.length,
        mode: game.level.mode,
        cols: game.cols,
        rows: game.rows,
      },
    /** 시뮬레이션을 sec초만큼 빨리 돌림 */
    ff: (sec: number) => {
      const g = game;
      if (!g) return;
      for (let i = 0; i < Math.round(sec / TICK) && !g.over; i++) {
        const cmds = pending.splice(0);
        aiCommands(g, cmds);
        stepGame(g, cmds);
        if (g.events.length) {
          handleEvents(g.events);
          g.events.length = 0;
        }
      }
    },
    speed: (n: number) => (speed = n),
    points: (team: number, p: number) => {
      if (game) game.teams[team].points = p;
    },
    project: (x: number, z: number) => view.project(x, 0.22, z),
    save: () => save,
    cards: CARDS.map((c) => c.id),
  };
}
