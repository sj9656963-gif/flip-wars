// 게임 중 화면(HUD): 위쪽 땅 비율 막대와 남은 시간, 아래 포인트와 카드, 기지 위 체력, 알림 글자.
// 같이 하기에서는 사람마다 자기 쪽 가장자리에 막대·시간·포인트·카드가 따로 붙음 (자기 방향으로 돌아감).

import { COLORS, NEUTRAL_CSS } from '../render/palette';
import type { GameView, Insets } from '../render/view';
import { CARD, type CardId } from '../sim/constants';
import { cardState } from '../sim/game';
import type { Game, GameEvent, Side } from '../sim/types';
import { CARD_ICONS, UI } from './icons';

export interface HudHandlers {
  onCard(team: number, card: CardId): void;
  onPause(): void;
}

interface CardSlot {
  id: CardId;
  el: HTMLButtonElement;
  fill: HTMLElement;
  cd: HTMLElement;
  cost: number;
  last: string;
}

interface Dock {
  team: number;
  side: Side;
  el: HTMLElement;
  pts: HTMLElement;
  lastPts: number;
  cards: CardSlot[];
  bar: HTMLElement[];
  timer: HTMLElement | null;
}

interface HpLabel {
  team: number;
  el: HTMLElement;
  num: HTMLElement;
  last: string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Hud {
  private topBar: HTMLElement[] = [];
  private topTimer: HTMLElement | null = null;
  private topEl: HTMLElement | null = null;
  private docks: Dock[] = [];
  private labels: HpLabel[] = [];
  private layer: HTMLElement | null = null;
  private humans: number[] = [];
  private lastWarn = -99;
  private toastTimer = 0;
  private lastBar = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly toastEl: HTMLElement,
    private readonly cb: HudHandlers,
  ) {}

  setup(g: Game, humans: number[], label: string, shared: boolean): void {
    this.root.replaceChildren();
    this.root.hidden = false;
    this.humans = humans;
    this.docks = [];
    this.labels = [];
    this.topBar = [];
    this.topTimer = null;
    this.topEl = null;
    this.lastBar = '';
    this.root.classList.toggle('shared', shared);
    this.root.classList.toggle('multi', !shared);
    const layer = el('div', 'hud-layer');
    this.layer = layer;
    this.root.append(layer);
    if (shared) {
      const top = el('div', 'hud-top');
      const pause = el('button', 'hud-pause', UI.pause);
      pause.type = 'button';
      pause.setAttribute('aria-label', '잠깐 멈춤');
      pause.addEventListener('click', () => this.cb.onPause());
      const mid = el('div', 'hud-mid');
      const name = el('p', 'hud-label');
      name.textContent = label;
      const bar = el('div', 'terr');
      this.topBar = this.makeBar(g, bar);
      const timer = el('p', 'hud-timer');
      this.topTimer = timer;
      mid.append(name, bar, timer);
      top.append(pause, mid, el('span', 'hud-gap'));
      this.root.append(top);
      this.topEl = top;
    } else {
      const pause = el('button', 'hud-pause float', UI.pause);
      pause.type = 'button';
      pause.setAttribute('aria-label', '잠깐 멈춤');
      pause.addEventListener('click', () => this.cb.onPause());
      this.root.append(pause);
    }
    for (const team of humans) this.docks.push(this.makeDock(g, team, !shared));
    // 기지 체력 표시
    for (const t of g.teams) {
      const c = COLORS[t.color];
      const e = el('div', 'hp');
      e.style.setProperty('--c', c.css);
      e.innerHTML = UI.heart;
      const num = el('b');
      e.append(num);
      layer.append(e);
      this.labels.push({ team: t.id, el: e, num, last: '' });
    }
  }

  private makeBar(g: Game, host: HTMLElement): HTMLElement[] {
    const segs: HTMLElement[] = [];
    const order = [0, -1, ...g.teams.slice(1).map((t) => t.id)];
    for (const o of order) {
      if (o >= 0 && !g.teams[o]) continue;
      const s = el('i', 'seg');
      s.style.background = o >= 0 ? COLORS[g.teams[o].color].css : NEUTRAL_CSS;
      s.dataset.owner = String(o);
      host.append(s);
      segs.push(s);
    }
    return segs;
  }

