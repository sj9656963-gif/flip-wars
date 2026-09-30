import { describe, expect, it } from 'vitest';
import { WALL } from '../src/sim/constants';
import { distanceField } from '../src/sim/flow';

describe('거리 지도', () => {
  it('벽이 없으면 모든 칸에 닿고, 대각선 거리가 맞음', () => {
    const cols = 20;
    const rows = 20;
    const owner = new Int8Array(cols * rows);
    const f = distanceField(cols, rows, owner, [0]);
    for (let i = 0; i < f.length; i++) expect(Number.isFinite(f[i])).toBe(true);
    expect(f[19 * cols + 19]).toBeCloseTo(19 * Math.SQRT2, 3);
    expect(f[19]).toBeCloseTo(19, 5);
  });

  it('벽을 돌아감', () => {
    const cols = 5;
    const rows = 5;
    const owner = new Int8Array(cols * rows);
    for (let c = 0; c < 4; c++) owner[2 * cols + c] = WALL;
    const f = distanceField(cols, rows, owner, [0]);
    expect(Number.isFinite(f[4 * cols])).toBe(true);
    expect(f[4 * cols]).toBeGreaterThan(6);
  });
});
