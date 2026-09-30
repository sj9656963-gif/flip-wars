// 게임 규칙(시뮬레이션). 화면과 분리되어 있어 테스트·AI·나중의 온라인 대전에 그대로 쓸 수 있음.
// - 1/60초씩 진행(stepGame). 사람·AI의 조작은 명령(Command)으로만 들어옴
// - 난수는 시드 고정: 같은 판·같은 명령이면 항상 같은 결과
//
// 규칙 요약
// - 공은 자기 땅 위를 날아가다 처음 닿은 남의 땅(빈 땅 포함)을 자기 색으로 뒤집고 사라짐
// - 적 기지 칸에 닿으면 기지 체력이 줄고, 0이 되면 그 팀 땅이 모두 넘어옴 (전부 뒤집히면 승리)
// - × 팻말: 지나간 공·용병이 그 수만큼 늘어남 / + 팻말: 지나간 용병 무리에 병사가 더해짐
// - 팻말은 그 칸의 주인만 쓸 수 있음 (빈 땅의 팻말은 모두)
// - 시간이 다 되면 땅이 가장 넓은 팀이 이김

import { Balls } from './balls';
import {
  BALL_BASE_DAMAGE,
  BALL_LIFE,
  BALL_RADIUS,
  BALL_UNIT_DAMAGE,
  BOMB_BASE_DAMAGE,
  BOMB_DELAY,
  BOMB_RADIUS,
  CARD,
  CARDS,
  CLASH_DIST,
  FEVER_FIRE,
  FEVER_POINTS,
  FEVER_TIME,
  FREEZE_TIME,
  GOLD_POINTS,
  GUARD_INTERVAL,
  GUARD_RADIUS,
  KO_BONUS,
  MAX_BALLS,
  MAX_BOUNCES,
  MAX_GATES,
  MAX_UNITS_PER_TEAM,
  MEGA_BASE_DAMAGE,
  MEGA_POWER,
  MEGA_RADIUS,
  MEGA_SPEED,
  MUZZLE,
  NEUTRAL,
  RAPID_MUL,
  RAPID_TIME,
  SOLDIER,
  SQUAD_SIZE,
  TANK,
  TICK,
  TILE_HP,
  UNITS,
  WALL,
  type CardId,
} from './constants';
import { distanceField, fieldDir } from './flow';
import { Rng } from './rng';
import type { Command, Game, Gate, LevelDef, Squad, TeamState, Unit } from './types';

const UNIT_CAP = 512;
const dir = { x: 0, z: 0 };

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function wrapAngle(a: number): number {
  const t = Math.PI * 2;
  a = (a + Math.PI) % t;
  if (a < 0) a += t;
  return a - Math.PI;
}

export function createGame(level: LevelDef): Game {
  const { cols, rows } = level;
  const n = cols * rows;
  const owner = Int8Array.from(level.tiles);
  const baseOf = new Int8Array(n).fill(-1);
  const gold = new Uint8Array(n);
  for (const i of level.gold) if (i >= 0 && i < n && owner[i] !== WALL) gold[i] = 1;
  const teams: TeamState[] = level.teams.map((s, id) => {
    for (let dr = 0; dr < 2; dr++) {
      for (let dc = 0; dc < 2; dc++) {
        const i = (s.baseRow + dr) * cols + s.baseCol + dc;
        owner[i] = id;
        baseOf[i] = id;
        gold[i] = 0;
      }
    }
    const cx = s.baseCol + 1;
    const cz = s.baseRow + 1;
    const angle = Math.atan2(rows / 2 - cz, cols / 2 - cx);
    const cardReady = {} as Record<CardId, number>;
    for (const c of CARDS) cardReady[c.id] = 0;
    return {
      id,
      control: s.control,
      name: s.name,
      color: s.color,
      side: s.side,
      alive: true,
      baseCol: s.baseCol,
      baseRow: s.baseRow,
      cx,
      cz,
      angle,
      targetAngle: angle,
      aimX: cx + Math.cos(angle) * 6,
      aimZ: cz + Math.sin(angle) * 6,
      fireTimer: 0.6 + id * 0.07,
      guardTimer: GUARD_INTERVAL,
      stats: { ...s.stats },
      hp: s.hp,
      maxHp: s.hp,
      points: s.startPoints,
      earned: 0,
      flips: 0,
      tiles: 0,
      gold: 0,
      shots: 0,
      kills: 0,
      units: 0,
      cardsUsed: 0,
      frozenUntil: 0,
      rapidUntil: 0,
      cards: [...s.cards],
      cardReady,
      eliminatedAt: -1,
      eliminatedBy: -1,
      rank: 0,
      ai: s.ai ?? null,
      aiNext: 0.4 + id * 0.13,
    };
  });
  let playable = 0;
  for (let i = 0; i < n; i++) {
    const o = owner[i];
    if (o !== WALL) playable++;
    if (o >= 0) teams[o].tiles++;
  }
  const fields = teams.map((t) => distanceField(cols, rows, owner, baseCells(t, cols)));
  const gates: Gate[] = level.gates.slice(0, MAX_GATES).map((d, id) => ({
    id,
    op: d.op,
    value: d.value,
    x: d.x,
    z: d.z,
    x0: d.x,
    z0: d.z,
    width: d.width,
    angle: d.angle,
    cos: Math.cos(d.angle),
    sin: Math.sin(d.angle),
    moveAmp: d.moveAmp ?? 0,
    moveSpeed: d.moveSpeed ?? 0,
    owner: NEUTRAL,
    flash: -9,
    hits: 0,
  }));
  const g: Game = {
    level,
    cols,
    rows,
    n,
    owner,
    baseOf,
    gold,
    tileHp: new Uint8Array(n).fill(TILE_HP),
    playable,
    time: 0,
    tick: 0,
    duration: level.duration,
    balls: new Balls(MAX_BALLS),
    units: [],
    gates,
    bombs: [],
    teams,
    fields,
    events: [],
    rng: new Rng(level.seed),
    over: false,
    winner: -1,
    endReason: '',
    fever: false,
    nextId: 1,
    cellHead: new Int32Array(n),
    cellNext: new Int32Array(MAX_BALLS),
    unitHead: new Int32Array(n).fill(-1),
    unitNext: new Int32Array(UNIT_CAP),
    unitMap: new Int8Array(n).fill(-1),
  };
  updateGates(g);
  return g;
}