  private makeDock(g: Game, team: number, own: boolean): Dock {
    const tm = g.teams[team];
    const c = COLORS[tm.color];
    const dock = el('div', `dock ${tm.side}`);
    dock.style.setProperty('--c', c.css);
    dock.style.setProperty('--cd', c.cssDark);
    let bar: HTMLElement[] = [];
    let timer: HTMLElement | null = null;
    if (own) {
      const info = el('div', 'dock-info');
      const b = el('div', 'terr small');
      bar = this.makeBar(g, b);
      timer = el('span', 'dock-timer');
      const who = el('span', 'dock-name');
      who.textContent = tm.name;
      info.append(who, b, timer);
      dock.append(info);
    }
    const row = el('div', 'dock-row');
    const pts = el('div', 'pts');
    pts.innerHTML = '<i class="gem"></i>';
    const ptsNum = el('b');
    ptsNum.textContent = '0';
    pts.append(ptsNum);
    const cards = el('div', 'cards');
    const slots: CardSlot[] = [];
    for (const id of tm.cards) {
      const def = CARD[id];
      const b = el('button', 'card');
      b.type = 'button';
      b.dataset.card = id;
      b.setAttribute('aria-label', `${def.name} (${def.cost}점): ${def.desc}`);
      b.innerHTML = `<span class="ico">${CARD_ICONS[id]}</span><span class="nm">${def.name}</span><span class="cost"><i class="gem"></i>${def.cost}</span>`;
      const fill = el('i', 'fill');
      const cd = el('i', 'cd');
      b.append(fill, cd);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!b.classList.contains('ok')) {
          b.classList.remove('nope');
          void b.offsetWidth;
          b.classList.add('nope');
        }
        this.cb.onCard(team, id);
      });
      cards.append(b);
      slots.push({ id, el: b, fill, cd, cost: def.cost, last: '' });
    }
    row.append(pts, cards);
    dock.append(row);
    this.root.append(dock);
    return { team, side: tm.side, el: dock, pts: ptsNum, lastPts: -1, cards: slots, bar, timer };
  }

  /** HUD가 차지한 가장자리 두께 (카메라가 판을 그 안쪽에 맞춤) */
  insets(): Insets {
    const out: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
    if (this.root.hidden) return out;
    if (this.topEl) out.top = this.topEl.getBoundingClientRect().bottom + 6;
    for (const d of this.docks) {
      const r = d.el.getBoundingClientRect();
      if (d.side === 'bottom') out.bottom = Math.max(out.bottom, window.innerHeight - r.top + 6);
      else if (d.side === 'top') out.top = Math.max(out.top, r.bottom + 6);
      else if (d.side === 'left') out.left = Math.max(out.left, r.right + 4);
      else out.right = Math.max(out.right, window.innerWidth - r.left + 4);
    }
    return out;
  }

  hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.docks = [];
    this.labels = [];
  }

  /** 카드 버튼 위치 (도움말 손가락 표시용) */
  cardRect(team: number, card: CardId): DOMRect | null {
    const d = this.docks.find((x) => x.team === team);
    const s = d?.cards.find((c) => c.id === card);
    return s ? s.el.getBoundingClientRect() : null;
  }

  frame(g: Game, view: GameView): void {
    // 땅 비율
    const parts = [g.teams[0].tiles, g.playable - g.teams.reduce((s, t) => s + t.tiles, 0), ...g.teams.slice(1).map((t) => t.tiles)];
    const key = parts.join(',');
    if (key !== this.lastBar) {
      this.lastBar = key;
      const apply = (segs: HTMLElement[]) => segs.forEach((s, k) => (s.style.flexGrow = String(Math.max(0, parts[k] ?? 0))));
      apply(this.topBar);
      for (const d of this.docks) apply(d.bar);
    }
    const left = g.duration - g.time;
    const tt = formatTime(left);
    if (this.topTimer) {
      if (this.topTimer.textContent !== tt) this.topTimer.textContent = tt;
      this.topTimer.classList.toggle('fever', g.fever);
    }
    for (const d of this.docks) {
      if (d.timer && d.timer.textContent !== tt) d.timer.textContent = tt;
      d.timer?.classList.toggle('fever', g.fever);
      const tm = g.teams[d.team];
      const p = Math.floor(tm.points);
      if (p !== d.lastPts) {
        d.lastPts = p;
        d.pts.textContent = String(p);
      }
      d.el.classList.toggle('dead', !tm.alive);
      for (const s of d.cards) {
        const st = cardState(g, d.team, s.id);
        const ok = tm.alive && st.affordable && st.ready && !g.over;
        const fill = Math.min(1, tm.points / s.cost);
        const k = `${ok ? 1 : 0}|${st.affordable ? 1 : 0}|${Math.round(fill * 40)}|${Math.round(st.cooldown * 40)}`;
        if (k === s.last) continue;
        s.last = k;
        s.el.classList.toggle('ok', ok);
        s.el.classList.toggle('poor', !st.affordable);
        s.fill.style.transform = `scaleY(${st.affordable ? 1 : fill})`;
        s.cd.style.transform = `scaleY(${st.cooldown})`;
      }
    }
    // 기지 체력
    for (const lb of this.labels) {
      const t = g.teams[lb.team];
      if (!t.alive) {
        if (!lb.el.hidden) lb.el.hidden = true;
        continue;
      }
      const p = view.project(t.cx, 2.3, t.cz);
      lb.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
      const frozen = g.time < t.frozenUntil;
      const rapid = g.time < t.rapidUntil;
      const txt = `${Math.ceil(t.hp)}${frozen ? ' ❄' : ''}${rapid ? ' ⚡' : ''}`;
      if (txt !== lb.last) {
        lb.last = txt;
        lb.num.textContent = txt;
        lb.el.classList.toggle('low', t.hp / t.maxHp < 0.3);
      }
    }
  }

  onEvents(events: readonly GameEvent[], g: Game, view: GameView): void {
    for (const e of events) {
      switch (e.t) {
        case 'fever':
          this.toast('피버 타임! 포인트 2배', 'fever');
          break;
        case 'baseHit':
          if (this.humans.includes(e.team)) {
            const lb = this.labels.find((l) => l.team === e.team);
            if (lb) {
              lb.el.classList.remove('hit');
              void lb.el.offsetWidth;
              lb.el.classList.add('hit');
            }
            if (this.humans.length === 1 && g.time - this.lastWarn > 7) {
              this.lastWarn = g.time;
              this.toast('기지가 공격받고 있어요!', 'warn');
            }
          }
          break;
        case 'eliminated': {
          const t = g.teams[e.team];
          const by = g.teams[e.by];
          if (this.humans.length === 1) {
            if (this.humans.includes(e.team)) this.toast('기지가 무너졌어요', 'warn');
            else if (this.humans.includes(e.by)) this.toast(`${t.name} 기지 파괴! +60`, 'good');
            else this.toast(`${by?.name ?? ''}이(가) ${t.name}을(를) 무너뜨렸어요`, '');
          } else {
            this.toast(`${t.name} 탈락!`, '');
          }
          break;
        }
        case 'gold':
          if (this.humans.includes(e.team)) {
            const c = e.tile % g.cols;
            this.float(view, c + 0.5, (e.tile - c) / g.cols + 0.5, '+10', 'gold');
          }
          break;
        case 'gate':
          if (this.humans.includes(e.team)) {
            const gt = g.gates[e.gate];
            this.float(view, gt.x, gt.z, `병사 +${e.n}`, 'plus');
          }
          break;
        case 'card':
          if (!this.humans.includes(e.team) && e.card === 'freeze' && this.humans.some((h) => g.teams[h].alive)) this.toast('얼음! 대포가 잠깐 멈췄어요', 'ice');
          break;
        default:
          break;
      }
    }
  }

  float(view: GameView, x: number, z: number, text: string, cls: string): void {
    if (!this.layer) return;
    const p = view.project(x, 1.2, z);
    const f = el('span', `float ${cls}`);
    f.textContent = text;
    f.style.left = `${p.x}px`;
    f.style.top = `${p.y}px`;
    this.layer.append(f);
    window.setTimeout(() => f.remove(), 1100);
  }

  toast(text: string, kind = ''): void {
    const t = this.toastEl;
    t.textContent = text;
    t.className = kind;
    void t.offsetWidth;
    t.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), 1900);
  }
}
