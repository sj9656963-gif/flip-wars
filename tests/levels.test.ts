import { describe, expect, it } from 'vitest';
import { simulate } from '../src/sim/ai';
import { createGame } from '../src/sim/game';
import { adventureLevel, arenaLevel, levelProblems } from '../src/sim/levels';
import { emptyUpgrades, enemyAi, enemyStats, rewardCoins, UPGRADES, upgradeCost } from '../src/sim/progress';
import type { LevelDef } from '../src/sim/types';

/** 사람 자리를 AI로 바꿈 (자동 대전용) */
function botify(lv: LevelDef, round: number): LevelDef {
  lv.teams.forEach((t) => {
    if (t.control === 'human') {
      t.control = 'ai';
      t.ai = enemyAi(round);
    }
  });
  return lv;
}

describe('판 설계', () => {
  it('모험 1~30라운드 판에 문제가 없음', () => {
    for (let r = 1; r <= 30; r++) {
      const lv = adventureLevel(r, emptyUpgrades());
      expect(levelProblems(lv), `라운드 ${r}`).toEqual([]);
      expect(lv.teams[0].control).toBe('human');
      expect(lv.teams[0].color).toBe('blue');
      expect(lv.boss).toBe(r % 5 === 0);
    }
  });

  it('1대2 라운드와 보스전', () => {
    expect(adventureLevel(7).teams.length).toBe(3);
    expect(adventureLevel(12).teams.length).toBe(3);
    expect(adventureLevel(5).teams[1].stats.multishot).toBe(2);
    expect(adventureLevel(5).label).toContain('보스');
  });

  it('적은 라운드마다 강해짐', () => {
    const a = enemyStats(1, false);
    const b = enemyStats(10, false);
    expect(b.fireInterval).toBeLessThan(a.fireInterval);
    expect(enemyAi(10).noise).toBeLessThan(enemyAi(1).noise);
    expect(adventureLevel(10).teams[1].hp).toBeGreaterThan(adventureLevel(1).teams[1].hp);
  });

  it('4인 난투·같이 하기(2~4명) 판에 문제가 없음', () => {
    const cases = [
      { mode: 'brawl' as const, seats: ['human', 'ai', 'ai', 'ai'] as const },
      { mode: 'local' as const, seats: ['human', 'human', 'off', 'off'] as const },
      { mode: 'local' as const, seats: ['human', 'human', 'human', 'off'] as const },
      { mode: 'local' as const, seats: ['human', 'human', 'human', 'human'] as const },
      { mode: 'local' as const, seats: ['human', 'ai', 'human', 'ai'] as const },
    ];
    for (const c of cases) {
      const lv = arenaLevel({ mode: c.mode, seats: c.seats, aiRound: 5 });
      expect(levelProblems(lv), c.seats.join(',')).toEqual([]);
      expect(lv.teams.length).toBe(c.seats.filter((s) => s !== 'off').length);
    }
  });

  it('강화 비용은 레벨마다 오름', () => {
    for (const u of UPGRADES) expect(upgradeCost(u, 3)).toBeGreaterThan(upgradeCost(u, 0));
    expect(rewardCoins({ win: true, ko: true, share: 1, round: 3, gold: 2 })).toBeGreaterThan(rewardCoins({ win: false, ko: false, share: 0.3, round: 3, gold: 0 }));
  });
});

describe('AI', () => {
  it('AI끼리 붙으면 끝까지 진행됨 (모험 3라운드)', () => {
    const g = simulate(createGame(botify(adventureLevel(3), 4)), 200);
    expect(g.over).toBe(true);
    expect(g.winner).toBeGreaterThanOrEqual(0);
    expect(g.teams[0].flips + g.teams[1].flips).toBeGreaterThan(100);
    expect(g.teams.some((t) => t.cardsUsed > 0)).toBe(true);
  });

  it('강한 AI가 약한 AI를 대부분 이김', () => {
    let wins = 0;
    for (let s = 0; s < 4; s++) {
      const lv = arenaLevel({ mode: 'local', seats: ['ai', 'ai', 'off', 'off'], aiRound: 1, seed: 100 + s });
      lv.teams[0].ai = enemyAi(16);
      lv.teams[0].stats = enemyStats(16, false);
      lv.teams[1].ai = enemyAi(1);
      lv.teams[1].stats = enemyStats(1, false);
      const g = simulate(createGame(lv), 200);
      if (g.winner === 0) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(3);
  });

  it('4인 난투도 끝까지 진행됨', () => {
    const lv = arenaLevel({ mode: 'brawl', seats: ['ai', 'ai', 'ai', 'ai'], aiRound: 6, seed: 3 });
    const g = simulate(createGame(lv), 200);
    expect(g.over).toBe(true);
    expect(new Set(g.teams.map((t) => t.rank))).toEqual(new Set([1, 2, 3, 4]));
  });
});
