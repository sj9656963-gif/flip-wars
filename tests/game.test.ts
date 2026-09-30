import { describe, expect, it } from 'vitest';
import { BALL_BASE_DAMAGE, CARD, NEUTRAL, TICK, TILE_HP, WALL } from '../src/sim/constants';
import { cardState, createGame, playCard, stateHash, stepGame } from '../src/sim/game';
import { emptyUpgrades, playerStats } from '../src/sim/progress';
import type { Game, GateDef, LevelDef, TeamSetup } from '../src/sim/types';

/** 세로 판: 아래 절반 팀 0, 위 절반 팀 1 */
function mini(opts: { cols?: number; rows?: number; gates?: GateDef[]; walls?: [number, number][]; neutralRows?: number[]; hp?: number } = {}): LevelDef {
  const cols = opts.cols ?? 7;
  const rows = opts.rows ?? 16;
  const tiles = new Int8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tiles[r * cols + c] = r >= rows / 2 ? 0 : 1;
  for (const r of opts.neutralRows ?? []) for (let c = 0; c < cols; c++) tiles[r * cols + c] = NEUTRAL;
  for (const [c, r] of opts.walls ?? []) tiles[r * cols + c] = WALL;
  const team = (id: number): TeamSetup => ({
    control: 'human',
    name: `T${id}`,
    color: id ? 'red' : 'blue',
    side: id ? 'top' : 'bottom',
    baseCol: (cols >> 1) - 1,
    baseRow: id ? 1 : rows - 3,
    stats: { ...playerStats(emptyUpgrades()), fireInterval: 1e9, spread: 0 },
    hp: opts.hp ?? 30,
    startPoints: 0,
    cards: ['soldiers', 'bomb', 'rapid', 'freeze', 'tank', 'mega'],
  });
  return { mode: 'local', label: 't', round: 1, boss: false, cols, rows, tiles, gold: [], gates: opts.gates ?? [], teams: [team(0), team(1)], duration: 300, seed: 7 };
}

function quiet(g: Game): Game {
  for (const t of g.teams) {
    t.fireTimer = 1e9;
    t.guardTimer = 1e9;
  }
  return g;
}

function run(g: Game, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / TICK); i++) stepGame(g);
}

const idx = (g: Game, c: number, r: number) => r * g.cols + c;

describe('공과 땅', () => {
  it('공은 처음 닿은 남의 땅을 치고 사라짐 (TILE_HP번 맞으면 뒤집힘)', () => {
    const g = quiet(createGame(mini()));
    for (let k = 0; k < TILE_HP; k++) {
      expect(g.owner[idx(g, 1, 7)]).toBe(1);
      g.balls.add(0, 1.5, 12.5, 0, -10, 1, 0, 0, 5);
      run(g, 1);
      expect(g.balls.n).toBe(0);
    }
    expect(g.owner[idx(g, 1, 7)]).toBe(0);
    expect(g.owner[idx(g, 1, 6)]).toBe(1);
    expect(g.teams[0].points).toBe(1);
    expect(g.teams[0].tiles).toBe(g.cols * 8 + 1);
    expect(g.teams[1].tiles).toBe(g.cols * 8 - 1);
  });

  it('관통 공은 두 번 침', () => {
    const g = quiet(createGame(mini()));
    g.tileHp[idx(g, 1, 7)] = 1;
    g.tileHp[idx(g, 1, 6)] = 1;
    g.balls.add(0, 1.5, 12.5, 0, -10, 2, 0, 0, 5);
    run(g, 1);
    expect(g.owner[idx(g, 1, 7)]).toBe(0);
    expect(g.owner[idx(g, 1, 6)]).toBe(0);
    expect(g.owner[idx(g, 1, 5)]).toBe(1);
  });

  it('벽에 맞으면 튕기고 벽은 그대로', () => {
    const g = quiet(createGame(mini({ walls: [[1, 10]] })));
    g.balls.add(0, 1.5, 12.5, 0, -8, 1, 0, 0, 5);
    run(g, 0.3);
    expect(g.owner[idx(g, 1, 10)]).toBe(WALL);
    expect(g.balls.n).toBe(1);
    expect(g.balls.vz[0]).toBeGreaterThan(0);
  });

  it('빈 땅도 뒤집음', () => {
    const g = quiet(createGame(mini({ neutralRows: [8] })));
    g.tileHp[idx(g, 3, 8)] = 1;
    g.balls.add(0, 3.5, 12.5, 0, -10, 1, 0, 0, 5);
    run(g, 1);
    expect(g.owner[idx(g, 3, 8)]).toBe(0);
    expect(g.owner[idx(g, 3, 7)]).toBe(1);
  });

  it('서로 다른 팀 공이 부딪히면 둘 다 사라짐', () => {
    const g = quiet(createGame(mini()));
    // 경계선 양쪽 자기 땅 위에서 맞닿게 둠 (남의 땅에 들어가면 그 칸을 뒤집고 먼저 사라지므로)
    g.balls.add(0, 3.5, 8.1, 0, 0, 1, 0, 0, 5);
    g.balls.add(1, 3.5, 7.9, 0, 0, 1, 0, 0, 5);
    stepGame(g);
    expect(g.balls.n).toBe(0);
    expect(g.events.some((e) => e.t === 'clash')).toBe(true);
  });
});

