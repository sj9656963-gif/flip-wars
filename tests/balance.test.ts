// 밸런스 확인 (평소 테스트에서는 건너뜀). 실행: PowerShell에서 $env:BALANCE='1'; npx vitest run tests/balance.test.ts
import { describe, it } from 'vitest';
import { simulate } from '../src/sim/ai';
import { createGame } from '../src/sim/game';
import { adventureLevel } from '../src/sim/levels';
import type { Upgrades } from '../src/sim/progress';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

/** r라운드쯤 도달한 사람이 보통 갖고 있을 강화 (코인 수입 기준으로 조금 보수적으로) */
function typicalUpgrades(r: number): Upgrades {
  return {
    fire: Math.min(12, Math.floor(r * 0.5)),
    pierce: Math.min(5, Math.floor(r / 6)),
    hp: Math.min(10, Math.floor(r * 0.25)),
    army: Math.min(8, Math.floor(r * 0.2)),
    points: Math.min(10, Math.floor(r * 0.2)),
    start: Math.min(8, Math.floor(r * 0.15)),
  };
}

describe.runIf(!!env.BALANCE)('밸런스', () => {
  it('라운드별 승률', () => {
    const rows: Record<string, string | number>[] = [];
    const maxR = Number(env.BALANCE_ROUNDS ?? 20);
    for (let r = 1; r <= maxR; r++) {
      let wins = 0;
      let ko = 0;
      let time = 0;
      let share = 0;
      const N = Number(env.BALANCE_N ?? 4);
      for (let s = 0; s < N; s++) {
        const lv = adventureLevel(r, typicalUpgrades(r));
        lv.seed += s * 977;
        const me = lv.teams[0];
        me.control = 'ai';
        me.ai = { think: 0.35, noise: 0.12, spend: 0.75, smart: 0.7 };
        const g = simulate(createGame(lv), 130);
        if (g.winner === 0) wins++;
        if (g.endReason === 'ko') ko++;
        time += g.time;
        share += g.teams[0].tiles / g.playable;
      }
      rows.push({ r, win: `${Math.round((wins / N) * 100)}%`, ko: `${Math.round((ko / N) * 100)}%`, sec: Math.round(time / N), share: `${Math.round((share / N) * 100)}%` });
    }
    console.table(rows);
  }, 600_000);
});
