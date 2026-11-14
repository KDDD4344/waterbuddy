/**
 * What lives in the spring: drifting lily pads (three with water lilies that open as the
 * day's drinking goes on), a small shoal of minnows that scatter from a splash and come
 * back curious, and two dragonflies that hover, dart, and loop when Buddy celebrates.
 */
import * as THREE from 'three';
import { mulberry32 } from './noise';
import { shared } from './shared';
import { withEnv } from './materials';
import { lilyTexture } from './textures';
import { poolRadiusAtLevel, terrainHeight, SEAT } from './world';
import type { Water } from './water';

const POOL_Z = 0.2;

function petalGeometry(len: number, wid: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(wid, len * 0.25, wid * 0.8, len * 0.8, 0, len);
  s.bezierCurveTo(-wid * 0.8, len * 0.8, -wid, len * 0.25, 0, 0);
  const g = new THREE.ShapeGeometry(s, 8);
  const p = g.attributes.position as THREE.BufferAttribute;
  const col: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setZ(i, ((x * x) / wid) * 1.2);
    const t = y / len;
    col.push(1, Math.pow(0.9 - 0.25 * t, 2.2), Math.pow(0.94 - 0.18 * t, 2.2));
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export interface Lily {
  group: THREE.Group;
  pad: THREE.Mesh;
  home: THREE.Vector2;
  angle: number;
  orbit: number;
  bob: number;
  bobV: number;
  /** A nudge: drift around the pool and spin, both easing off. */
  angV: number;
  spinV: number;
  /** Petals ruffle when the pad is touched. */
  flutter: number;
  tiltX: number;
  tiltZ: number;
  /** `anchor` marks where each petal sits; the petals themselves are drawn instanced. */
  petals: { pivot: THREE.Group; anchor: THREE.Object3D; ring: number }[];
}

export interface Life {
  group: THREE.Group;
  lilies: Lily[];
  fish: THREE.Group[];
  pads: THREE.Mesh[];
  /** Touch a pad: it dips, bobs, and drifts and turns away from where it was touched. */
  poke(pad: THREE.Object3D, at?: THREE.Vector3): Lily | null;
  scare(at: THREE.Vector3, strength?: number): void;
  celebrate(): void;
  /** Things worth glancing at, for Buddy's idle gaze. */
  interesting(out: THREE.Vector3[]): void;
  update(dt: number, t: number, progress: number, water: Water, bloom: number): void;
}

export function buildLife(renderer: THREE.WebGLRenderer, lowQuality: boolean): Life {
  const group = new THREE.Group();
  const r = mulberry32(64);

  // Lily pads.
  const padTex = lilyTexture(renderer);
  const padMat = withEnv(new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.38, side: THREE.DoubleSide }), {
    dapple: 1,
    lush: 1,
    translucent: 0.25
  });
  const padGeo = new THREE.CircleGeometry(1, 48, 0.25, Math.PI * 2 - 0.42);
  padGeo.rotateX(-Math.PI / 2);
  {
    const p = padGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const d = Math.hypot(p.getX(i), p.getZ(i));
      p.setY(i, 0.05 * d ** 4);
    }
    padGeo.computeVertexNormals();
  }
  const petalMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.55,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0.06, 0.025, 0.035)
  });
  const outerGeo = petalGeometry(0.13, 0.05);
  const innerGeo = petalGeometry(0.1, 0.04);
  const centerMat = new THREE.MeshStandardMaterial({
    color: 0xf3c847,
    roughness: 0.6,
    emissive: new THREE.Color(0.08, 0.05, 0.0)
  });
  const homes: [number, number, number, boolean][] = [
    [-1.6, -0.5, 0.3, true],
    [-2.1, 0.7, 0.22, false],
    [-0.9, -1.3, 0.26, false],
    [0.4, 0.5, 0.2, false],
    [1.7, 0.9, 0.3, true],
    [-1.2, 1.25, 0.18, false],
    [2.2, -0.2, 0.24, false],
    [0.0, -1.9, 0.28, true],
    [-2.4, -1.3, 0.2, false]
  ];
  const lilies: Lily[] = homes.map(([x, z, s, flower]) => {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.scale.setScalar(s);
    pad.rotation.y = r() * 6.28;
    pad.receiveShadow = true;
    pad.castShadow = true;
    g.add(pad);
    const petals: Lily['petals'] = [];
    if (flower) {
      const head = new THREE.Group();
      head.position.y = 0.02;
      g.add(head);
      for (const [ring, n] of [
        [0, 9],
        [1, 7]
      ] as const) {
        for (let i = 0; i < n; i++) {
          const pivot = new THREE.Group();
          pivot.rotation.y = (i / n) * Math.PI * 2 + ring * 0.3;
          const tilt = new THREE.Group();
          pivot.add(tilt);
          const anchor = new THREE.Object3D();
          anchor.rotation.x = -Math.PI / 2;
          tilt.add(anchor);
          head.add(pivot);
          petals.push({ pivot: tilt, anchor, ring });
        }
      }
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), centerMat);
      c.scale.y = 0.6;
      head.add(c);
    }
    group.add(g);
    return {
      group: g,
      pad,
      home: new THREE.Vector2(x, z),
      angle: Math.atan2(z - POOL_Z, x),
      orbit: Math.hypot(x, z - POOL_Z),
      bob: 0,
      bobV: 0,
      angV: 0,
      spinV: 0,
      flutter: 0,
      tiltX: 0,
      tiltZ: 0,
      petals
    };
  });

  // Petals: 48 of them, so they're drawn as two instanced meshes (outer and inner ring)
  // instead of 48 draw calls in every pass. Their matrices follow the anchors each frame.
  const petalSets = ([0, 1] as const).map((ring) => {
    const list = lilies.flatMap((l) => l.petals.filter((p) => p.ring === ring));
    const mesh = new THREE.InstancedMesh(ring === 0 ? outerGeo : innerGeo, petalMat, list.length);
    mesh.castShadow = true;
    // They drift with the pads; a fixed bounding sphere would cull them wrongly.
    mesh.frustumCulled = false;
    group.add(mesh);
    return { mesh, list };
  });
  const groupInv = new THREE.Matrix4();
  const petalM = new THREE.Matrix4();
  const syncPetals = () => {
    group.updateMatrixWorld(true);
    groupInv.copy(group.matrixWorld).invert();
    for (const { mesh, list } of petalSets) {
      list.forEach((p, i) => mesh.setMatrixAt(i, petalM.multiplyMatrices(groupInv, p.anchor.matrixWorld)));
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  syncPetals();

  // Minnows.
  const fish: THREE.Group[] = [];
  const fishState: {
    pos: THREE.Vector3;
    head: number;
    speed: number;
    flee: number;
    tail: THREE.Object3D;
    phase: number;
  }[] = [];
  const bodyGeo = new THREE.SphereGeometry(1, 16, 10);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.lineTo(-0.07, 0.035);
  tailShape.lineTo(-0.06, 0);
  tailShape.lineTo(-0.07, -0.035);
  tailShape.lineTo(0, 0);
  const tailGeo = new THREE.ShapeGeometry(tailShape);
  const golds = [0xf09a3e, 0xe8b04a, 0xd9d2bc, 0xf0a050, 0xb9c8c0, 0xe58a3a, 0xcfc8b0];
  const nFish = lowQuality ? 5 : 7;
  for (let i = 0; i < nFish; i++) {
    const fm = new THREE.MeshStandardMaterial({
      color: golds[i % golds.length]!,
      roughness: 0.35,
      metalness: 0.25,
      side: THREE.DoubleSide
    });
    const f = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, fm);
    body.scale.set(0.11, 0.035, 0.03);
    f.add(body);
    const tail = new THREE.Group();
    tail.position.x = -0.1;
    const tm = new THREE.Mesh(tailGeo, fm);
    tail.add(tm);
    f.add(tail);
    const s = 0.8 + r() * 0.5;
    f.scale.setScalar(s);
    group.add(f);
    fish.push(f);
    fishState.push({
      pos: new THREE.Vector3((r() - 0.5) * 3, -0.5, POOL_Z + (r() - 0.5) * 2),
      head: r() * 6.28,
      speed: 0.25 + r() * 0.15,
      flee: 0,
      tail,
      phase: r() * 6
    });
  }

  // Dragonflies.
  const flyBody = new THREE.MeshStandardMaterial({
    color: 0x1f8f9a,
    roughness: 0.25,
    metalness: 0.6,
    emissive: new THREE.Color(0.02, 0.12, 0.14)
  });
  const wingMat = new THREE.MeshBasicMaterial({
    color: 0xdff4ff,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const flies = [0, 1].map((k) => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.15, 4, 8), flyBody);
    b.rotation.z = Math.PI / 2;
    g.add(b);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), flyBody);
    head.position.x = 0.09;
    g.add(head);
    const wings: THREE.Mesh[] = [];
    for (const [x, side] of [
      [0.03, 1],
      [0.03, -1],
      [-0.005, 1],
      [-0.005, -1]
    ] as const) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.12), wingMat);
      w.geometry.translate(0, 0.06, 0);
      const pv = new THREE.Group();
      pv.position.set(x, 0.01, 0);
      pv.rotation.x = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      pv.add(w);
      pv.userData.side = side;
      g.add(pv);
      wings.push(w);
    }
    group.add(g);
    return {
      g,
      pos: new THREE.Vector3(-1 + k * 2, 0.9, 0),
      target: new THREE.Vector3(-1 + k * 2, 0.9, 0),
      wait: 1 + k,
      loop: 0,
      heading: 0
    };
  });

  let celebrating = 0;
  const tmp = new THREE.Vector3();

  return {
    group,
    lilies,
    fish,
    pads: lilies.map((l) => l.pad),
    poke(o, at) {
      const l = lilies.find((x) => x.pad === o || x.group === o.parent) ?? null;
      if (!l) return null;
      l.bobV -= 0.55;
      l.flutter = 1;
      if (at) {
        // Pushed away from the touch: along the pool's circle, plus a turn from an off-centre touch.
        const p = l.group.position;
        const ox = p.x - at.x;
        const oz = p.z - at.z;
        const tx = -Math.sin(l.angle);
        const tz = Math.cos(l.angle);
        l.angV += ((ox * tx + oz * tz) / Math.max(0.05, Math.hypot(ox, oz))) * 0.12;
        l.spinV += (ox * (at.z - p.z) - oz * (at.x - p.x) >= 0 ? 1 : -1) * 0.5 + (Math.random() - 0.5) * 0.3;
      } else l.spinV += (Math.random() - 0.5) * 0.6;
      return l;
    },
    scare(at, strength = 1) {
      for (const f of fishState) {
        const d = Math.hypot(f.pos.x - at.x, f.pos.z - at.z);
        if (d < 1.8) {
          f.flee = Math.max(f.flee, strength * (1 - d / 1.8));
          f.head = Math.atan2(f.pos.z - at.z, f.pos.x - at.x);
        }
      }
    },
    celebrate() {
      celebrating = 3.5;
    },
    interesting(out) {
      out.length = 0;
      for (const f of fishState.slice(0, 2)) out.push(f.pos);
      for (const fl of flies) out.push(fl.pos);
    },
    update(dt, t, progress, water, bloom) {
      const level = shared.uLevel.value;
      const poolR = poolRadiusAtLevel(level);
      // Lilies drift around the pool and gather inward when the water is low.
      for (const l of lilies) {
        l.angle += dt * 0.012 + l.angV * dt;
        l.angV *= Math.exp(-dt * 0.8);
        l.flutter *= Math.exp(-dt * 2.2);
        const rad = Math.min(l.orbit, poolR * 0.82);
        const x = Math.cos(l.angle) * rad;
        const z = Math.sin(l.angle) * rad + POOL_Z;
        l.bobV += (-l.bob * 30 - l.bobV * 3.5) * dt;
        l.bob += l.bobV * dt;
        l.group.position.set(x, water.heightAt(x, z) + 0.006 + l.bob * 0.04, z);
        l.group.rotation.y += dt * (0.03 + l.spinV);
        l.spinV *= Math.exp(-dt * 1.1);
        // Ride the surface: tilt with its slope, so passing ripples rock the pad.
        const e = 0.18;
        const sx = (water.heightAt(x + e, z) - water.heightAt(x - e, z)) / (2 * e);
        const sz = (water.heightAt(x, z + e) - water.heightAt(x, z - e)) / (2 * e);
        l.tiltX += (sz * 3 - l.tiltX) * (1 - Math.exp(-dt * 6));
        l.tiltZ += (-sx * 3 - l.tiltZ) * (1 - Math.exp(-dt * 6));
        l.group.rotation.x = l.bob * 0.4 + l.tiltX;
        l.group.rotation.z = l.tiltZ;
        const open = Math.min(1, 0.15 + 0.8 * progress + 0.25 * bloom);
        l.petals.forEach((p, i) => {
          const base = p.ring === 0 ? 0.25 + 1.0 * open : 0.12 + 0.7 * open;
          p.pivot.rotation.x = -base + 0.04 * Math.sin(t * 2 + i) + 0.12 * l.flutter * Math.sin(t * 14 + i * 1.7);
        });
      }
      syncPetals();
      // Fish wander below the surface, inside the pool, above the floor.
      for (const f of fishState) {
        const k = f.flee;
        f.flee = Math.max(0, f.flee - dt * 0.6);
        f.head += (Math.sin(t * 0.5 + f.phase) * 0.6 + Math.sin(t * 1.3 + f.phase * 2) * 0.3) * dt;
        const dc = Math.hypot(f.pos.x, f.pos.z - POOL_Z);
        if (dc > poolR * 0.72) {
          const want = Math.atan2(POOL_Z - f.pos.z, -f.pos.x);
          let dh = want - f.head;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          f.head += dh * dt * 2.5;
        }
        const sp = f.speed * (1 + k * 6);
        f.pos.x += Math.cos(f.head) * sp * dt;
        f.pos.z += Math.sin(f.head) * sp * dt;
        const floor = terrainHeight(f.pos.x, f.pos.z) + 0.12;
        const want = Math.max(floor, level - 0.22 - 0.12 * Math.sin(t * 0.4 + f.phase));
        f.pos.y += (Math.min(want, level - 0.12) - f.pos.y) * dt * 2;
        f.tail.rotation.y = Math.sin(t * (9 + k * 20) + f.phase) * 0.5;
      }
      fishState.forEach((f, i) => {
        const g = fish[i]!;
        g.position.copy(f.pos);
        g.rotation.set(0, -f.head, Math.sin(t * 2 + f.phase) * 0.05);
      });
      // Dragonflies: hover, then dart to a new spot; loop around Buddy on celebrations.
      celebrating = Math.max(0, celebrating - dt);
      flies.forEach((fl, k) => {
        fl.wait -= dt;
        if (celebrating > 0) {
          const a = t * 2.6 + k * Math.PI;
          fl.target.set(
            SEAT.x + Math.cos(a) * 0.9,
            SEAT.y + 0.9 + Math.sin(t * 3 + k) * 0.15,
            SEAT.z + Math.sin(a) * 0.6
          );
        } else if (fl.wait <= 0) {
          fl.wait = 1.5 + r() * 3.5;
          const a = r() * Math.PI * 2;
          const d = r() * poolR * 0.9;
          fl.target.set(Math.cos(a) * d, level + 0.35 + r() * 1.1, Math.sin(a) * d + POOL_Z);
        }
        tmp.copy(fl.target).sub(fl.pos);
        const dist = tmp.length();
        const speed = celebrating > 0 ? 6 : dist > 0.05 ? 3.2 : 0;
        fl.pos.addScaledVector(tmp, Math.min(1, dt * speed));
        if (dist > 0.02) {
          const want = Math.atan2(-tmp.z, tmp.x);
          let dh = want - fl.heading;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          fl.heading += dh * Math.min(1, dt * 10);
        }
        fl.g.position.copy(fl.pos);
        fl.g.position.y += Math.sin(t * 7 + k) * 0.015;
        fl.g.rotation.set(0, fl.heading, 0);
        fl.g.children.forEach((c) => {
          const side = c.userData.side as number | undefined;
          if (side)
            c.rotation.x = (-side * Math.PI) / 2 + side * Math.sin(t * 47 + k + (c.position.x > 0.01 ? 0 : 1.3)) * 0.55;
        });
      });
    }
  };
}
