// 판 만들기: 모험(라운드마다 강해지는 적·보스·1대2), 4인 난투, 같이 하기(한 기기 2~4명), 타이틀 배경 대전.
// 같은 라운드는 늘 같은 판이 나오도록 라운드 번호로 시드를 정함.

import { NEUTRAL, WALL } from './constants';
import { distanceField } from './flow';
import {
  cardsForRound,
  emptyUpgrades,
  enemyAi,
  enemyHp,
  enemyStats,
  playerHp,
  playerStartPoints,
  playerStats,
  type Upgrades,
} from './progress';
import { Rng } from './rng';
import type { AiProfile, CannonStats, ColorKey, GateDef, LevelDef, Side, TeamSetup } from './types';

export type Seat = 'human' | 'ai' | 'off';

const SIDE_ORDER: readonly Side[] = ['bottom', 'top', 'left', 'right'];
const ARENA_COLORS: readonly ColorKey[] = ['blue', 'red', 'green', 'amber'];

// ───────────────────────── 모험 ─────────────────────────

export function adventureLevel(round: number, up: Upgrades = emptyUpgrades()): LevelDef {
  const r = Math.max(1, Math.floor(round));
  const rng = new Rng(0x51f0 + r * 7919);
  const boss = r % 5 === 0;
  const duo = !boss && r >= 7 && r % 5 === 2;
  const cols = r < 4 ? 13 : 15;
  const rows = r < 4 ? 21 : r < 9 ? 23 : 25;
  const tiles = new Int8Array(cols * rows);
  // 내 땅 비율이 라운드마다 조금씩 줄어듦
  const share = Math.max(0.4, 0.5 - 0.006 * (r - 1));
  const split = Math.round(rows * (1 - share));
  const band = r === 1 ? 0 : r % 3 === 2 ? 3 : r % 3 === 0 ? 2 : 0;
  const b0 = split - Math.ceil(band / 2);
  const b1 = split + Math.floor(band / 2);
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) {
      let o = row >= split ? 0 : duo ? (c * 2 + 1 < cols ? 1 : 2) : 1;
      if (row >= b0 && row < b1) o = NEUTRAL;
      tiles[row * cols + c] = o;
    }
  }
  const pCol = (cols >> 1) - 1;
  const player = { baseCol: pCol, baseRow: rows - 3 };
  const enemies = duo
    ? [
        { baseCol: 2, baseRow: 1 },
        { baseCol: cols - 4, baseRow: 1 },
      ]
    : [{ baseCol: cols - 2 - pCol, baseRow: 1 }];

  const gates: GateDef[] = [];
  const pcx = player.baseCol + 1;
  const pcz = player.baseRow + 1;
  // 내 대포 앞 × 팻말
  gates.push({ x: pcx, z: pcz - 3.4, width: 1.45, angle: 0, op: 'mul', value: 2 });
  if (r >= 2) {
    for (const e of enemies) gates.push({ x: e.baseCol + 1, z: e.baseRow + 1 + 3.4, width: 1.45, angle: 0, op: 'mul', value: 2 });
  }
  const midZ = band ? (b0 + b1) / 2 : split;
  if (r >= 2) {
    gates.push({ x: cols / 2, z: midZ, width: 1.5, angle: 0, op: 'mul', value: r >= 8 ? 3 : 2, moveAmp: r >= 4 ? cols / 2 - 2.8 : 0, moveSpeed: 0.55 });
  }
  if (r >= 3) {
    // 용병용 + 팻말: 내 쪽 왼편, 적 쪽 오른편 (점대칭)
    const v = r >= 6 ? 5 : 3;
    gates.push({ x: 2.8, z: rows * 0.66, width: 1.3, angle: 0, op: 'add', value: v });
    gates.push({ x: cols - 2.8, z: rows * 0.34, width: 1.3, angle: 0, op: 'add', value: v });
  }

  if (r >= 3) {
    const mz = Math.floor(rows / 2);
    const pattern = rng.int(0, 3);
    const cells: [number, number][] = [];
    switch (pattern) {
      case 0:
        cells.push([1, mz + 3], [2, mz + 3], [cols - 3, mz + 3], [cols - 2, mz + 3]);
        break;
      case 1:
        cells.push([3, mz + 2], [cols - 4, mz + 2], [(cols >> 1) - 1, mz + 4], [cols >> 1, mz + 4]);
        break;
      case 2:
        cells.push([2, mz + 1], [3, mz + 2], [cols - 3, mz + 1], [cols - 4, mz + 2]);
        break;
      default:
        cells.push([1, mz + 2], [cols - 2, mz + 2], [4, mz + 4], [cols - 5, mz + 4]);
    }
    placeWalls(tiles, cols, rows, cells, [player, ...enemies], gates);
  }

  const gold: number[] = [];
  if (r >= 3) {
    const want = 3 + Math.min(5, Math.floor(r / 3));
    for (let tries = 0; tries < 200 && gold.length < want; tries++) {
      const c = rng.int(1, cols - 2);
      const row = rng.int(3, split - 2);
      const i = row * cols + c;
      if (tiles[i] === WALL || gold.includes(i) || nearBase(c, row, [player, ...enemies], 2)) continue;
      gold.push(i);
    }
  }

  const teams: TeamSetup[] = [
    {
      control: 'human',
      name: '나',
      color: 'blue',
      side: 'bottom',
      ...player,
      stats: playerStats(up),
      hp: playerHp(up),
      startPoints: playerStartPoints(up),
      cards: cardsForRound(r),
    },
  ];
  enemies.forEach((e, k) => {
    const stats = enemyStats(r, boss);
    if (duo) stats.fireInterval /= 0.85;
    teams.push({
      control: 'ai',
      name: boss ? '보스' : duo ? `적 ${k + 1}` : '적',
      color: duo && k === 1 ? 'purple' : 'red',
      side: 'top',
      ...e,
      stats,
      hp: enemyHp(r, boss, duo),
      startPoints: 10 + 4 * r,
      cards: cardsForRound(Math.max(1, r - 1)),
      ai: enemyAi(r),
    });
  });
  return {
    mode: 'adventure',
    label: boss ? `라운드 ${r} · 보스전` : duo ? `라운드 ${r} · 1 대 2` : `라운드 ${r}`,
    round: r,
    boss,
    cols,
    rows,
    tiles,
    gold,
    gates,
    teams,
    duration: boss ? 110 : 90,
    seed: 0xa11ce + r * 104729,
  };
}