describe('팻말', () => {
  const mulGate: GateDef = { x: 3.5, z: 11, width: 1.5, angle: 0, op: 'mul', value: 3 };

  it('× 팻말을 지나면 공이 그 수만큼 늘어남', () => {
    const g = quiet(createGame(mini({ gates: [mulGate] })));
    g.balls.add(0, 3.5, 12.5, 0, -8, 1, 0, 0, 5);
    run(g, 0.3);
    expect(g.balls.n).toBe(3);
  });

  it('같은 팻말은 한 공에 한 번만 (튕겨 돌아와도)', () => {
    const g = quiet(createGame(mini({ gates: [mulGate], walls: [[3, 10], [2, 10], [4, 10]] })));
    g.balls.add(0, 3.5, 12.5, 0, -6, 1, 0, 0, 5);
    run(g, 0.7);
    // 벽에 튕겨 팻말을 다시 지나도 3개 그대로
    expect(g.balls.n).toBeLessThanOrEqual(3);
    expect(g.balls.n).toBeGreaterThan(0);
  });

  it('남의 땅에 선 팻말은 내 공에 안 먹힘', () => {
    const g = quiet(createGame(mini({ gates: [{ ...mulGate, z: 5.5 }] })));
    // 팀 1 땅 위 팻말: 팀 1 공만 늘어남
    g.balls.add(1, 3.5, 3.5, 0, 8, 1, 0, 0, 5);
    run(g, 0.4);
    const t1 = [...Array(g.balls.n).keys()].filter((i) => g.balls.team[i] === 1).length;
    expect(t1).toBe(3);
    expect(g.gates[0].owner).toBe(1);
  });

  it('+ 팻말은 지나간 병사 무리에 병사를 더함 (무리마다 한 번)', () => {
    const g = quiet(createGame(mini({ rows: 20, gates: [{ x: 3.5, z: 14, width: 3, angle: 0, op: 'add', value: 4 }] })));
    g.teams[0].points = 1000;
    expect(playCard(g, g.teams[0], 'soldiers', 3.5, 4)).toBe(true);
    const before = g.units.length;
    run(g, 3);
    const mine = g.units.filter((u) => u.team === 0).length;
    expect(before).toBe(6);
    expect(mine).toBe(10);
  });
});

describe('기지와 승패', () => {
  it('적 기지에 닿은 공은 체력을 줄이고, 0이 되면 그 땅이 모두 넘어와 승리', () => {
    const g = quiet(createGame(mini({ hp: BALL_BASE_DAMAGE * 1.5 })));
    // 적 기지까지 길을 내 땅으로 만들어 둠
    for (let r = 3; r < 8; r++) g.owner[idx(g, 3, r)] = 0;
    g.teams[1].tiles -= 5;
    g.teams[0].tiles += 5;
    g.balls.add(0, 3.3, 12.5, 0, -10, 1, 0, 0, 5);
    run(g, 1.2);
    expect(g.teams[1].hp).toBeCloseTo(BALL_BASE_DAMAGE * 0.5, 5);
    expect(g.teams[1].alive).toBe(true);
    g.balls.add(0, 3.3, 12.5, 0, -10, 1, 0, 0, 5);
    run(g, 1.2);
    expect(g.teams[1].alive).toBe(false);
    expect(g.over).toBe(true);
    expect(g.winner).toBe(0);
    expect(g.teams[0].tiles).toBe(g.playable);
    const h = stateHash(g);
    run(g, 1);
    expect(stateHash(g)).toBe(h);
  });

  it('기지 방어: 기지 옆으로 파고든 칸을 되찾음', () => {
    const g = createGame(mini());
    for (const t of g.teams) t.fireTimer = 1e9;
    const i = idx(g, 3, 3);
    g.owner[i] = 0;
    g.teams[0].tiles++;
    g.teams[1].tiles--;
    run(g, 0.5);
    expect(g.owner[i]).toBe(1);
    expect(g.teams[0].points).toBe(0);
  });

  it('시간이 다 되면 땅이 넓은 팀이 이김', () => {
    const lv = mini();
    lv.duration = 1;
    const g = quiet(createGame(lv));
    g.tileHp[idx(g, 1, 7)] = 1;
    g.balls.add(0, 1.5, 12.5, 0, -10, 1, 0, 0, 5);
    run(g, 1.1);
    expect(g.over).toBe(true);
    expect(g.endReason).toBe('time');
    expect(g.winner).toBe(0);
  });

  it('피버 타임: 끝나기 20초 전부터', () => {
    const lv = mini();
    lv.duration = 22;
    const g = quiet(createGame(lv));
    run(g, 1.5);
    expect(g.fever).toBe(false);
    run(g, 1);
    expect(g.fever).toBe(true);
  });
});