export function baseCells(t: { baseCol: number; baseRow: number }, cols: number): number[] {
  const out: number[] = [];
  for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) out.push((t.baseRow + dr) * cols + t.baseCol + dc);
  return out;
}

/** 한 틱(1/60초) 진행 */
export function stepGame(g: Game, cmds: readonly Command[] = []): void {
  if (g.over) return;
  for (const c of cmds) applyCommand(g, c);
  updateGates(g);
  updateCannons(g);
  updateGuards(g);
  indexUnits(g);
  updateBalls(g);
  if (!g.over) updateUnits(g);
  if (!g.over) updateBombs(g);
  if (!g.over) clashBalls(g);
  g.balls.compact();
  cleanupUnits(g);
  g.time += TICK;
  g.tick++;
  if (!g.over) {
    if (!g.fever && g.duration - g.time <= FEVER_TIME) {
      g.fever = true;
      g.events.push({ t: 'fever' });
    }
    if (g.time >= g.duration) {
      finishByTime(g);
      g.balls.compact();
      cleanupUnits(g);
    }
  }
}

export function applyCommand(g: Game, c: Command): void {
  const tm = g.teams[c.team];
  if (!tm || !tm.alive || g.over) return;
  if (c.type === 'aim') {
    const x = clamp(c.x, 0, g.cols);
    const z = clamp(c.z, 0, g.rows);
    tm.aimX = x;
    tm.aimZ = z;
    const dx = x - tm.cx;
    const dz = z - tm.cz;
    if (dx * dx + dz * dz > 0.25) tm.targetAngle = Math.atan2(dz, dx);
  } else {
    playCard(g, tm, c.card, c.x ?? tm.aimX, c.z ?? tm.aimZ);
  }
}

// ───────────────────────── 카드 ─────────────────────────

export function cardState(g: Game, team: number, card: CardId): { affordable: boolean; ready: boolean; cooldown: number } {
  const tm = g.teams[team];
  const def = CARD[card];
  const left = tm.cardReady[card] - g.time;
  return { affordable: tm.points >= def.cost, ready: left <= 0, cooldown: left > 0 ? left / def.cooldown : 0 };
}

export function playCard(g: Game, tm: TeamState, card: CardId, x: number, z: number): boolean {
  if (!tm.alive || g.over || !tm.cards.includes(card)) return false;
  const def = CARD[card];
  if (tm.points < def.cost || g.time < tm.cardReady[card]) return false;
  const tx = clamp(x, 0.5, g.cols - 0.5);
  const tz = clamp(z, 0.5, g.rows - 0.5);
  switch (card) {
    case 'soldiers':
      deploySquad(g, tm, SOLDIER, SQUAD_SIZE, tx, tz);
      break;
    case 'tank':
      deploySquad(g, tm, TANK, 1, tx, tz);
      break;
    case 'bomb':
      g.bombs.push({ team: tm.id, x: tx, z: tz, at: g.time + BOMB_DELAY });
      g.events.push({ t: 'bombDrop', team: tm.id, x: tx, z: tz });
      break;
    case 'rapid':
      tm.rapidUntil = g.time + RAPID_TIME;
      break;
    case 'freeze':
      for (const o of g.teams) if (o !== tm && o.alive) o.frozenUntil = Math.max(o.frozenUntil, g.time + FREEZE_TIME);
      break;
    case 'mega': {
      const c = Math.cos(tm.angle);
      const s = Math.sin(tm.angle);
      if (g.balls.add(tm.id, tm.cx + c * MUZZLE, tm.cz + s * MUZZLE, c * MEGA_SPEED, s * MEGA_SPEED, MEGA_POWER, 0, 1, 9) < 0) return false;
      break;
    }
  }
  tm.points -= def.cost;
  tm.cardReady[card] = g.time + def.cooldown;
  tm.cardsUsed++;
  g.events.push({ t: 'card', team: tm.id, card });
  return true;
}

// ───────────────────────── 팻말 ─────────────────────────

function updateGates(g: Game): void {
  for (const gt of g.gates) {
    if (gt.moveAmp) {
      const s = Math.sin(g.time * gt.moveSpeed);
      gt.x = gt.x0 + gt.cos * gt.moveAmp * s;
      gt.z = gt.z0 + gt.sin * gt.moveAmp * s;
    }
    const c = clamp(Math.floor(gt.x), 0, g.cols - 1);
    const r = clamp(Math.floor(gt.z), 0, g.rows - 1);
    const o = g.owner[r * g.cols + c];
    gt.owner = o >= 0 ? o : NEUTRAL;
  }
}

