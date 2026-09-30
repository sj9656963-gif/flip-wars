// 3D 화면(three.js): 기울어진 판, 뒤집히는 칸, 빛나는 공과 꼬리, 용병, 대포, 팻말, 조준선, 효과.
// 게임 규칙(sim)의 상태를 매 프레임 읽어 그리고, 사건(뒤집힘·폭발 등)으로 연출을 시작함.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOMB_DELAY, MAX_BALLS, TANK, TICK, WALL } from '../sim/constants';
import { traceShot } from '../sim/trace';
import type { Game, GameEvent } from '../sim/types';
import { Fx } from './fx';
import { COLORS, FRAME_COLOR, GOLD_COLOR, NEUTRAL_TILE, WALL_COLOR, type TeamColors } from './palette';
import { boardGlowTexture, glowTexture, labelTexture, trailTexture } from './textures';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type CameraMode = 'tilt' | 'top';
export type Quality = 'high' | 'low';

const FLIP_TIME = 0.36;
const TILE_H = 0.22;
const MAX_UNITS = 512;
const AIM_DOTS = 64;

interface CannonView {
  group: THREE.Group;
  turret: THREE.Group;
  barrel: THREE.Group;
  ice: THREE.Mesh;
  ring: THREE.Mesh;
  platformMat: THREE.MeshStandardMaterial;
  domeMat: THREE.MeshStandardMaterial;
  recoil: number;
  hitFlash: number;
  dead: boolean;
}

interface GateView {
  group: THREE.Group;
  postMat: THREE.MeshStandardMaterial;
  panelMat: THREE.MeshBasicMaterial;
  label: THREE.Sprite;
  owner: number;
  pulse: number;
  lastHits: number;
}

interface AimView {
  team: number;
  dots: THREE.Points;
  pos: Float32Array;
  ring: THREE.Mesh;
}