function nearBase(c: number, r: number, bases: readonly { baseCol: number; baseRow: number }[], m: number): boolean {
  return bases.some((b) => c >= b.baseCol - m && c <= b.baseCol + 1 + m && r >= b.baseRow - m && r <= b.baseRow + 1 + m);
}

/** 벽을 점대칭으로 놓되 기지·팻말 자리를 피하고, 기지끼리 길이 막히면 되돌림 */
function placeWalls(
  tiles: Int8Array,
  cols: number,
  rows: number,
  cells: readonly [number, number][],
  bases: readonly { baseCol: number; baseRow: number }[],
  gates: readonly GateDef[],
): void {
  const before = Int8Array.from(tiles);
  const onGate = (c: number, r: number) =>
    gates.some((g) => Math.abs(r + 0.5 - g.z) < 1.1 && Math.abs(c + 0.5 - g.x) < g.width + 1.2 + (g.moveAmp ?? 0));
  for (const [c, r] of cells) {
    for (const [cc, rr] of [
      [c, r],
      [cols - 1 - c, rows - 1 - r],
    ]) {
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
      if (nearBase(cc, rr, bases, 1) || onGate(cc, rr)) continue;
      tiles[rr * cols + cc] = WALL;
    }
  }
  if (!basesConnected(tiles, cols, rows, bases)) tiles.set(before);
}

function basesConnected(tiles: Int8Array, cols: number, rows: number, bases: readonly { baseCol: number; baseRow: number }[]): boolean {
  const f = distanceField(cols, rows, tiles, [bases[0].baseRow * cols + bases[0].baseCol]);
  return bases.every((b) => Number.isFinite(f[b.baseRow * cols + b.baseCol]));
}

// ───────────────────────── 4인 난투·같이 하기 ─────────────────────────

export interface ArenaOptions {
  mode: 'brawl' | 'local' | 'demo';
  /** 아래·위·왼쪽·오른쪽 자리 */
  seats: readonly Seat[];
  /** AI 세기 (모험 라운드 기준) */
  aiRound: number;
  /** 사람 자리에 적용할 강화 (난투는 내 강화, 같이 하기는 모두 똑같이) */
  up?: Upgrades;
  seed?: number;
}