export function gateUsable(gt: Gate, team: number): boolean {
  return gt.owner === NEUTRAL || gt.owner === team;
}

/** (x0,z0)→(x1,z1) 이동이 팻말 선분을 가로지르는지 */
export function crossesGate(gt: Gate, x0: number, z0: number, x1: number, z1: number): boolean {
  const v0 = -(x0 - gt.x) * gt.sin + (z0 - gt.z) * gt.cos;
  const v1 = -(x1 - gt.x) * gt.sin + (z1 - gt.z) * gt.cos;
  if (v0 >= 0 === v1 >= 0) return false;
  const t = v0 / (v0 - v1);
  const u = (x0 + (x1 - x0) * t - gt.x) * gt.cos + (z0 + (z1 - z0) * t - gt.z) * gt.sin;
  return Math.abs(u) <= gt.width;
}

function passGatesBall(g: Game, i: number, x0: number, z0: number, x1: number, z1: number, vx: number, vz: number): void {
  const B = g.balls;
  for (const gt of g.gates) {
    const bit = 1 << gt.id;
    if (B.mask[i] & bit) continue;
    if (!crossesGate(gt, x0, z0, x1, z1)) continue;
    B.mask[i] |= bit;
    if (gt.op !== 'mul' || B.kind[i] !== 0) continue;
    const team = B.team[i];
    if (!gateUsable(gt, team)) continue;
    const extra = gt.value - 1;
    const speed = Math.hypot(vx, vz);
    const a0 = Math.atan2(vz, vx);
    // 늘어난 공은 부채꼴로 넓게 퍼짐 (한 줄로 몰리면 기지까지 좁은 굴이 순식간에 뚫림)
    const fan = Math.min(0.8, 0.22 * extra);
    const half = Math.ceil(extra / 2);
    for (let k = 1; k <= extra; k++) {
      const side = k % 2 ? 1 : -1;
      const a = a0 + side * Math.ceil(k / 2) * (fan / half) + g.rng.range(-0.06, 0.06);
      const j = B.add(team, x1, z1, Math.cos(a) * speed, Math.sin(a) * speed, B.power[i], B.mask[i], 0, B.life[i]);
      if (j < 0) break;
      B.bounce[j] = B.bounce[i];
    }
    gt.hits += gt.value;
    gt.flash = g.time;
  }
}

/** + 팻말: 지나간 용병 무리에 병사가 더해짐 (무리마다 한 번). × 팻말은 공에만 적용 */
function passGatesUnit(g: Game, u: Unit, x0: number, z0: number, x1: number, z1: number): void {
  for (const gt of g.gates) {
    if (gt.op !== 'add') continue;
    if (!crossesGate(gt, x0, z0, x1, z1) || !gateUsable(gt, u.team)) continue;
    const bit = 1 << gt.id;
    if (u.squad.addMask & bit) continue;
    u.squad.addMask |= bit;
    const tm = g.teams[u.team];
    let added = 0;
    for (let k = 0; k < gt.value; k++) {
      const v = addUnit(g, tm, SOLDIER, x1 + g.rng.range(-0.5, 0.5), z1 + g.rng.range(-0.5, 0.5), u.squad, u.mask);
      if (!v) break;
      v.wpDone = u.wpDone;
      v.face = u.face;
      added++;
    }
    if (added) {
      gt.hits += added;
      gt.flash = g.time;
      g.events.push({ t: 'gate', gate: gt.id, team: u.team, n: added });
    }
  }
}

// ───────────────────────── 대포·공 ─────────────────────────

function updateCannons(g: Game): void {
  for (const tm of g.teams) {
    if (!tm.alive) continue;
    const d = wrapAngle(tm.targetAngle - tm.angle);
    const maxTurn = tm.stats.turnSpeed * TICK;
    tm.angle = wrapAngle(tm.angle + clamp(d, -maxTurn, maxTurn));
    if (g.time < tm.frozenUntil) continue;
    let interval = tm.stats.fireInterval;
    if (g.time < tm.rapidUntil) interval *= RAPID_MUL;
    if (g.fever) interval /= FEVER_FIRE;
    tm.fireTimer -= TICK;
    let shots = 0;
    while (tm.fireTimer <= 0 && shots < 4) {
      fire(g, tm);
      tm.fireTimer += interval;
      shots++;
    }
    if (tm.fireTimer < 0) tm.fireTimer = 0;
  }
}

