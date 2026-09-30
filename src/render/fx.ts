// 효과: 칸이 뒤집힐 때 튀는 조각, 폭발 충격파, 떨어지는 폭탄, 금화 반짝임

import * as THREE from 'three';

const MAX_PARTS = 900;
const MAX_RINGS = 12;
const MAX_BOMBS = 8;

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  dur: number;
  r: number;
  active: boolean;
}

interface FallingBomb {
  group: THREE.Group;
  marker: THREE.Mesh;
  x: number;
  z: number;
  t: number;
  active: boolean;
}

export class Fx {
  readonly group = new THREE.Group();
  private readonly parts: THREE.InstancedMesh;
  private readonly px = new Float32Array(MAX_PARTS);
  private readonly py = new Float32Array(MAX_PARTS);
  private readonly pz = new Float32Array(MAX_PARTS);
  private readonly vx = new Float32Array(MAX_PARTS);
  private readonly vy = new Float32Array(MAX_PARTS);
  private readonly vz = new Float32Array(MAX_PARTS);
  private readonly life = new Float32Array(MAX_PARTS);
  private readonly maxLife = new Float32Array(MAX_PARTS);
  private readonly size = new Float32Array(MAX_PARTS);
  private count = 0;
  private readonly rings: Ring[] = [];
  private readonly bombs: FallingBomb[] = [];
  private readonly color = new THREE.Color();
  private readonly m = new THREE.Matrix4();