describe('카드', () => {
  it('포인트가 모자라면 못 쓰고, 쓰면 포인트가 줄고 다시 쓰기까지 기다림', () => {
    const g = quiet(createGame(mini()));
    const tm = g.teams[0];
    expect(playCard(g, tm, 'bomb', 3, 4)).toBe(false);
    tm.points = CARD.bomb.cost * 2;
    expect(playCard(g, tm, 'bomb', 3, 4)).toBe(true);
    expect(tm.points).toBe(CARD.bomb.cost);
    expect(cardState(g, 0, 'bomb').ready).toBe(false);
    expect(playCard(g, tm, 'bomb', 3, 4)).toBe(false);
    run(g, CARD.bomb.cooldown + 0.1);
    expect(playCard(g, tm, 'bomb', 3, 4)).toBe(true);
  });

  it('폭탄은 잠시 뒤 둘레 땅을 뒤집음', () => {
    const g = quiet(createGame(mini()));
    g.teams[0].points = 100;
    playCard(g, g.teams[0], 'bomb', 3.5, 5.5);
    stepGame(g);
    expect(g.owner[idx(g, 3, 5)]).toBe(1);
    run(g, 1);
    expect(g.owner[idx(g, 3, 5)]).toBe(0);
    expect(g.owner[idx(g, 4, 4)]).toBe(0);
    // 기지 칸은 뒤집히지 않음
    expect(g.baseOf[idx(g, 3, 1)]).toBe(1);
  });

  it('얼음: 상대 대포가 멈춤', () => {
    const g = createGame(mini());
    g.teams[1].stats.fireInterval = 0.1;
    g.teams[0].points = 200;
    playCard(g, g.teams[0], 'freeze', 0, 0);
    const shots = g.teams[1].shots;
    run(g, 3.5);
    expect(g.teams[1].shots).toBe(shots);
    run(g, 1.5);
    expect(g.teams[1].shots).toBeGreaterThan(shots);
  });

  it('병사는 벽을 돌아 적 땅을 뒤집으며 적 기지를 공격함', () => {
    const walls: [number, number][] = [
      [1, 8],
      [2, 8],
      [3, 8],
      [4, 8],
      [5, 8],
    ];
    const g = quiet(createGame(mini({ walls, hp: 5 })));
    g.teams[0].points = 100;
    playCard(g, g.teams[0], 'soldiers', 3.5, 10);
    run(g, 14);
    expect(g.teams[0].flips).toBeGreaterThan(4);
    expect(g.teams[1].hp).toBeLessThan(5);
  });
});

describe('재현', () => {
  it('같은 판·같은 명령이면 같은 결과', () => {
    const make = () => {
      const g = createGame(mini());
      g.teams[0].stats.fireInterval = 0.15;
      g.teams[1].stats.fireInterval = 0.17;
      g.teams[0].stats.spread = 0.1;
      g.teams[1].stats.spread = 0.1;
      return g;
    };
    const a = make();
    const b = make();
    for (let i = 0; i < 600; i++) {
      const cmd = i % 90 === 0 ? [{ type: 'aim' as const, team: 0, x: (i / 90) % 7, z: 2 }] : [];
      stepGame(a, cmd);
      stepGame(b, cmd);
    }
    expect(stateHash(a)).toBe(stateHash(b));
    expect(a.teams[0].flips + a.teams[1].flips).toBeGreaterThan(20);
  });
});
