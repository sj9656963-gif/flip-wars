// AI: 조준할 곳(× 팻말·기지 방어·적 기지 공격)과 카드 사용을 정해 명령으로 돌려줌.
// 난수는 게임의 시드 고정 난수를 써서 같은 판이면 같은 행동을 함.

import { CARD, NEUTRAL, type CardId } from './constants';
import { clamp, stepGame, wrapAngle } from './game';
import { traceShot, type Trace } from './trace';
import type { AiProfile, Command, Game, TeamState } from './types';

/** AI 팀들의 이번 틱 명령을 out에 더함 */
export function aiCommands(g: Game, out: Command[] = []): Command[] {
  if (g.over) return out;
  for (const tm of g.teams) {
    if (tm.control !== 'ai' || !tm.alive || !tm.ai) continue;
    // 기지 바로 옆까지 적 땅이 들어오면 판단 주기를 기다리지 않고 바로 막음 (0.25초마다)
    if (g.time < tm.aiNext && !(g.tick % 15 === tm.id && breached(g, tm))) continue;
    const ai = tm.ai;
    tm.aiNext = g.time + ai.think * g.rng.range(0.75, 1.25);
    const best = chooseAim(g, tm, ai);
    const a = best.angle + g.rng.range(-ai.noise, ai.noise);
    const p = rayPoint(g, tm.cx, tm.cz, a, 8);
    out.push({ type: 'aim', team: tm.id, x: p.x, z: p.z });
    const card = chooseCard(g, tm, ai, best.trace);
    if (card) out.push(card);
  }
  return out;
}

/** 기지를 둘러싼 한 칸 테두리에 적 땅이 있는지 */
function breached(g: Game, tm: TeamState): boolean {
  for (let r = tm.baseRow - 1; r <= tm.baseRow + 2; r++) {
    if (r < 0 || r >= g.rows) continue;
    for (let c = tm.baseCol - 1; c <= tm.baseCol + 2; c++) {
      if (c < 0 || c >= g.cols) continue;
      const o = g.owner[r * g.cols + c];
      if (o >= 0 && o !== tm.id) return true;
    }
  }
  return false;
}

/** AI 명령을 넣어 한 틱 진행 */
export function stepWithAi(g: Game, cmds: Command[] = []): void {
  aiCommands(g, cmds);
  stepGame(g, cmds);
}

/** (x,z)에서 각도 a로 최대 d만큼 가되 판 안에 있는 점 */
function rayPoint(g: Game, x: number, z: number, a: number, d: number): { x: number; z: number } {
  const c = Math.cos(a);
  const s = Math.sin(a);
  let t = d;
  if (c > 1e-6) t = Math.min(t, (g.cols - 0.05 - x) / c);
  else if (c < -1e-6) t = Math.min(t, (0.05 - x) / c);
  if (s > 1e-6) t = Math.min(t, (g.rows - 0.05 - z) / s);
  else if (s < -1e-6) t = Math.min(t, (0.05 - z) / s);
  t = Math.max(0.8, t);
  return { x: clamp(x + c * t, 0, g.cols), z: clamp(z + s * t, 0, g.rows) };
}

function enemyBases(g: Game, tm: TeamState): TeamState[] {
  return g.teams.filter((t) => t.alive && t.id !== tm.id);
}