  constructor() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.parts = new THREE.InstancedMesh(geo, mat, MAX_PARTS);
    this.parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.parts.setColorAt(0, this.color.set(0xffffff));
    this.parts.frustumCulled = false;
    this.parts.count = 0;
    this.group.add(this.parts);
    const ringGeo = new THREE.RingGeometry(0.86, 1, 56).rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_RINGS; i++) {
      const rmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const mesh = new THREE.Mesh(ringGeo, rmat);
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.group.add(mesh);
      this.rings.push({ mesh, mat: rmat, t: 0, dur: 0.5, r: 1, active: false });
    }
    const bombGeo = new THREE.SphereGeometry(0.42, 18, 12);
    const bombMat = new THREE.MeshStandardMaterial({ color: 0x1f2430, roughness: 0.35, metalness: 0.4 });
    const fuseGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8).translate(0, 0.52, 0);
    const fuseMat = new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false });
    const markGeo = new THREE.RingGeometry(0.7, 0.95, 40).rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_BOMBS; i++) {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(bombGeo, bombMat), new THREE.Mesh(fuseGeo, fuseMat));
      group.visible = false;
      const marker = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: 0xff5a4f, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
      marker.visible = false;
      this.group.add(group, marker);
      this.bombs.push({ group, marker, x: 0, z: 0, t: 0, active: false });
    }
  }

  /** 조각 n개를 튀김 */
  burst(x: number, y: number, z: number, color: number, n: number, speed = 3, size = 0.12): void {
    this.color.set(color);
    for (let k = 0; k < n; k++) {
      if (this.count >= MAX_PARTS) return;
      const i = this.count++;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.px[i] = x;
      this.py[i] = y;
      this.pz[i] = z;
      this.vx[i] = Math.cos(a) * s * 0.6;
      this.vz[i] = Math.sin(a) * s * 0.6;
      this.vy[i] = s * (0.9 + Math.random() * 0.8);
      this.life[i] = this.maxLife[i] = 0.45 + Math.random() * 0.35;
      this.size[i] = size * (0.7 + Math.random() * 0.6);
      this.parts.setColorAt(i, this.color);
    }
    if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
  }

  ring(x: number, z: number, radius: number, color: number, dur = 0.5): void {
    const r = this.rings.find((q) => !q.active) ?? this.rings[0];
    r.active = true;
    r.t = 0;
    r.dur = dur;
    r.r = radius;
    r.mat.color.set(color);
    r.mesh.position.set(x, 0.3, z);
    r.mesh.visible = true;
  }

  /** 폭탄이 dur초 동안 떨어짐 */
  bomb(x: number, z: number, dur: number): void {
    const b = this.bombs.find((q) => !q.active) ?? this.bombs[0];
    b.active = true;
    b.x = x;
    b.z = z;
    b.t = -dur;
    b.group.position.set(x, 9, z);
    b.group.visible = true;
    b.marker.position.set(x, 0.28, z);
    b.marker.visible = true;
  }

  explosion(x: number, z: number, radius: number, color: number): void {
    this.ring(x, z, radius, 0xffffff, 0.35);
    this.ring(x, z, radius * 1.25, color, 0.6);
    this.burst(x, 0.4, z, color, 40, 6, 0.18);
    this.burst(x, 0.4, z, 0xffe7b0, 24, 7, 0.12);
  }

  update(dt: number): void {
    const g = 14;
    const arr = this.parts.instanceMatrix.array as Float32Array;
    let w = 0;
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      this.vy[i] -= g * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.24) {
        this.py[i] = 0.24;
        this.vy[i] *= -0.35;
        this.vx[i] *= 0.6;
        this.vz[i] *= 0.6;
      }
      if (w !== i) {
        this.px[w] = this.px[i];
        this.py[w] = this.py[i];
        this.pz[w] = this.pz[i];
        this.vx[w] = this.vx[i];
        this.vy[w] = this.vy[i];
        this.vz[w] = this.vz[i];
        this.life[w] = this.life[i];
        this.maxLife[w] = this.maxLife[i];
        this.size[w] = this.size[i];
        if (this.parts.instanceColor) {
          const c = this.parts.instanceColor.array as Float32Array;
          c[w * 3] = c[i * 3];
          c[w * 3 + 1] = c[i * 3 + 1];
          c[w * 3 + 2] = c[i * 3 + 2];
        }
      }
      const s = this.size[w] * Math.min(1, (this.life[w] / this.maxLife[w]) * 2);
      const o = w * 16;
      arr[o] = s;
      arr[o + 1] = 0;
      arr[o + 2] = 0;
      arr[o + 3] = 0;
      arr[o + 4] = 0;
      arr[o + 5] = s;
      arr[o + 6] = 0;
      arr[o + 7] = 0;
      arr[o + 8] = 0;
      arr[o + 9] = 0;
      arr[o + 10] = s;
      arr[o + 11] = 0;
      arr[o + 12] = this.px[w];
      arr[o + 13] = this.py[w];
      arr[o + 14] = this.pz[w];
      arr[o + 15] = 1;
      w++;
    }
    this.count = w;
    this.parts.count = w;
    this.parts.instanceMatrix.needsUpdate = true;
    if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;

    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt;
      const p = r.t / r.dur;
      if (p >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const s = r.r * (0.25 + 0.75 * (1 - (1 - p) * (1 - p)));
      r.mesh.scale.set(s, 1, s);
      r.mat.opacity = (1 - p) * 0.9;
    }

    for (const b of this.bombs) {
      if (!b.active) continue;
      b.t += dt;
      if (b.t >= 0) {
        b.active = false;
        b.group.visible = false;
        b.marker.visible = false;
        continue;
      }
      const p = 1 + b.t / 0.8;
      b.group.position.y = 0.4 + 8.6 * (1 - Math.max(0, Math.min(1, p)) ** 2);
      b.group.rotation.z += dt * 5;
      const pulse = 0.85 + 0.25 * Math.sin(performance.now() / 60);
      b.marker.scale.set(pulse, 1, pulse);
    }
    this.m.identity();
  }

  clear(): void {
    this.count = 0;
    this.parts.count = 0;
    for (const r of this.rings) {
      r.active = false;
      r.mesh.visible = false;
    }
    for (const b of this.bombs) {
      b.active = false;
      b.group.visible = false;
      b.marker.visible = false;
    }
  }
}
