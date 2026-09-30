// 조준 예측: 지금 각도로 쏜 공이 어디서 땅을 뒤집을지, 어떤 × 팻말을 지나는지 (화면의 조준선과 AI가 함께 씀)

import { MUZZLE, NEUTRAL, WALL } from './constants';
import { crossesGate } from './game';
import type { Game } from './types';

export interface Trace {
  /** 처음 닿는 남의 칸 (없으면 -1) */
  hit: number;
  /** 가는 길에 적 용병이 있으면 true (공이 용병에 맞음) */
  unit: boolean;
  /** 지나는 × 팻말을 모두 곱한 값 */
  mult: number;
  len: number;
  bounces: number;
  /** 꺾이는 점들 [x0,z0, x1,z1, ...] (collect일 때만) */
  points: number[];
  /** 지난 × 팻말 번호 */
  gates: number[];
}

export function traceShot(g: Game, team: number, angle: number, maxLen = 34, collect = false): Trace {
  const tm = g.teams[team];
  let vx = Math.cos(angle);
  let vz = Math.sin(angle);
  let x = tm.cx + vx * MUZZLE;
  let z = tm.cz + vz * MUZZLE;
  const pts: number[] = collect ? [x, z] : [];
  const gates: number[] = [];
  let mult = 1;
  let mask = 0;
  let len = 0;
  let bounces = 0;
  const step = 0.2;
  const cols = g.cols;
  const rows = g.rows;
  while (len < maxLen) {
    let nx = x + vx * step;
    let nz = z + vz * step;
    let bounced = false;
    if (nx < 0.02) {
      nx = 0.04 - nx;
      vx = -vx;
      bounced = true;
    } else if (nx > cols - 0.02) {
      nx = 2 * (cols - 0.02) - nx;
      vx = -vx;
      bounced = true;
    }
    if (nz < 0.02) {
      nz = 0.04 - nz;
      vz = -vz;
      bounced = true;
    } else if (nz > rows - 0.02) {
      nz = 2 * (rows - 0.02) - nz;
      vz = -vz;
      bounced = true;
    }
    for (const gt of g.gates) {
      const bit = 1 << gt.id;
      if (mask & bit) continue;
      if (!crossesGate(gt, x, z, nx, nz)) continue;
      mask |= bit;
      if (gt.op === 'mul' && (gt.owner === NEUTRAL || gt.owner === team)) {
        mult *= gt.value;
        gates.push(gt.id);
      }
    }
    const c = nx | 0;
    const r = nz | 0;
    const idx = r * cols + c;
    const o = g.owner[idx];
    if (o === WALL) {
      const pc = x | 0;
      const pr = z | 0;
      if (pc !== c) vx = -vx;
      if (pr !== r) vz = -vz;
      if (pc === c && pr === r) {
        vx = -vx;
        vz = -vz;
      }
      bounced = true;
      nx = x;
      nz = z;
    } else {
      const um = g.unitMap[idx];
      if (o !== team || (um >= 0 && um !== team)) {
        if (collect) pts.push(nx, nz);
        return { hit: o !== team ? idx : -1, unit: um >= 0 && um !== team, mult, len, bounces, points: pts, gates };
      }
    }
    if (bounced) {
      bounces++;
      if (collect) pts.push(nx, nz);
      if (bounces > 3) break;
    }
    x = nx;
    z = nz;
    len += step;
  }
  if (collect) pts.push(x, z);
  return { hit: -1, unit: false, mult, len, bounces, points: pts, gates };
}