/** 아래 팀 기준 좌표를 side 쪽으로 돌림 (판 가운데 기준) */
function rotate(side: Side, x: number, z: number): [number, number] {
  switch (side) {
    case 'bottom':
      return [x, z];
    case 'top':
      return [-x, -z];
    case 'left':
      return [-z, x];
    case 'right':
      return [z, -x];
  }
}

function sideAngle(side: Side): number {
  return side === 'bottom' || side === 'top' ? 0 : Math.PI / 2;
}

export function arenaLevel(o: ArenaOptions): LevelDef {
  const active = SIDE_ORDER.map((side, k) => ({ side, seat: o.seats[k] ?? 'off', color: ARENA_COLORS[k] })).filter((s) => s.seat !== 'off');
  // 아래·위 두 명이면 세로로 긴 판
  if (active.length === 2 && active[0].side === 'bottom' && active[1].side === 'top') return duelLevel(o, active);
  const S = 20;
  const half = S / 2;
  const tiles = new Int8Array(S * S);
  const teamOfSide = new Map<Side, number>();
  active.forEach((a, id) => teamOfSide.set(a.side, id));
  for (let r = 0; r < S; r++) {
    for (let c = 0; c < S; c++) {
      const dx = c + 0.5 - half;
      const dz = r + 0.5 - half;
      let v = NEUTRAL;
      if (Math.abs(dx) + Math.abs(dz) > 3 && Math.abs(Math.abs(dx) - Math.abs(dz)) > 0.01) {
        const side: Side = Math.abs(dz) > Math.abs(dx) ? (dz > 0 ? 'bottom' : 'top') : dx < 0 ? 'left' : 'right';
        v = teamOfSide.get(side) ?? NEUTRAL;
      }
      tiles[r * S + c] = v;
    }
  }
  for (const [c, r] of [
    [6, 6],
    [13, 6],
    [6, 13],
    [13, 13],
  ]) {
    tiles[r * S + c] = WALL;
  }
  const baseAt: Record<Side, { baseCol: number; baseRow: number }> = {
    bottom: { baseCol: half - 1, baseRow: S - 3 },
    top: { baseCol: half - 1, baseRow: 1 },
    left: { baseCol: 1, baseRow: half - 1 },
    right: { baseCol: S - 3, baseRow: half - 1 },
  };
  const gates: GateDef[] = [
    { x: half, z: half, width: 1.6, angle: 0, op: 'mul', value: 2 },
    { x: half, z: half, width: 1.6, angle: Math.PI / 2, op: 'mul', value: 2 },
  ];
  for (const a of active) {
    // 대포 앞 × 팻말, 앞 왼편 + 팻말 (아래 팀 기준 좌표를 각 자리로 돌림)
    const front = S - 2 - half - 3.4;
    const [fx, fz] = rotate(a.side, 0, front);
    gates.push({ x: half + fx, z: half + fz, width: 1.45, angle: sideAngle(a.side), op: 'mul', value: 2 });
    const [px, pz] = rotate(a.side, -2.6, 5.0);
    gates.push({ x: half + px, z: half + pz, width: 1.1, angle: sideAngle(a.side), op: 'add', value: 3 });
  }
  const teams = active.map((a) => seatSetup(o, a.seat, a.side, a.color, baseAt[a.side]));
  return {
    mode: o.mode,
    label: o.mode === 'brawl' ? '4인 난투' : o.mode === 'local' ? `같이 하기 · ${active.length}명` : '',
    round: o.aiRound,
    boss: false,
    cols: S,
    rows: S,
    tiles,
    gold: [],
    gates,
    teams,
    duration: o.mode === 'demo' ? 600 : 120,
    seed: o.seed ?? 0xb4a11 + o.aiRound * 31,
  };
}

function seatSetup(
  o: ArenaOptions,
  seat: Seat,
  side: Side,
  color: ColorKey,
  base: { baseCol: number; baseRow: number },
): TeamSetup {
  const round = Math.max(1, o.aiRound);
  const human = seat === 'human';
  const up = o.up ?? emptyUpgrades();
  let stats: CannonStats;
  let hp: number;
  let ai: AiProfile | undefined;
  if (human) {
    stats = playerStats(o.mode === 'local' ? emptyUpgrades() : up);
    hp = o.mode === 'local' ? 70 : playerHp(up);
  } else {
    stats = enemyStats(round, false);
    hp = o.mode === 'local' ? 70 : enemyHp(round, false, false) + 20;
    ai = enemyAi(round);
  }
  const names: Record<Side, string> = { bottom: 'P1', top: 'P2', left: 'P3', right: 'P4' };
  return {
    control: human ? 'human' : 'ai',
    name: o.mode === 'local' ? (human ? names[side] : `AI (${names[side]})`) : human ? '나' : `AI ${SIDE_ORDER.indexOf(side)}`,
    color,
    side,
    ...base,
    stats,
    hp,
    startPoints: human && o.mode !== 'local' ? playerStartPoints(up) : 30,
    cards: cardsForRound(o.mode === 'local' || human ? 6 : Math.max(1, round - 1)),
    ai,
  };
}