/** 기지 방어: 기지 옆까지 파고든 남의 칸을 조금씩 되찾음 (기지까지 뚫린 굴이 바로 끝판이 되지 않게) */
function updateGuards(g: Game): void {
  for (const tm of g.teams) {
    if (!tm.alive) continue;
    tm.guardTimer -= TICK;
    if (tm.guardTimer > 0) continue;
    tm.guardTimer += GUARD_INTERVAL;
    const R = Math.ceil(GUARD_RADIUS);
    let best = -1;
    let bd = Infinity;
    for (let r = Math.max(0, Math.floor(tm.cz) - R); r <= Math.min(g.rows - 1, Math.floor(tm.cz) + R); r++) {
      for (let c = Math.max(0, Math.floor(tm.cx) - R); c <= Math.min(g.cols - 1, Math.floor(tm.cx) + R); c++) {
        const i = r * g.cols + c;
        const o = g.owner[i];
        if (o === WALL || o === tm.id || g.baseOf[i] >= 0) continue;
        const d = Math.hypot(c + 0.5 - tm.cx, r + 0.5 - tm.cz);
        if (d <= GUARD_RADIUS && d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    if (best >= 0) {
      flipTile(g, best, tm.id, 0, false);
      g.events.push({ t: 'guard', team: tm.id, tile: best });
    }
  }
}

function fire(g: Game, tm: TeamState): void {
  const { multishot, spread, ballSpeed, pierce } = tm.stats;
  for (let k = 0; k < multishot; k++) {
    const a = tm.angle + (k - (multishot - 1) / 2) * 0.1 + g.rng.range(-spread, spread);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const power = pierce > 0 && g.rng.next() < pierce ? 2 : 1;
    g.balls.add(tm.id, tm.cx + c * MUZZLE, tm.cz + s * MUZZLE, c * ballSpeed, s * ballSpeed, power, 0, 0, BALL_LIFE);
  }
  tm.shots++;
  g.events.push({ t: 'shot', team: tm.id });
}

function updateBalls(g: Game): void {
  const B = g.balls;
  for (let i = B.n - 1; i >= 0; i--) {
    if (g.over) break;
    if (B.dead[i]) continue;
    B.life[i] -= TICK;
    if (B.life[i] <= 0 || !stepBall(g, i)) B.dead[i] = 1;
  }
}

/** 공 하나를 한 틱 움직임. 사라지면 false */
function stepBall(g: Game, i: number): boolean {
  const B = g.balls;
  const cols = g.cols;
  const rows = g.rows;
  const owner = g.owner;
  const team = B.team[i];
  const mega = B.kind[i] === 1;
  const hitR = mega ? MEGA_RADIUS : BALL_RADIUS;
  let x = B.x[i];
  let z = B.z[i];
  let vx = B.vx[i];
  let vz = B.vz[i];
  let bounce = B.bounce[i];
  const steps = Math.max(1, Math.ceil((Math.hypot(vx, vz) * TICK) / 0.4));
  const h = TICK / steps;
  for (let s = 0; s < steps; s++) {
    let nx = x + vx * h;
    let nz = z + vz * h;
    if (nx < 0.02) {
      nx = 0.04 - nx;
      vx = -vx;
      bounce++;
    } else if (nx > cols - 0.02) {
      nx = 2 * (cols - 0.02) - nx;
      vx = -vx;
      bounce++;
    }
    if (nz < 0.02) {
      nz = 0.04 - nz;
      vz = -vz;
      bounce++;
    } else if (nz > rows - 0.02) {
      nz = 2 * (rows - 0.02) - nz;
      vz = -vz;
      bounce++;
    }
    if (g.gates.length) passGatesBall(g, i, x, z, nx, nz, vx, vz);
    // 적 용병에 맞음 (발밑 칸보다 먼저)
    if (g.units.length) {
      const u = unitAt(g, nx, nz, team, hitR);
      if (u) {
        if (mega) {
          u.hp = 0;
          g.teams[team].kills++;
          B.power[i] -= 3;
          if (B.power[i] <= 0) return false;
        } else {
          u.hp -= BALL_UNIT_DAMAGE;
          if (u.hp <= 0) g.teams[team].kills++;
          return false;
        }
      }
    }
    const c = nx | 0;
    const r = nz | 0;
    const idx = r * cols + c;
    const o = owner[idx];
    if (o === WALL) {
      const pc = x | 0;
      const pr = z | 0;
      if (pc !== c) vx = -vx;
      if (pr !== r) vz = -vz;
      if (pc === c && pr === r) {
        vx = -vx;
        vz = -vz;
      }
      bounce++;
      continue;
    }
    if (o !== team) {
      if (mega) {
        if (!megaHit(g, i, nx, nz)) return false;
      } else {
        const bt = g.baseOf[idx];
        if (bt >= 0) {
          damageBase(g, bt, team, BALL_BASE_DAMAGE * B.power[i]);
          return false;
        }
        if (g.tileHp[idx] <= 1) flipTile(g, idx, team, 0, true);
        else {
          g.tileHp[idx]--;
          g.events.push({ t: 'chip', tile: idx, team });
        }
        B.power[i]--;
        if (B.power[i] <= 0) return false;
      }
    }
    x = nx;
    z = nz;
  }
  if (bounce > MAX_BOUNCES) return false;
  B.x[i] = x;
  B.z[i] = z;
  B.vx[i] = vx;
  B.vz[i] = vz;
  B.bounce[i] = bounce;
  return true;
}

/** 거대 공: 둘레 칸을 뒤집으며 힘이 줄어듦 */
function megaHit(g: Game, i: number, x: number, z: number): boolean {
  const B = g.balls;
  const team = B.team[i];
  const c0 = Math.max(0, Math.floor(x - 1));
  const c1 = Math.min(g.cols - 1, Math.floor(x + 1));
  const r0 = Math.max(0, Math.floor(z - 1));
  const r1 = Math.min(g.rows - 1, Math.floor(z + 1));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const dx = c + 0.5 - x;
      const dz = r + 0.5 - z;
      if (dx * dx + dz * dz > 1.2) continue;
      const idx = r * g.cols + c;
      const o = g.owner[idx];
      if (o === WALL || o === team) continue;
      const bt = g.baseOf[idx];
      if (bt >= 0) {
        damageBase(g, bt, team, MEGA_BASE_DAMAGE);
        return false;
      }
      flipTile(g, idx, team, 0, true);
      B.power[i]--;
    }
  }
  return B.power[i] > 0;
}

/** 서로 다른 팀 공이 부딪히면 둘 다 사라짐 (거대 공은 작은 공을 흡수) */
function clashBalls(g: Game): void {
  const B = g.balls;
  if (B.n < 2) return;
  const cols = g.cols;
  const rows = g.rows;
  const head = g.cellHead;
  const next = g.cellNext;
  head.fill(-1);
  for (let i = 0; i < B.n; i++) {
    if (B.dead[i]) continue;
    const cell = Math.min(rows - 1, B.z[i] | 0) * cols + Math.min(cols - 1, B.x[i] | 0);
    next[i] = head[cell];
    head[cell] = i;
  }
  const clash2 = CLASH_DIST * CLASH_DIST;
  const megaClash = (MEGA_RADIUS + BALL_RADIUS) ** 2;
  let fx = 0;
  for (let i = 0; i < B.n; i++) {
    if (B.dead[i]) continue;
    const ti = B.team[i];
    const xi = B.x[i];
    const zi = B.z[i];
    const c = xi | 0;
    const r = zi | 0;
    cells: for (let rr = r - 1; rr <= r + 1; rr++) {
      if (rr < 0 || rr >= rows) continue;
      for (let cc = c - 1; cc <= c + 1; cc++) {
        if (cc < 0 || cc >= cols) continue;
        for (let j = head[rr * cols + cc]; j >= 0; j = next[j]) {
          if (j === i || B.dead[j] || B.team[j] === ti) continue;
          const dx = B.x[j] - xi;
          const dz = B.z[j] - zi;
          const mi = B.kind[i] === 1;
          const mj = B.kind[j] === 1;
          if (dx * dx + dz * dz > (mi || mj ? megaClash : clash2)) continue;
          if (mi && !mj) {
            B.dead[j] = 1;
            if (--B.power[i] <= 0) B.dead[i] = 1;
          } else if (mj && !mi) {
            B.dead[i] = 1;
            if (--B.power[j] <= 0) B.dead[j] = 1;
          } else {
            B.dead[i] = 1;
            B.dead[j] = 1;
          }
          if (fx < 10) {
            g.events.push({ t: 'clash', x: (xi + B.x[j]) / 2, z: (zi + B.z[j]) / 2 });
            fx++;
          }
          if (B.dead[i]) break cells;
        }
      }
    }
  }
}

// ───────────────────────── 땅·기지 ─────────────────────────

/** 칸을 team 색으로 뒤집음. count가 false면 점수·통계에 넣지 않음 (탈락·승리 연출) */
export function flipTile(g: Game, idx: number, team: number, delay: number, count: boolean): void {
  const from = g.owner[idx];
  if (from === team || from === WALL) return;
  if (from >= 0) g.teams[from].tiles--;
  g.owner[idx] = team;
  g.tileHp[idx] = TILE_HP;
  const tm = g.teams[team];
  tm.tiles++;
  if (count) {
    tm.flips++;
    const p = (g.fever ? FEVER_POINTS : 1) * tm.stats.pointMul;
    tm.points += p;
    tm.earned += p;
  }
  if (g.gold[idx]) {
    g.gold[idx] = 0;
    if (count) {
      tm.points += GOLD_POINTS;
      tm.earned += GOLD_POINTS;
      tm.gold++;
      g.events.push({ t: 'gold', tile: idx, team });
    }
  }
  g.events.push({ t: 'flip', tile: idx, from, to: team, delay });
}

function damageBase(g: Game, team: number, by: number, dmg: number): void {
  const tm = g.teams[team];
  if (!tm.alive || g.over) return;
  const before = Math.ceil(tm.hp);
  tm.hp = Math.max(0, tm.hp - dmg);
  if (Math.ceil(tm.hp) !== before) g.events.push({ t: 'baseHit', team, by, hp: tm.hp });
  if (tm.hp <= 0) eliminate(g, team, by);
}

function eliminate(g: Game, team: number, by: number): void {
  const tm = g.teams[team];
  if (!tm.alive) return;
  tm.alive = false;
  tm.eliminatedAt = g.time;
  tm.eliminatedBy = by;
  tm.hp = 0;
  for (let i = 0; i < g.n; i++) {
    if (g.baseOf[i] === team) g.baseOf[i] = -1;
    if (g.owner[i] === team) {
      const c = i % g.cols;
      const r = (i - c) / g.cols;
      flipTile(g, i, by, Math.hypot(c + 0.5 - tm.cx, r + 0.5 - tm.cz) * 0.03, false);
    }
  }
  const w = g.teams[by];
  if (w && w.alive) {
    w.points += KO_BONUS;
    w.earned += KO_BONUS;
  }
  const B = g.balls;
  for (let i = 0; i < B.n; i++) if (B.team[i] === team) B.dead[i] = 1;
  for (const u of g.units) if (u.team === team) u.hp = 0;
  g.teams.forEach((o) => {
    if (o.alive && o.aiNext > g.time) o.aiNext = g.time;
  });
  g.events.push({ t: 'eliminated', team, by });
  checkWinner(g);
}

function checkWinner(g: Game): void {
  const alive = g.teams.filter((t) => t.alive);
  if (alive.length <= 1) {
    finish(g, alive[0]?.id ?? -1, 'ko');
    return;
  }
  // 사람이 모두 탈락하면 끝냄 (AI끼리 싸우는 걸 기다리지 않음)
  const hadHuman = g.teams.some((t) => t.control === 'human');
  if (g.level.mode !== 'demo' && hadHuman && !alive.some((t) => t.control === 'human')) {
    const best = alive.reduce((a, b) => (b.tiles > a.tiles ? b : a));
    finish(g, best.id, 'ko');
  }
}

function finishByTime(g: Game): void {
  let best: TeamState | null = null;
  let tie = false;
  for (const t of g.teams) {
    if (!t.alive) continue;
    if (!best || t.tiles > best.tiles) {
      best = t;
      tie = false;
    } else if (t.tiles === best.tiles) {
      if (t.hp / t.maxHp > best.hp / best.maxHp) best = t;
      else if (t.hp / t.maxHp === best.hp / best.maxHp) tie = true;
    }
  }
  finish(g, tie || !best ? -1 : best.id, 'time');
}

function finish(g: Game, winner: number, reason: 'ko' | 'time'): void {
  if (g.over) return;
  g.over = true;
  g.winner = winner;
  g.endReason = reason;
  const score = (t: TeamState) => (t.id === winner ? 1e9 : t.alive ? 1e6 + t.tiles : t.eliminatedAt);
  [...g.teams].sort((a, b) => score(b) - score(a)).forEach((t, k) => (t.rank = k + 1));
  if (winner >= 0 && reason === 'ko') {
    // 판 전체가 승자 색으로 뒤집힘 (승자 기지에서 퍼져 나감)
    const w = g.teams[winner];
    for (let i = 0; i < g.n; i++) {
      const o = g.owner[i];
      if (o === WALL || o === winner) continue;
      const c = i % g.cols;
      const r = (i - c) / g.cols;
      g.baseOf[i] = g.baseOf[i] === winner ? winner : -1;
      flipTile(g, i, winner, 0.45 + Math.hypot(c + 0.5 - w.cx, r + 0.5 - w.cz) * 0.028, false);
    }
  }
  const B = g.balls;
  for (let i = 0; i < B.n; i++) B.dead[i] = 1;
  for (const u of g.units) u.hp = 0;
  g.bombs.length = 0;
  g.events.push({ t: 'end', winner });
}

// ───────────────────────── 폭탄 ─────────────────────────

function updateBombs(g: Game): void {
  for (let i = g.bombs.length - 1; i >= 0; i--) {
    const b = g.bombs[i];
    if (g.time < b.at) continue;
    g.bombs.splice(i, 1);
    explode(g, b.team, b.x, b.z, BOMB_RADIUS);
    if (g.over) return;
  }
}

function explode(g: Game, team: number, x: number, z: number, radius: number): void {
  const tm = g.teams[team];
  if (!tm.alive) return;
  g.events.push({ t: 'explode', x, z, r: radius, team });
  const r2 = radius * radius;
  const c0 = Math.max(0, Math.floor(x - radius));
  const c1 = Math.min(g.cols - 1, Math.floor(x + radius));
  const r0 = Math.max(0, Math.floor(z - radius));
  const r1 = Math.min(g.rows - 1, Math.floor(z + radius));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const dx = c + 0.5 - x;
      const dz = r + 0.5 - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      const i = r * g.cols + c;
      const o = g.owner[i];
      if (o === WALL || o === team || g.baseOf[i] >= 0) continue;
      flipTile(g, i, team, Math.sqrt(d2) * 0.05, true);
    }
  }
  const B = g.balls;
  for (let i = 0; i < B.n; i++) {
    if (B.dead[i] || B.team[i] === team) continue;
    const dx = B.x[i] - x;
    const dz = B.z[i] - z;
    if (dx * dx + dz * dz <= r2) B.dead[i] = 1;
  }
  for (const u of g.units) {
    if (u.team === team || u.hp <= 0) continue;
    const dx = u.x - x;
    const dz = u.z - z;
    if (dx * dx + dz * dz > r2) continue;
    u.hp -= u.kind === TANK ? 20 : 99;
    if (u.hp <= 0) tm.kills++;
  }
  for (const o of g.teams) {
    if (o === tm || !o.alive) continue;
    if (Math.hypot(o.cx - x, o.cz - z) <= radius + 1) damageBase(g, o.id, team, BOMB_BASE_DAMAGE);
    if (g.over) return;
  }
}