/** 이번 판에서 만든 것 (판이 바뀌면 치움) */
type Disposable = { dispose(): void };

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.5, 400);
  private readonly scene = new THREE.Scene();
  private root: THREE.Group | null = null;
  private trash: Disposable[] = [];
  private game: Game | null = null;
  private mode: CameraMode = 'tilt';
  private humans: number[] = [];
  private teamColors: TeamColors[] = [];
  private width = 1;
  private height = 1;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private time = 0;
  private shakeT = 0;
  private shakeAmp = 0;
  private low = false;
  private flipFx = 0;
  private readonly camPos = new THREE.Vector3();
  private readonly fx = new Fx();
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TILE_H);
  private readonly glowTex = glowTexture();
  private readonly trailTex = trailTexture();
  private readonly boardGlowTex = boardGlowTexture();
  // 칸
  private tiles: THREE.InstancedMesh | null = null;
  private tileInst = new Int32Array(0);
  private shown = new Int8Array(0);
  private animStart = new Float32Array(0);
  private animFrom = new Int8Array(0);
  private animTo = new Int8Array(0);
  private animOn = new Uint8Array(0);
  private active: number[] = [];
  /** 맞기만 한 칸 (짧게 튐) */
  private chips: number[] = [];
  private chipAt = new Float32Array(0);
  private chipTeam = new Int8Array(0);
  private chipOn = new Uint8Array(0);
  /** 주인별 칸 색 (0번이 빈 땅, 1번부터 팀) */
  private ownerColor: THREE.Color[] = [];
  // 공
  private ballCore: THREE.InstancedMesh | null = null;
  private ballTrail: THREE.InstancedMesh | null = null;
  private ballGlow: THREE.Points | null = null;
  private glowPos = new Float32Array(MAX_BALLS * 3);
  private glowCol = new Float32Array(MAX_BALLS * 3);
  private ballColor: THREE.Color[] = [];
  private glowColor: THREE.Color[] = [];
  // 용병
  private soldierBody: THREE.InstancedMesh | null = null;
  private soldierHead: THREE.InstancedMesh | null = null;
  private tankBody: THREE.InstancedMesh | null = null;
  private tankTread: THREE.InstancedMesh | null = null;
  private cannons: CannonView[] = [];
  private gates: GateView[] = [];
  private coins: THREE.InstancedMesh | null = null;
  private goldTiles: number[] = [];
  private aims: AimView[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v3 = new THREE.Vector3();
  private readonly s3 = new THREE.Vector3();
  private readonly col = new THREE.Color();
  private readonly white = new THREE.Color(0xffffff);
  private readonly axisX = new THREE.Vector3(1, 0, 0);
  private readonly axisZ = new THREE.Vector3(0, 0, 1);
  private readonly ndc = new THREE.Vector2();

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.setQuality(quality);
    const hemi = new THREE.HemisphereLight(0xe8f0ff, 0x1c2230, 1.15);
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-8, 20, 12);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 0.5);
    rim.position.set(10, 8, -14);
    this.scene.add(hemi, sun, sun.target, rim, this.fx.group);
  }

  setQuality(q: Quality): void {
    this.low = q === 'low';
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, this.low ? 1.25 : 2));
    this.resize(this.width, this.height, this.insets);
  }

  resize(w: number, h: number, insets: Insets): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.insets = insets;
    this.renderer.setSize(this.width, this.height, false);
    this.fit();
  }

  get current(): Game | null {
    return this.game;
  }

  // ───────────────────────── 판 만들기 ─────────────────────────

  setGame(g: Game, opts: { camera: CameraMode; humans: number[] }): void {
    this.clearLevel();
    this.game = g;
    this.mode = opts.camera;
    this.humans = opts.humans;
    this.teamColors = g.teams.map((t) => COLORS[t.color]);
    this.ownerColor = [new THREE.Color(NEUTRAL_TILE), ...this.teamColors.map((c) => new THREE.Color(c.tile))];
    this.ballColor = this.teamColors.map((c) => new THREE.Color(c.ball));
    this.glowColor = this.teamColors.map((c) => new THREE.Color(c.light));
    const root = new THREE.Group();
    this.root = root;
    this.scene.add(root);
    this.buildBoard(g, root);
    this.buildBalls(root);
    this.buildUnits(root);
    this.buildCannons(g, root);
    this.buildGates(g, root);
    this.buildCoins(g, root);
    this.buildAims(g, root);
    this.fx.clear();
    this.fit();
  }

  private keep<T extends Disposable>(x: T): T {
    this.trash.push(x);
    return x;
  }

  private clearLevel(): void {
    if (this.root) this.scene.remove(this.root);
    for (const d of this.trash) d.dispose();
    this.trash = [];
    this.root = null;
    this.game = null;
    this.cannons = [];
    this.gates = [];
    this.aims = [];
    this.active = [];
  }

  private buildBoard(g: Game, root: THREE.Group): void {
    const { cols, rows, n } = g;
    // 받침·흰 테두리·아래로 번지는 빛
    const slab = new THREE.Mesh(
      this.keep(new THREE.BoxGeometry(cols + 0.5, 0.5, rows + 0.5)),
      this.keep(new THREE.MeshStandardMaterial({ color: 0x141925, roughness: 0.9 })),
    );
    slab.position.set(cols / 2, -0.25, rows / 2);
    const frameMat = this.keep(new THREE.MeshStandardMaterial({ color: FRAME_COLOR, roughness: 0.35, emissive: 0x3a4a66, emissiveIntensity: 0.25 }));
    const hGeo = this.keep(new RoundedBoxGeometry(cols + 1.1, 0.36, 0.34, 2, 0.12));
    const vGeo = this.keep(new RoundedBoxGeometry(0.34, 0.36, rows + 1.1, 2, 0.12));
    const f1 = new THREE.Mesh(hGeo, frameMat);
    f1.position.set(cols / 2, 0.12, -0.35);
    const f2 = new THREE.Mesh(hGeo, frameMat);
    f2.position.set(cols / 2, 0.12, rows + 0.35);
    const f3 = new THREE.Mesh(vGeo, frameMat);
    f3.position.set(-0.35, 0.12, rows / 2);
    const f4 = new THREE.Mesh(vGeo, frameMat);
    f4.position.set(cols + 0.35, 0.12, rows / 2);
    const glow = new THREE.Mesh(
      this.keep(new THREE.PlaneGeometry(cols + 16, rows + 16).rotateX(-Math.PI / 2)),
      this.keep(new THREE.MeshBasicMaterial({ map: this.boardGlowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })),
    );
    glow.position.set(cols / 2, -0.55, rows / 2);
    root.add(glow, slab, f1, f2, f3, f4);

    // 칸
    let count = 0;
    let walls = 0;
    for (let i = 0; i < n; i++) {
      if (g.owner[i] === WALL) walls++;
      else count++;
    }
    const tiles = new THREE.InstancedMesh(
      this.keep(new RoundedBoxGeometry(0.9, TILE_H, 0.9, 2, 0.07)),
      this.keep(new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.04 })),
      count,
    );
    tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    tiles.frustumCulled = false;
    this.tileInst = new Int32Array(n).fill(-1);
    this.shown = new Int8Array(n);
    this.animStart = new Float32Array(n);
    this.animFrom = new Int8Array(n);
    this.animTo = new Int8Array(n);
    this.animOn = new Uint8Array(n);
    this.chipAt = new Float32Array(n);
    this.chipTeam = new Int8Array(n);
    this.chipOn = new Uint8Array(n);
    this.chips = [];
    const wallMesh = new THREE.InstancedMesh(
      this.keep(new RoundedBoxGeometry(0.94, 0.7, 0.94, 2, 0.1)),
      this.keep(new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.55 })),
      Math.max(1, walls),
    );
    wallMesh.count = walls;
    let k = 0;
    let w = 0;
    for (let i = 0; i < n; i++) {
      const c = i % cols;
      const r = (i - c) / cols;
      const o = g.owner[i];
      if (o === WALL) {
        this.m4.makeTranslation(c + 0.5, 0.35, r + 0.5);
        wallMesh.setMatrixAt(w++, this.m4);
        continue;
      }
      this.tileInst[i] = k;
      this.shown[i] = o;
      this.m4.makeTranslation(c + 0.5, TILE_H / 2, r + 0.5);
      tiles.setMatrixAt(k, this.m4);
      tiles.setColorAt(k, this.ownerColor[o + 1]);
      k++;
    }
    this.keep(tiles);
    this.keep(wallMesh);
    this.tiles = tiles;
    root.add(tiles, wallMesh);
  }

  private buildBalls(root: THREE.Group): void {
    const core = new THREE.InstancedMesh(this.keep(new THREE.SphereGeometry(0.17, 12, 8)), this.keep(new THREE.MeshBasicMaterial({ toneMapped: false })), MAX_BALLS);
    core.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    core.setColorAt(0, this.white);
    core.frustumCulled = false;
    core.count = 0;
    const trailGeo = this.keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(-0.5, 0, 0));
    const trail = new THREE.InstancedMesh(
      trailGeo,
      this.keep(new THREE.MeshBasicMaterial({ map: this.trailTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide })),
      MAX_BALLS,
    );
    trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    trail.setColorAt(0, this.white);
    trail.frustumCulled = false;
    trail.count = 0;
    trail.renderOrder = 2;
    const geo = this.keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(this.glowPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.glowCol, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const glow = new THREE.Points(
      geo,
      this.keep(
        new THREE.PointsMaterial({
          size: this.low ? 0.75 : 0.95,
          map: this.glowTex,
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
          toneMapped: false,
        }),
      ),
    );
    glow.frustumCulled = false;
    glow.renderOrder = 3;
    this.keep(core);
    this.keep(trail);
    this.ballCore = core;
    this.ballTrail = trail;
    this.ballGlow = glow;
    root.add(trail, core, glow);
  }

  private buildUnits(root: THREE.Group): void {
    const y = TILE_H;
    const body = mergeGeometries([
      new THREE.CylinderGeometry(0.15, 0.19, 0.36, 10).translate(0, y + 0.18, 0),
      new THREE.BoxGeometry(0.34, 0.07, 0.07).translate(0.2, y + 0.3, 0.08),
    ]);
    const head = new THREE.SphereGeometry(0.145, 12, 10).translate(0, y + 0.5, 0);
    const tank = mergeGeometries([
      new THREE.BoxGeometry(1.0, 0.3, 0.72).translate(0, y + 0.3, 0),
      new THREE.CylinderGeometry(0.27, 0.31, 0.22, 14).translate(-0.05, y + 0.55, 0),
      new THREE.CylinderGeometry(0.07, 0.07, 0.62, 8).rotateZ(Math.PI / 2).translate(0.42, y + 0.56, 0),
    ]);
    const tread = mergeGeometries([new THREE.BoxGeometry(1.08, 0.22, 0.2).translate(0, y + 0.13, 0.4), new THREE.BoxGeometry(1.08, 0.22, 0.2).translate(0, y + 0.13, -0.4)]);
    const mk = (geo: THREE.BufferGeometry, color: number | null, cap: number) => {
      const mat = new THREE.MeshStandardMaterial({ color: color ?? 0xffffff, roughness: 0.45 });
      const m = new THREE.InstancedMesh(this.keep(geo), this.keep(mat), cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (color === null) m.setColorAt(0, this.white);
      m.frustumCulled = false;
      m.count = 0;
      this.keep(m);
      root.add(m);
      return m;
    };
    this.soldierBody = mk(body, null, MAX_UNITS);
    this.soldierHead = mk(head, 0xffe8d2, MAX_UNITS);
    this.tankBody = mk(tank, null, 200);
    this.tankTread = mk(tread, 0x2a2f3a, 200);
  }

  private buildCannons(g: Game, root: THREE.Group): void {
    const platformGeo = this.keep(new RoundedBoxGeometry(1.92, 0.36, 1.92, 2, 0.14));
    const domeGeo = this.keep(new THREE.SphereGeometry(0.6, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2));
    const barrelGeo = this.keep(new THREE.CylinderGeometry(0.21, 0.27, 1.2, 18).rotateZ(-Math.PI / 2));
    const bandGeo = this.keep(new THREE.CylinderGeometry(0.29, 0.29, 0.16, 18).rotateZ(-Math.PI / 2));
    const ringGeo = this.keep(new THREE.TorusGeometry(0.74, 0.06, 8, 40).rotateX(Math.PI / 2));
    const iceGeo = this.keep(new RoundedBoxGeometry(2.1, 1.5, 2.1, 2, 0.2));
    const bandMat = this.keep(new THREE.MeshStandardMaterial({ color: 0x1b1f29, roughness: 0.4, metalness: 0.5 }));
    const iceMat = this.keep(new THREE.MeshStandardMaterial({ color: 0xc4ecff, transparent: true, opacity: 0.5, roughness: 0.1, emissive: 0x2a6f9a, emissiveIntensity: 0.4 }));
    this.cannons = g.teams.map((t, i) => {
      const colors = this.teamColors[i];
      const group = new THREE.Group();
      group.position.set(t.cx, 0, t.cz);
      const platformMat = this.keep(new THREE.MeshStandardMaterial({ color: colors.dark, roughness: 0.35, emissive: 0xff2200, emissiveIntensity: 0 }));
      const platform = new THREE.Mesh(platformGeo, platformMat);
      platform.position.y = TILE_H + 0.18;
      const ring = new THREE.Mesh(ringGeo, this.keep(new THREE.MeshBasicMaterial({ color: colors.light, toneMapped: false })));
      ring.position.y = TILE_H + 0.37;
      const turret = new THREE.Group();
      turret.position.y = TILE_H + 0.36;
      const domeMat = this.keep(new THREE.MeshStandardMaterial({ color: colors.tile, roughness: 0.28, metalness: 0.15 }));
      const dome = new THREE.Mesh(domeGeo, domeMat);
      const barrel = new THREE.Group();
      const tube = new THREE.Mesh(barrelGeo, domeMat);
      tube.position.set(0.62, 0.34, 0);
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.set(1.2, 0.34, 0);
      barrel.add(tube, band);
      turret.add(dome, barrel);
      const ice = new THREE.Mesh(iceGeo, iceMat);
      ice.position.y = TILE_H + 0.75;
      ice.visible = false;
      group.add(platform, ring, turret, ice);
      root.add(group);
      return { group, turret, barrel, ice, ring, platformMat, domeMat, recoil: 0, hitFlash: 0, dead: false };
    });
  }

  private buildGates(g: Game, root: THREE.Group): void {
    const postGeo = this.keep(new THREE.BoxGeometry(0.14, 0.95, 0.14));
    this.gates = g.gates.map((gt) => {
      const group = new THREE.Group();
      group.rotation.y = -gt.angle;
      const postMat = this.keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0x222222 }));
      const p1 = new THREE.Mesh(postGeo, postMat);
      p1.position.set(-gt.width, TILE_H + 0.475, 0);
      const p2 = new THREE.Mesh(postGeo, postMat);
      p2.position.set(gt.width, TILE_H + 0.475, 0);
      const bar = new THREE.Mesh(this.keep(new THREE.BoxGeometry(gt.width * 2 + 0.14, 0.09, 0.12)), postMat);
      bar.position.set(0, TILE_H + 0.93, 0);
      const panelMat = this.keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
      const panel = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(gt.width * 2, 0.78)), panelMat);
      panel.position.set(0, TILE_H + 0.5, 0);
      const text = gt.op === 'mul' ? `×${gt.value}` : `+${gt.value}`;
      const tex = this.keep(labelTexture(text, gt.op === 'mul' ? '#1e293b' : '#15803d'));
      const label = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true })));
      label.position.set(0, TILE_H + 1.5, 0);
      label.scale.set(1.35, 0.68, 1);
      label.renderOrder = 20;
      group.add(p1, p2, bar, panel, label);
      root.add(group);
      return { group, postMat, panelMat, label, owner: -99, pulse: 0, lastHits: 0 };
    });
  }

  private buildCoins(g: Game, root: THREE.Group): void {
    this.goldTiles = [];
    for (let i = 0; i < g.n; i++) if (g.gold[i]) this.goldTiles.push(i);
    const coins = new THREE.InstancedMesh(
      this.keep(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 20).rotateX(Math.PI / 2)),
      this.keep(new THREE.MeshStandardMaterial({ color: GOLD_COLOR, metalness: 0.65, roughness: 0.25, emissive: 0x6b4700, emissiveIntensity: 0.6 })),
      Math.max(1, this.goldTiles.length),
    );
    coins.count = this.goldTiles.length;
    coins.frustumCulled = false;
    this.keep(coins);
    this.coins = coins;
    root.add(coins);
  }

  private buildAims(g: Game, root: THREE.Group): void {
    const ringGeo = this.keep(new THREE.RingGeometry(0.32, 0.5, 32).rotateX(-Math.PI / 2));
    this.aims = this.humans.map((team) => {
      const c = this.teamColors[team];
      const pos = new Float32Array(AIM_DOTS * 3);
      const geo = this.keep(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setDrawRange(0, 0);
      const dots = new THREE.Points(
        geo,
        this.keep(new THREE.PointsMaterial({ size: 0.34, map: this.glowTex, color: c.light, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })),
      );
      dots.frustumCulled = false;
      dots.renderOrder = 4;
      const ring = new THREE.Mesh(ringGeo, this.keep(new THREE.MeshBasicMaterial({ color: c.light, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false })));
      ring.renderOrder = 4;
      root.add(dots, ring);
      return { team, dots, pos, ring };
    });
    void g;
  }

  // ───────────────────────── 카메라 ─────────────────────────

  /** 판 전체가 HUD를 피한 안전 영역에 딱 들어오도록 거리·기울기·화면 중심을 맞춤 */
  private fit(): void {
    const g = this.game;
    const cam = this.camera;
    if (!g) return;
    const W = this.width;
    const H = this.height;
    const ins = this.insets;
    const safeW = Math.max(60, W - ins.left - ins.right);
    const safeH = Math.max(60, H - ins.top - ins.bottom);
    cam.aspect = safeW / safeH;
    cam.clearViewOffset();
    const portrait = safeW / safeH < 0.85;
    const pitch = THREE.MathUtils.degToRad(this.mode === 'top' ? 89 : portrait ? 58 : 50);
    const target = new THREE.Vector3(g.cols / 2, 0, g.rows / 2);
    const m = 0.75;
    const pts: [number, number, number][] = [
      [-m, 0, -m],
      [g.cols + m, 0, -m],
      [-m, 0, g.rows + m],
      [g.cols + m, 0, g.rows + m],
      [-m, 1.2, -m],
      [g.cols + m, 1.2, -m],
    ];
    const place = (d: number) => {
      cam.position.set(target.x, d * Math.sin(pitch), target.z + d * Math.cos(pitch));
      cam.lookAt(target);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
    };
    const box = () => {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const [x, y, z] of pts) {
        this.v3.set(x, y, z).project(cam);
        x0 = Math.min(x0, this.v3.x);
        x1 = Math.max(x1, this.v3.x);
        y0 = Math.min(y0, this.v3.y);
        y1 = Math.max(y1, this.v3.y);
      }
      return { x0, x1, y0, y1 };
    };
    let lo = 3;
    let hi = 400;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      place(mid);
      const b = box();
      if (b.x1 - b.x0 <= 1.96 && b.y1 - b.y0 <= 1.96) hi = mid;
      else lo = mid;
    }
    place(hi);
    const b = box();
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    cam.setViewOffset(safeW, safeH, (cx * safeW) / 2 - ins.left, (-cy * safeH) / 2 - ins.top, W, H);
    cam.updateProjectionMatrix();
    this.camPos.copy(cam.position);
  }

  shake(amp: number, dur: number): void {
    this.shakeAmp = Math.max(this.shakeAmp * (this.shakeT > 0 ? 1 : 0), amp);
    this.shakeT = Math.max(this.shakeT, dur);
  }

  /** 화면 좌표 → 판 위 좌표 */
  pick(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.plane, this.v3);
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  /** 판 위 좌표 → 화면 좌표(px) */
  project(x: number, y: number, z: number): { x: number; y: number } {
    this.v3.set(x, y, z).project(this.camera);
    return { x: ((this.v3.x + 1) / 2) * this.width, y: ((1 - this.v3.y) / 2) * this.height };
  }

  // ───────────────────────── 사건 ─────────────────────────

  onEvents(events: readonly GameEvent[]): void {
    const g = this.game;
    if (!g) return;
    for (const e of events) {
      switch (e.t) {
        case 'flip':
          this.startFlip(e.tile, e.to, e.delay);
          if (e.delay === 0 && this.flipFx > 0) {
            this.flipFx--;
            const c = e.tile % g.cols;
            this.fx.burst(c + 0.5, 0.4, (e.tile - c) / g.cols + 0.5, this.colorOf(e.to), 2, 2.4, 0.09);
          }
          break;
        case 'chip':
          this.chipTile(e.tile, e.team);
          break;
        case 'shot': {
          const cv = this.cannons[e.team];
          if (cv) cv.recoil = 1;
          break;
        }
        case 'clash':
          this.fx.burst(e.x, 0.45, e.z, 0xffffff, 2, 2.5, 0.07);
          break;
        case 'unitDown':
          this.fx.burst(e.x, 0.45, e.z, this.teamColors[e.team]?.light ?? 0xffffff, e.kind === TANK ? 18 : 5, 3, 0.1);
          break;
        case 'bombDrop':
          this.fx.bomb(e.x, e.z, BOMB_DELAY);
          break;
        case 'explode':
          this.fx.explosion(e.x, e.z, e.r, this.teamColors[e.team].tile);
          this.shake(0.28, 0.35);
          break;
        case 'baseHit': {
          const cv = this.cannons[e.team];
          if (cv) cv.hitFlash = 1;
          if (this.humans.includes(e.team)) this.shake(0.06, 0.12);
          break;
        }
        case 'guard': {
          const c = e.tile % g.cols;
          this.fx.burst(c + 0.5, 0.45, (e.tile - c) / g.cols + 0.5, this.teamColors[e.team].light, 3, 2, 0.08);
          break;
        }
        case 'eliminated': {
          const cv = this.cannons[e.team];
          const t = g.teams[e.team];
          if (cv) cv.dead = true;
          this.fx.explosion(t.cx, t.cz, 3.4, this.teamColors[e.team].tile);
          this.shake(0.55, 0.7);
          break;
        }
        case 'gate': {
          const gv = this.gates[e.gate];
          if (gv) gv.pulse = 1;
          break;
        }
        case 'gold': {
          const c = e.tile % g.cols;
          const r = (e.tile - c) / g.cols;
          this.fx.burst(c + 0.5, 0.7, r + 0.5, GOLD_COLOR, 12, 4, 0.1);
          this.fx.ring(c + 0.5, r + 0.5, 1.3, GOLD_COLOR, 0.45);
          break;
        }
        case 'end':
          if (e.winner >= 0) {
            const w = g.teams[e.winner];
            this.fx.ring(w.cx, w.cz, 10, this.teamColors[e.winner].light, 1.4);
          }
          break;
        default:
          break;
      }
    }
  }

  private colorOf(owner: number): number {
    return owner >= 0 ? (this.teamColors[owner]?.tile ?? 0xffffff) : NEUTRAL_TILE;
  }

  /** 칸이 맞았지만 아직 안 뒤집힘: 살짝 튀고 친 팀 색이 비침 */
  private chipTile(t: number, team: number): void {
    const inst = this.tileInst[t];
    if (inst < 0 || this.animOn[t]) return;
    this.chipAt[t] = this.time;
    this.chipTeam[t] = team;
    if (!this.chipOn[t]) {
      this.chipOn[t] = 1;
      this.chips.push(t);
    }
  }

  private startFlip(t: number, to: number, delay: number): void {
    if (this.tileInst[t] < 0) return;
    let from: number;
    if (this.animOn[t]) {
      const p = (this.time - this.animStart[t]) / FLIP_TIME;
      from = p >= 0.5 ? this.animTo[t] : this.animFrom[t];
    } else {
      from = this.shown[t];
      this.animOn[t] = 1;
      this.active.push(t);
    }
    this.animFrom[t] = from;
    this.animTo[t] = to;
    this.animStart[t] = this.time + delay;
  }

  // ───────────────────────── 프레임 ─────────────────────────

  frame(dt: number, alpha: number): void {
    this.time += dt;
    const g = this.game;
    if (g && this.root) {
      this.updateTiles(g);
      this.updateBalls(g, alpha);
      this.updateUnits(g, alpha);
      this.updateCannons(g, dt);
      this.updateGateViews(g, dt);
      this.updateCoins(g);
      this.updateAims(g);
    }
    this.fx.update(dt);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT);
      this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * a * 2, this.camPos.y + (Math.random() - 0.5) * a, this.camPos.z + (Math.random() - 0.5) * a * 2);
    } else {
      this.camera.position.copy(this.camPos);
    }
    this.renderer.render(this.scene, this.camera);
    this.flipFx = this.low ? 12 : 32;
  }

  private updateTiles(g: Game): void {
    const mesh = this.tiles;
    if (!mesh) return;
    const cols = g.cols;
    let changed = false;
    // 맞기만 한 칸: 0.18초 동안 살짝 튀고 친 팀 색이 비침
    for (let k = this.chips.length - 1; k >= 0; k--) {
      const t = this.chips[k];
      const inst = this.tileInst[t];
      const p = (this.time - this.chipAt[t]) / 0.18;
      const c = t % cols;
      const r = (t - c) / cols;
      changed = true;
      if (p >= 1 || this.animOn[t]) {
        this.chipOn[t] = 0;
        this.chips[k] = this.chips[this.chips.length - 1];
        this.chips.pop();
        if (!this.animOn[t]) {
          this.m4.makeTranslation(c + 0.5, TILE_H / 2, r + 0.5);
          mesh.setMatrixAt(inst, this.m4);
          mesh.setColorAt(inst, this.ownerColor[this.shown[t] + 1]);
        }
        continue;
      }
      const s = Math.sin(Math.PI * p);
      this.m4.makeTranslation(c + 0.5, TILE_H / 2 + s * 0.12, r + 0.5);
      mesh.setMatrixAt(inst, this.m4);
      this.col.copy(this.ownerColor[this.shown[t] + 1]).lerp(this.ownerColor[this.chipTeam[t] + 1], 0.45 * s);
      mesh.setColorAt(inst, this.col);
    }
    if (!this.active.length) {
      if (changed) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      return;
    }
    for (let k = this.active.length - 1; k >= 0; k--) {
      const t = this.active[k];
      const p = (this.time - this.animStart[t]) / FLIP_TIME;
      if (p < 0) continue;
      const inst = this.tileInst[t];
      const c = t % cols;
      const r = (t - c) / cols;
      changed = true;
      if (p >= 1) {
        this.m4.makeTranslation(c + 0.5, TILE_H / 2, r + 0.5);
        mesh.setMatrixAt(inst, this.m4);
        mesh.setColorAt(inst, this.ownerColor[this.animTo[t] + 1]);
        this.shown[t] = this.animTo[t];
        this.animOn[t] = 0;
        this.active[k] = this.active[this.active.length - 1];
        this.active.pop();
        continue;
      }
      const s = Math.sin(Math.PI * p);
      this.q.setFromAxisAngle((c + r) & 1 ? this.axisX : this.axisZ, Math.PI * p);
      this.v3.set(c + 0.5, TILE_H / 2 + s * 0.55, r + 0.5);
      const sc = 1 + 0.1 * s;
      this.s3.set(sc, sc, sc);
      this.m4.compose(this.v3, this.q, this.s3);
      mesh.setMatrixAt(inst, this.m4);
      if (p < 0.5) this.col.copy(this.ownerColor[this.animFrom[t] + 1]);
      else this.col.copy(this.ownerColor[this.animTo[t] + 1]).lerp(this.white, 0.55 * (1 - (p - 0.5) * 2));
      mesh.setColorAt(inst, this.col);
    }
    if (changed) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private updateBalls(g: Game, alpha: number): void {
    const core = this.ballCore;
    const trail = this.ballTrail;
    const glow = this.ballGlow;
    if (!core || !trail || !glow) return;
    const B = g.balls;
    const n = B.n;
    const ex = alpha * TICK;
    const cm = core.instanceMatrix.array as Float32Array;
    const tm = trail.instanceMatrix.array as Float32Array;
    const cc = core.instanceColor!.array as Float32Array;
    const tc = trail.instanceColor!.array as Float32Array;
    const gp = this.glowPos;
    const gc = this.glowCol;
    for (let i = 0; i < n; i++) {
      const vx = B.vx[i];
      const vz = B.vz[i];
      const x = B.x[i] + vx * ex;
      const z = B.z[i] + vz * ex;
      const mega = B.kind[i] === 1;
      const s = mega ? 3.2 : 1;
      const y = mega ? 0.78 : 0.42;
      const o = i * 16;
      cm[o] = s;
      cm[o + 1] = 0;
      cm[o + 2] = 0;
      cm[o + 3] = 0;
      cm[o + 4] = 0;
      cm[o + 5] = s;
      cm[o + 6] = 0;
      cm[o + 7] = 0;
      cm[o + 8] = 0;
      cm[o + 9] = 0;
      cm[o + 10] = s;
      cm[o + 11] = 0;
      cm[o + 12] = x;
      cm[o + 13] = y;
      cm[o + 14] = z;
      cm[o + 15] = 1;
      const sp = Math.hypot(vx, vz) || 1;
      const dx = vx / sp;
      const dz = vz / sp;
      const len = mega ? 2.6 : 1.5;
      const w = mega ? 1.1 : 0.34;
      tm[o] = dx * len;
      tm[o + 1] = 0;
      tm[o + 2] = dz * len;
      tm[o + 3] = 0;
      tm[o + 4] = 0;
      tm[o + 5] = 1;
      tm[o + 6] = 0;
      tm[o + 7] = 0;
      tm[o + 8] = -dz * w;
      tm[o + 9] = 0;
      tm[o + 10] = dx * w;
      tm[o + 11] = 0;
      tm[o + 12] = x;
      tm[o + 13] = y - 0.05;
      tm[o + 14] = z;
      tm[o + 15] = 1;
      const team = B.team[i];
      const bc = this.ballColor[team] ?? this.white;
      const lc = this.glowColor[team] ?? this.white;
      const k = i * 3;
      cc[k] = bc.r;
      cc[k + 1] = bc.g;
      cc[k + 2] = bc.b;
      tc[k] = lc.r;
      tc[k + 1] = lc.g;
      tc[k + 2] = lc.b;
      gp[k] = x;
      gp[k + 1] = y;
      gp[k + 2] = z;
      const gk = mega ? 1 : 0.55;
      gc[k] = lc.r * gk;
      gc[k + 1] = lc.g * gk;
      gc[k + 2] = lc.b * gk;
    }
    core.count = n;
    trail.count = n;
    core.instanceMatrix.needsUpdate = true;
    trail.instanceMatrix.needsUpdate = true;
    core.instanceColor!.needsUpdate = true;
    trail.instanceColor!.needsUpdate = true;
    const geo = glow.geometry;
    geo.setDrawRange(0, n);
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  private writeUnitMatrix(arr: Float32Array, i: number, x: number, y: number, z: number, face: number, s: number): void {
    const cf = Math.cos(face) * s;
    const sf = Math.sin(face) * s;
    const o = i * 16;
    arr[o] = cf;
    arr[o + 1] = 0;
    arr[o + 2] = sf;
    arr[o + 3] = 0;
    arr[o + 4] = 0;
    arr[o + 5] = s;
    arr[o + 6] = 0;
    arr[o + 7] = 0;
    arr[o + 8] = -sf;
    arr[o + 9] = 0;
    arr[o + 10] = cf;
    arr[o + 11] = 0;
    arr[o + 12] = x;
    arr[o + 13] = y;
    arr[o + 14] = z;
    arr[o + 15] = 1;
  }

  private updateUnits(g: Game, alpha: number): void {
    const sb = this.soldierBody;
    const sh = this.soldierHead;
    const tb = this.tankBody;
    const tt = this.tankTread;
    if (!sb || !sh || !tb || !tt) return;
    const sbm = sb.instanceMatrix.array as Float32Array;
    const shm = sh.instanceMatrix.array as Float32Array;
    const tbm = tb.instanceMatrix.array as Float32Array;
    const ttm = tt.instanceMatrix.array as Float32Array;
    const sbc = sb.instanceColor!.array as Float32Array;
    const tbc = tb.instanceColor!.array as Float32Array;
    let ns = 0;
    let nt = 0;
    const ex = alpha * TICK;
    for (const u of g.units) {
      const x = u.x + u.vx * ex;
      const z = u.z + u.vz * ex;
      const c = this.teamColors[u.team];
      this.col.set(c.tile);
      if (u.kind === TANK) {
        if (nt >= 200) continue;
        this.writeUnitMatrix(tbm, nt, x, 0, z, u.face, 1);
        this.writeUnitMatrix(ttm, nt, x, 0, z, u.face, 1);
        tbc[nt * 3] = this.col.r;
        tbc[nt * 3 + 1] = this.col.g;
        tbc[nt * 3 + 2] = this.col.b;
        nt++;
      } else {
        if (ns >= MAX_UNITS) continue;
        const moving = u.vx !== 0 || u.vz !== 0;
        const bob = Math.abs(Math.sin(this.time * 12 + u.id)) * (moving ? 0.08 : 0.02);
        this.writeUnitMatrix(sbm, ns, x, bob, z, u.face, 1);
        this.writeUnitMatrix(shm, ns, x, bob, z, u.face, 1);
        sbc[ns * 3] = this.col.r;
        sbc[ns * 3 + 1] = this.col.g;
        sbc[ns * 3 + 2] = this.col.b;
        ns++;
      }
    }
    sb.count = ns;
    sh.count = ns;
    tb.count = nt;
    tt.count = nt;
    for (const m of [sb, sh, tb, tt]) m.instanceMatrix.needsUpdate = true;
    sb.instanceColor!.needsUpdate = true;
    tb.instanceColor!.needsUpdate = true;
  }

  private updateCannons(g: Game, dt: number): void {
    g.teams.forEach((t, i) => {
      const cv = this.cannons[i];
      if (!cv) return;
      if (cv.dead || !t.alive) {
        if (cv.turret.visible) {
          cv.turret.visible = false;
          cv.ring.visible = false;
          cv.platformMat.color.set(0x23262e);
          cv.platformMat.emissiveIntensity = 0;
        }
        cv.ice.visible = false;
        return;
      }
      cv.turret.rotation.y = -t.angle;
      cv.recoil = Math.max(0, cv.recoil - dt * 9);
      cv.barrel.position.x = -cv.recoil * 0.16;
      cv.ice.visible = g.time < t.frozenUntil;
      cv.hitFlash = Math.max(0, cv.hitFlash - dt * 4);
      cv.platformMat.emissiveIntensity = cv.hitFlash * 0.9;
      const rapid = g.time < t.rapidUntil;
      const s = rapid ? 1 + 0.12 * Math.sin(this.time * 26) : 1 + 0.04 * Math.sin(this.time * 3 + i);
      cv.ring.scale.set(s, 1, s);
    });
  }

  private updateGateViews(g: Game, dt: number): void {
    g.gates.forEach((gt, i) => {
      const gv = this.gates[i];
      if (!gv) return;
      gv.group.position.set(gt.x, 0, gt.z);
      if (gt.owner !== gv.owner) {
        gv.owner = gt.owner;
        const color = gt.owner >= 0 ? this.teamColors[gt.owner].tile : 0xffffff;
        gv.postMat.color.set(color);
        gv.panelMat.color.set(color);
      }
      if (gt.hits !== gv.lastHits) {
        gv.lastHits = gt.hits;
        gv.pulse = 1;
      }
      gv.pulse = Math.max(0, gv.pulse - dt * 3.5);
      const s = 1 + gv.pulse * 0.22;
      gv.label.scale.set(1.35 * s, 0.68 * s, 1);
      gv.panelMat.opacity = 0.2 + 0.4 * gv.pulse;
    });
  }

  private updateCoins(g: Game): void {
    const coins = this.coins;
    if (!coins || !this.goldTiles.length) return;
    this.goldTiles.forEach((idx, k) => {
      const c = idx % g.cols;
      const r = (idx - c) / g.cols;
      if (!g.gold[idx]) {
        this.m4.makeScale(0, 0, 0);
      } else {
        this.q.setFromAxisAngle(this.axisX.set(0, 1, 0), this.time * 2.2 + k);
        this.axisX.set(1, 0, 0);
        this.v3.set(c + 0.5, TILE_H + 0.42 + Math.sin(this.time * 3 + k) * 0.06, r + 0.5);
        this.s3.set(1, 1, 1);
        this.m4.compose(this.v3, this.q, this.s3);
      }
      coins.setMatrixAt(k, this.m4);
    });
    coins.instanceMatrix.needsUpdate = true;
  }

  private updateAims(g: Game): void {
    for (const a of this.aims) {
      const t = g.teams[a.team];
      const show = t.alive && !g.over;
      a.dots.visible = show;
      a.ring.visible = show;
      if (!show) continue;
      const tr = traceShot(g, a.team, t.angle, 30, true);
      const pts = tr.points;
      let n = 0;
      let carry = 0.3;
      const step = 0.55;
      for (let k = 0; k + 3 < pts.length && n < AIM_DOTS; k += 2) {
        const x0 = pts[k];
        const z0 = pts[k + 1];
        const x1 = pts[k + 2];
        const z1 = pts[k + 3];
        const len = Math.hypot(x1 - x0, z1 - z0);
        let d = carry;
        while (d < len && n < AIM_DOTS) {
          const f = d / len;
          a.pos[n * 3] = x0 + (x1 - x0) * f;
          a.pos[n * 3 + 1] = TILE_H + 0.12;
          a.pos[n * 3 + 2] = z0 + (z1 - z0) * f;
          n++;
          d += step;
        }
        carry = d - len;
      }
      const geo = a.dots.geometry;
      geo.setDrawRange(0, n);
      (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      const ex = pts[pts.length - 2];
      const ez = pts[pts.length - 1];
      a.ring.position.set(ex, TILE_H + 0.1, ez);
      const s = 1 + 0.15 * Math.sin(this.time * 7);
      a.ring.scale.set(s, 1, s);
    }
  }

  dispose(): void {
    this.clearLevel();
    this.renderer.dispose();
  }
}