/** 같이 하기 2명(아래·위): 세로로 긴 대칭 판 */
function duelLevel(o: ArenaOptions, active: { side: Side; seat: Seat; color: ColorKey }[]): LevelDef {
  const cols = 13;
  const rows = 21;
  const tiles = new Int8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tiles[r * cols + c] = r === 10 ? NEUTRAL : r > 10 ? 0 : 1;
  const bottom = { baseCol: 5, baseRow: rows - 3 };
  const top = { baseCol: 6, baseRow: 1 };
  const gates: GateDef[] = [
    { x: 6, z: rows - 2 - 3.4, width: 1.45, angle: 0, op: 'mul', value: 2 },
    { x: 7, z: 2 + 3.4, width: 1.45, angle: 0, op: 'mul', value: 2 },
    { x: cols / 2, z: 10.5, width: 1.5, angle: 0, op: 'mul', value: 3, moveAmp: cols / 2 - 2.8, moveSpeed: 0.5 },
    { x: 2.8, z: rows * 0.66, width: 1.3, angle: 0, op: 'add', value: 3 },
    { x: cols - 2.8, z: rows * 0.34, width: 1.3, angle: 0, op: 'add', value: 3 },
  ];
  placeWalls(tiles, cols, rows, [[2, 12], [3, 13], [cols - 3, 12], [cols - 4, 13]], [bottom, top], gates);
  const teams = [
    seatSetup(o, active[0].seat, 'bottom', active[0].color, bottom),
    seatSetup(o, active[1].seat, 'top', active[1].color, top),
  ];
  return {
    mode: o.mode,
    label: o.mode === 'local' ? '같이 하기 · 2명' : '',
    round: o.aiRound,
    boss: false,
    cols,
    rows,
    tiles,
    gold: [],
    gates,
    teams,
    duration: o.mode === 'demo' ? 600 : 90,
    seed: o.seed ?? 0xd0e1 + o.aiRound,
  };
}

/** 타이틀 뒤에서 도는 AI끼리 대전 */
export function demoLevel(seed: number): LevelDef {
  return arenaLevel({ mode: 'demo', seats: ['ai', 'ai', 'off', 'off'], aiRound: 6, seed });
}

// ───────────────────────── 점검 ─────────────────────────

/** 판 설계에 문제가 있으면 설명을 돌려줌 (테스트용) */
export function levelProblems(level: LevelDef): string[] {
  const out: string[] = [];
  const { cols, rows, tiles } = level;
  if (tiles.length !== cols * rows) out.push('칸 수가 맞지 않음');
  level.teams.forEach((t, id) => {
    if (t.baseCol < 0 || t.baseRow < 0 || t.baseCol + 2 > cols || t.baseRow + 2 > rows) out.push(`팀 ${id} 기지가 판 밖`);
    for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) if (tiles[(t.baseRow + dr) * cols + t.baseCol + dc] === WALL) out.push(`팀 ${id} 기지에 벽`);
    let own = 0;
    for (let i = 0; i < tiles.length; i++) if (tiles[i] === id) own++;
    if (own < 20) out.push(`팀 ${id} 땅이 너무 적음 (${own})`);
  });
  if (level.teams.length >= 2 && !basesConnected(tiles, cols, rows, level.teams)) out.push('기지끼리 길이 막힘');
  level.gates.forEach((g, k) => {
    if (g.x < 0 || g.z < 0 || g.x > cols || g.z > rows) out.push(`팻말 ${k}이 판 밖`);
    if (g.value < 2 && g.op === 'mul') out.push(`팻말 ${k} 값이 작음`);
  });
  if (level.gates.length > 30) out.push('팻말이 너무 많음');
  for (const i of level.gold) if (tiles[i] === WALL) out.push('벽 위에 금화');
  return out;
}