// ───────────────────────── 용병 ─────────────────────────

function nearestOpenCell(g: Game, x: number, z: number): number {
  const c0 = clamp(Math.floor(x), 0, g.cols - 1);
  const r0 = clamp(Math.floor(z), 0, g.rows - 1);
  for (let rad = 0; rad < Math.max(g.cols, g.rows); rad++) {
    let best = -1;
    let bestD = Infinity;
    for (let r = r0 - rad; r <= r0 + rad; r++) {
      for (let c = c0 - rad; c <= c0 + rad; c++) {
        if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) continue;
        if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== rad) continue;
        const i = r * g.cols + c;
        if (g.owner[i] === WALL) continue;
        const d = (c + 0.5 - x) ** 2 + (r + 0.5 - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    if (best >= 0) return best;
  }
  return 0;
}

function isWall(g: Game, x: number, z: number): boolean {
  const c = Math.floor(x);
  const r = Math.floor(z);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return true;
  return g.owner[r * g.cols + c] === WALL;
}

function deploySquad(g: Game, tm: TeamState, kind: number, count: number, wx: number, wz: number): void {
  const squad: Squad = { id: g.nextId++, addMask: 0, path: null, wx, wz };
  const d = Math.hypot(wx - tm.cx, wz - tm.cz);
  if (d > 2.6) squad.path = distanceField(g.cols, g.rows, g.owner, [nearestOpenCell(g, wx, wz)]);
  const a = d > 0.3 ? Math.atan2(wz - tm.cz, wx - tm.cx) : tm.angle;
  for (let k = 0; k < count; k++) {
    const ang = a + (count > 1 ? g.rng.range(-0.8, 0.8) : 0);
    const rr = kind === TANK ? 1.7 : 1.3 + g.rng.range(0, 0.55);
    let x = clamp(tm.cx + Math.cos(ang) * rr, 0.3, g.cols - 0.3);
    let z = clamp(tm.cz + Math.sin(ang) * rr, 0.3, g.rows - 0.3);
    if (isWall(g, x, z)) {
      x = tm.cx;
      z = tm.cz;
    }
    const u = addUnit(g, tm, kind, x, z, squad, 0);
    if (u) u.face = a;
  }
}

function addUnit(g: Game, tm: TeamState, kind: number, x: number, z: number, squad: Squad, mask: number): Unit | null {
  if (tm.units >= MAX_UNITS_PER_TEAM || g.units.length >= UNIT_CAP) return null;
  const def = UNITS[kind];
  if (isWall(g, x, z)) {
    x = clamp(x, 0.3, g.cols - 0.3);
    z = clamp(z, 0.3, g.rows - 0.3);
    if (isWall(g, x, z)) return null;
  }
  const hp = def.hp * tm.stats.unitHp;
  const u: Unit = {
    id: g.nextId++,
    team: tm.id,
    kind,
    x: clamp(x, 0.2, g.cols - 0.2),
    z: clamp(z, 0.2, g.rows - 0.2),
    vx: 0,
    vz: 0,
    hp,
    maxHp: hp,
    mask,
    squad,
    wpDone: squad.path === null,
    target: -1,
    retarget: 0,
    fighting: false,
    attacking: false,
    face: tm.angle,
  };
  g.units.push(u);
  tm.units++;
  return u;
}

/** 공 판정용: 칸마다 서 있는 용병 목록 */
function indexUnits(g: Game): void {
  const U = g.units;
  if (!U.length) return;
  g.unitHead.fill(-1);
  g.unitMap.fill(-1);
  for (let i = 0; i < U.length && i < UNIT_CAP; i++) {
    const u = U[i];
    if (u.hp <= 0) continue;
    const cell = Math.min(g.rows - 1, u.z | 0) * g.cols + Math.min(g.cols - 1, u.x | 0);
    g.unitNext[i] = g.unitHead[cell];
    g.unitHead[cell] = i;
    g.unitMap[cell] = u.team;
  }
}

/** (x,z) 가까이에 있는 적 용병 */
function unitAt(g: Game, x: number, z: number, team: number, r: number): Unit | null {
  const c = x | 0;
  const rr0 = z | 0;
  for (let rr = rr0 - 1; rr <= rr0 + 1; rr++) {
    if (rr < 0 || rr >= g.rows) continue;
    for (let cc = c - 1; cc <= c + 1; cc++) {
      if (cc < 0 || cc >= g.cols) continue;
      for (let j = g.unitHead[rr * g.cols + cc]; j >= 0; j = g.unitNext[j]) {
        const u = g.units[j];
        if (!u || u.team === team || u.hp <= 0) continue;
        const lim = UNITS[u.kind].hitbox + r;
        const dx = u.x - x;
        const dz = u.z - z;
        if (dx * dx + dz * dz <= lim * lim) return u;
      }
    }
  }
  return null;
}

function nearestEnemy(g: Game, u: Unit): number {
  const cell = clamp(u.z | 0, 0, g.rows - 1) * g.cols + clamp(u.x | 0, 0, g.cols - 1);
  let best = -1;
  let bestD = Infinity;
  for (const t of g.teams) {
    if (!t.alive || t.id === u.team) continue;
    const d = g.fields[t.id][cell];
    if (d < bestD) {
      bestD = d;
      best = t.id;
    }
  }
  return best;
}

function touchingBase(u: Unit, t: TeamState): boolean {
  const qx = clamp(u.x, t.baseCol, t.baseCol + 2);
  const qz = clamp(u.z, t.baseRow, t.baseRow + 2);
  return Math.hypot(u.x - qx, u.z - qz) <= UNITS[u.kind].radius + 0.4;
}

function updateUnits(g: Game): void {
  const U = g.units;
  for (let i = 0; i < U.length; i++) {
    if (g.over) return;
    const u = U[i];
    if (u.hp > 0) stepUnit(g, u);
  }
  if (!g.over) separateAndFight(g);
}

function stepUnit(g: Game, u: Unit): void {
  const def = UNITS[u.kind];
  let dx = 0;
  let dz = 0;
  u.attacking = false;
  if (!u.wpDone && u.squad.path) {
    if (Math.hypot(u.x - u.squad.wx, u.z - u.squad.wz) < 1.0) u.wpDone = true;
    else if (fieldDir(g.cols, g.rows, g.owner, u.squad.path, u.x, u.z, dir)) {
      dx = dir.x;
      dz = dir.z;
    } else u.wpDone = true;
  }
  if (u.wpDone) {
    if (u.target < 0 || !g.teams[u.target].alive || g.tick >= u.retarget) {
      u.target = nearestEnemy(g, u);
      u.retarget = g.tick + 45;
    }
    if (u.target >= 0) {
      const tb = g.teams[u.target];
      if (touchingBase(u, tb)) {
        // 기지에 부딪혀 피해를 주고 사라짐
        u.attacking = true;
        u.hp = 0;
        damageBase(g, u.target, u.team, def.crash);
        return;
      }
      if (fieldDir(g.cols, g.rows, g.owner, g.fields[u.target], u.x, u.z, dir)) {
        dx = dir.x;
        dz = dir.z;
      }
    }
  }
  const speed = def.speed * (u.fighting ? 0.25 : 1);
  u.vx = dx * speed;
  u.vz = dz * speed;
  if (dx || dz) u.face = Math.atan2(dz, dx);
  const x0 = u.x;
  const z0 = u.z;
  moveUnit(g, u, u.vx * TICK, u.vz * TICK);
  if (g.gates.length && (u.x !== x0 || u.z !== z0)) passGatesUnit(g, u, x0, z0, u.x, u.z);
  flipUnder(g, u, def.flip);
}

function moveUnit(g: Game, u: Unit, mx: number, mz: number): void {
  let nx = clamp(u.x + mx, 0.2, g.cols - 0.2);
  let nz = clamp(u.z + mz, 0.2, g.rows - 0.2);
  if (isWall(g, nx, nz)) {
    if (!isWall(g, nx, u.z)) nz = u.z;
    else if (!isWall(g, u.x, nz)) nx = u.x;
    else return;
  }
  u.x = nx;
  u.z = nz;
}

function flipUnder(g: Game, u: Unit, radius: number): void {
  const c = u.x | 0;
  const r = u.z | 0;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const cc = c + dc;
      const rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= g.cols || rr >= g.rows) continue;
      const i = rr * g.cols + cc;
      const o = g.owner[i];
      if (o === u.team || o === WALL || g.baseOf[i] >= 0) continue;
      flipTile(g, i, u.team, 0, true);
    }
  }
}