function nearestBase(g: Game, tm: TeamState, x: number, z: number): { t: TeamState | null; d: number } {
  let best: TeamState | null = null;
  let bd = Infinity;
  for (const t of enemyBases(g, tm)) {
    const d = Math.hypot(t.cx - x, t.cz - z);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return { t: best, d: bd };
}

function chooseAim(g: Game, tm: TeamState, ai: AiProfile): { angle: number; trace: Trace | null; score: number } {
  const K = 28;
  const target = nearestBase(g, tm, tm.cx, tm.cz).t;
  const toEnemy = target ? Math.atan2(target.cz - tm.cz, target.cx - tm.cx) : tm.angle;
  let best = { angle: tm.angle, trace: null as Trace | null, score: -Infinity };
  for (let k = 0; k < K + 3; k++) {
    let a: number;
    if (k < K) a = (k / K) * Math.PI * 2 + g.rng.range(0, 0.1);
    else if (k === K) a = toEnemy;
    else if (k === K + 1) a = tm.angle;
    else a = toEnemy + g.rng.range(-0.6, 0.6);
    const tr = traceShot(g, tm.id, a, 34);
    const s = scoreTrace(g, tm, ai, tr) * g.rng.range(1 - (1 - ai.smart) * 0.6, 1);
    if (s > best.score) best = { angle: a, trace: tr, score: s };
  }
  return best;
}

function scoreTrace(g: Game, tm: TeamState, ai: AiProfile, tr: Trace): number {
  if (tr.unit) return 7 * tr.mult * (0.5 + ai.smart);
  if (tr.hit < 0) return 0.05;
  const hc = tr.hit % g.cols;
  const hx = hc + 0.5;
  const hz = (tr.hit - hc) / g.cols + 0.5;
  const bt = g.baseOf[tr.hit];
  if (bt >= 0 && bt !== tm.id) return (40 + 10 * tr.mult) / (1 + tr.len / 40);
  let s = tr.mult;
  if (g.gold[tr.hit]) s += 3 + 3 * ai.smart;
  if (g.owner[tr.hit] === NEUTRAL) s *= 1.1;
  const diag = Math.hypot(g.cols, g.rows);
  const nb = nearestBase(g, tm, hx, hz);
  s *= 1 + 1.3 * ai.smart * clamp(1 - nb.d / diag, 0, 1);
  // 내 기지 가까이 들어온 적 땅은 먼저 막음
  const dOwn = Math.hypot(hx - tm.cx, hz - tm.cz);
  if (dOwn < 7) s += (7 - dOwn) * 2.2 * (0.4 + ai.smart);
  return s / (1 + tr.len / 22);
}

/** 내 기지 가까이 들어온 적 병사·적 땅 */
function threat(g: Game, tm: TeamState): { n: number; x: number; z: number } {
  let n = 0;
  let cnt = 0;
  let sx = 0;
  let sz = 0;
  for (const u of g.units) {
    if (u.team === tm.id || u.hp <= 0) continue;
    if (Math.hypot(u.x - tm.cx, u.z - tm.cz) < 6) {
      n += u.kind ? 4 : 1;
      cnt++;
      sx += u.x;
      sz += u.z;
    }
  }
  const R = 3;
  for (let r = Math.max(0, Math.floor(tm.cz - R)); r < Math.min(g.rows, Math.ceil(tm.cz + R)); r++) {
    for (let c = Math.max(0, Math.floor(tm.cx - R)); c < Math.min(g.cols, Math.ceil(tm.cx + R)); c++) {
      const o = g.owner[r * g.cols + c];
      if (o >= 0 && o !== tm.id) {
        n += 0.5;
        cnt++;
        sx += c + 0.5;
        sz += r + 0.5;
      }
    }
  }
  return cnt ? { n, x: sx / cnt, z: sz / cnt } : { n: 0, x: tm.cx, z: tm.cz };
}

/** 용병이 갈 경유지: 똑똑하면 쓸 수 있는 팻말을 지나가게 */
function waypoint(g: Game, tm: TeamState, ai: AiProfile, tr: Trace | null): { x: number; z: number } {
  const enemy = nearestBase(g, tm, tm.cx, tm.cz).t;
  if (enemy && g.rng.next() < ai.smart) {
    let best: { x: number; z: number } | null = null;
    let bestS = 0;
    const toE = Math.hypot(enemy.cx - tm.cx, enemy.cz - tm.cz);
    for (const gt of g.gates) {
      if (gt.op !== 'add' || (gt.owner !== NEUTRAL && gt.owner !== tm.id)) continue;
      const dMe = Math.hypot(gt.x - tm.cx, gt.z - tm.cz);
      const dE = Math.hypot(gt.x - enemy.cx, gt.z - enemy.cz);
      if (dE > toE || dMe > toE * 0.85) continue;
      const s = gt.value / (1 + dMe / 10);
      if (s > bestS) {
        bestS = s;
        // 팻말을 지나 적 쪽으로 조금 더 간 곳
        const nx = -gt.sin;
        const nz = gt.cos;
        const sign = (enemy.cx - gt.x) * nx + (enemy.cz - gt.z) * nz >= 0 ? 1 : -1;
        best = { x: gt.x + nx * sign * 1.4, z: gt.z + nz * sign * 1.4 };
      }
    }
    if (best) return best;
  }
  if (tr && tr.hit >= 0) {
    const c = tr.hit % g.cols;
    return { x: c + 0.5, z: (tr.hit - c) / g.cols + 0.5 };
  }
  return enemy ? { x: enemy.cx, z: enemy.cz } : { x: tm.aimX, z: tm.aimZ };
}

function chooseCard(g: Game, tm: TeamState, ai: AiProfile, tr: Trace | null): Command | null {
  if (g.rng.next() > ai.spend) return null;
  const ready = tm.cards.filter((c) => tm.points >= CARD[c].cost && g.time >= tm.cardReady[c]);
  if (!ready.length) return null;
  const has = (c: CardId) => ready.includes(c);
  const cmd = (card: CardId, x?: number, z?: number): Command => ({ type: 'card', team: tm.id, card, x, z });
  const th = threat(g, tm);
  if (th.n >= 5 && ai.smart > 0.25) {
    if (has('bomb')) return cmd('bomb', th.x, th.z);
    if (th.n >= 9 && has('freeze')) return cmd('freeze');
    if (has('soldiers')) return cmd('soldiers', th.x, th.z);
  }
  // 비싼 카드를 위해 모으기
  const priciest = tm.cards.reduce((a, b) => (CARD[b].cost > CARD[a].cost ? b : a), tm.cards[0]);
  if (ai.smart > 0.5 && !has(priciest) && tm.points >= CARD[priciest].cost * 0.6 && g.rng.next() < 0.5) return null;
  const enemy = nearestBase(g, tm, tm.cx, tm.cz).t;
  const facingEnemy = enemy ? Math.abs(wrapAngle(Math.atan2(enemy.cz - tm.cz, enemy.cx - tm.cx) - tm.angle)) < 0.45 : false;
  const weights: [CardId, number][] = [];
  for (const c of ready) {
    let w = 0;
    switch (c) {
      case 'soldiers':
        w = 3;
        break;
      case 'tank':
        w = 3;
        break;
      case 'mega':
        w = facingEnemy ? 3 : 0.5;
        break;
      case 'rapid':
        w = tr && tr.mult > 1 ? 3 : 1;
        break;
      case 'bomb':
        w = 1.5;
        break;
      case 'freeze':
        w = 1;
        break;
    }
    if (w > 0) weights.push([c, w]);
  }
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let pick = g.rng.next() * total;
  let card: CardId = weights[0][0];
  for (const [c, w] of weights) {
    pick -= w;
    if (pick <= 0) {
      card = c;
      break;
    }
  }
  if (card === 'soldiers' || card === 'tank') {
    const wp = waypoint(g, tm, ai, tr);
    return cmd(card, wp.x, wp.z);
  }
  if (card === 'bomb') {
    if (tr && tr.hit >= 0) {
      const c = tr.hit % g.cols;
      // 경계선보다 조금 더 적 쪽에 떨어뜨림
      const hx = c + 0.5;
      const hz = (tr.hit - c) / g.cols + 0.5;
      const a = Math.atan2(hz - tm.cz, hx - tm.cx);
      return cmd('bomb', hx + Math.cos(a) * 1.5, hz + Math.sin(a) * 1.5);
    }
    return enemy ? cmd('bomb', (tm.cx + enemy.cx) / 2, (tm.cz + enemy.cz) / 2) : null;
  }
  if (card === 'mega') return facingEnemy ? cmd('mega') : null;
  return cmd(card);
}

/** 테스트·밸런스용: 끝날 때까지 AI끼리 진행 */
export function simulate(g: Game, maxSeconds = 400): Game {
  const limit = Math.ceil(maxSeconds * 60);
  for (let i = 0; i < limit && !g.over; i++) stepWithAi(g);
  return g;
}