/** 같은 편은 서로 밀어내고, 적과 닿으면 싸움 */
function separateAndFight(g: Game): void {
  const U = g.units;
  const n = U.length;
  for (let i = 0; i < n; i++) U[i].fighting = false;
  for (let i = 0; i < n; i++) {
    const a = U[i];
    if (a.hp <= 0) continue;
    const ra = UNITS[a.kind].radius;
    for (let j = i + 1; j < n; j++) {
      const b = U[j];
      if (b.hp <= 0) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const min = ra + UNITS[b.kind].radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= (min + 0.15) * (min + 0.15)) continue;
      if (a.team === b.team) {
        if (d2 < min * min && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          const px = (dx / d) * push;
          const pz = (dz / d) * push;
          moveUnit(g, a, -px, -pz);
          moveUnit(g, b, px, pz);
        }
      } else {
        a.fighting = true;
        b.fighting = true;
        const ah = a.hp;
        const bh = b.hp;
        a.hp -= UNITS[b.kind].dps * TICK;
        b.hp -= UNITS[a.kind].dps * TICK;
        if (ah > 0 && a.hp <= 0) g.teams[b.team].kills++;
        if (bh > 0 && b.hp <= 0) g.teams[a.team].kills++;
      }
    }
  }
}

function cleanupUnits(g: Game): void {
  const U = g.units;
  let w = 0;
  for (let i = 0; i < U.length; i++) {
    const u = U[i];
    if (u.hp > 0) U[w++] = u;
    else {
      g.teams[u.team].units--;
      g.events.push({ t: 'unitDown', x: u.x, z: u.z, team: u.team, kind: u.kind });
    }
  }
  U.length = w;
}

// ───────────────────────── 보조 ─────────────────────────

/** 팀별 땅 비율 (벽 제외 전체 칸 기준) */
export function shares(g: Game): number[] {
  return g.teams.map((t) => t.tiles / g.playable);
}

export function neutralTiles(g: Game): number {
  let n = g.playable;
  for (const t of g.teams) n -= t.tiles;
  return n;
}

/** 재현 확인용 해시 */
export function stateHash(g: Game): number {
  let h = 2166136261;
  const mix = (v: number) => {
    h ^= v & 0xffffffff;
    h = Math.imul(h, 16777619);
  };
  for (let i = 0; i < g.n; i++) mix(g.owner[i] + 3);
  mix(g.balls.n);
  mix(g.units.length);
  for (const t of g.teams) {
    mix(Math.round(t.points * 100));
    mix(Math.round(t.hp * 100));
    mix(t.tiles);
  }
  mix(g.rng.state);
  return h >>> 0;
}
