/**
 * Face kit shared by the three Buddies: glossy bead eyes that blink, widen and turn into
 * happy arcs, optional brows, a shader-drawn mouth that smiles, opens and rounds into an "o",
 * and soft cheeks. Each character chooses sizes, colours and where they sit on its body.
 */
import * as THREE from 'three';
import type { Pose } from '../animator';

const OUT = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>`;

/** Finds the body surface in front of (x, y) in the body's local space: position and normal. */
export function surfaceAt(body: THREE.Mesh, x: number, y: number): { p: THREE.Vector3; n: THREE.Vector3 } {
  body.updateMatrixWorld(true);
  const inv = body.matrixWorld.clone().invert();
  const rc = new THREE.Raycaster();
  rc.layers.enableAll();
  const origin = new THREE.Vector3(x, y, 5).applyMatrix4(body.matrixWorld);
  const dir = new THREE.Vector3(0, 0, -1).transformDirection(body.matrixWorld);
  rc.set(origin, dir);
  const hit = rc.intersectObject(body, false)[0];
  if (!hit) return { p: new THREE.Vector3(x, y, 0.3), n: new THREE.Vector3(0, 0, 1) };
  const p = hit.point.clone().applyMatrix4(inv);
  const n = (hit.face?.normal ?? new THREE.Vector3(0, 0, 1)).clone().normalize();
  return { p, n };
}

/** Puts `obj` on the surface, facing out along the normal (blended toward +z so faces stay flat-on). */
export function placeOn(obj: THREE.Object3D, s: { p: THREE.Vector3; n: THREE.Vector3 }, lift = 0.004, flatten = 0.45) {
  const n = s.n
    .clone()
    .lerp(new THREE.Vector3(0, 0, 1), flatten)
    .normalize();
  obj.position.copy(s.p).addScaledVector(n, lift);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
}

export interface EyeOptions {
  size: number;
  /** Width:height of the bead. */
  aspect?: number;
  color?: THREE.ColorRepresentation;
  /** Resting openness, 1 = round. Cobble rests a little sleepy. */
  rest?: number;
  sparkle?: number;
  brow?: THREE.ColorRepresentation | null;
}

export interface Eye {
  group: THREE.Group;
  update(pose: Pose, look: THREE.Vector2, side: number): void;
}

const ballGeo = new THREE.SphereGeometry(1, 28, 18);
const dotGeo = new THREE.SphereGeometry(1, 12, 8);
const arcGeo = new THREE.TorusGeometry(0.62, 0.17, 8, 24, Math.PI);
const browGeo = new THREE.CapsuleGeometry(0.16, 0.9, 4, 10);

export function makeEye(o: EyeOptions): Eye {
  const size = o.size;
  const aspect = o.aspect ?? 0.82;
  const rest = o.rest ?? 1;
  const color = new THREE.Color(o.color ?? 0x161c2b);
  const group = new THREE.Group();
  const look = new THREE.Group();
  group.add(look);
  const ballMat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.2
  });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.scale.set(size * aspect, size, size * 0.42);
  look.add(ball);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const sp = o.sparkle ?? 1;
  const hi1 = new THREE.Mesh(dotGeo, white);
  hi1.scale.setScalar(size * 0.26 * sp);
  hi1.position.set(-size * 0.3, size * 0.36, size * 0.4);
  const hi2 = new THREE.Mesh(dotGeo, white);
  hi2.scale.setScalar(size * 0.12 * sp);
  hi2.position.set(size * 0.26, -size * 0.3, size * 0.4);
  look.add(hi1, hi2);
  const arc = new THREE.Mesh(arcGeo, ballMat);
  arc.scale.setScalar(size);
  arc.position.y = -size * 0.25;
  arc.visible = false;
  group.add(arc);
  let brow: THREE.Mesh | null = null;
  if (o.brow) {
    brow = new THREE.Mesh(browGeo, new THREE.MeshStandardMaterial({ color: o.brow, roughness: 0.7 }));
    brow.rotation.z = Math.PI / 2;
    brow.scale.setScalar(size * 0.75);
    group.add(brow);
  }

  return {
    group,
    update(p, lk, side) {
      const happy = Math.min(1, p.squint * 1.4);
      const open = Math.max(0.07, rest * (1 - p.blink) * (1 + 0.16 * p.wide) * (1 - happy));
      ball.scale.set(size * aspect * (1 + 0.1 * p.wide), size * open * (1 + 0.1 * p.wide), size * 0.42);
      look.position.set(lk.x * size * 0.32, lk.y * size * 0.24, 0);
      hi1.visible = hi2.visible = open > 0.25;
      ball.visible = open > 0.08 || happy < 0.5;
      arc.visible = happy > 0.15;
      arc.scale.set(size * aspect * 1.05, size * happy, size);
      if (brow) {
        brow.position.set(
          lk.x * size * 0.1,
          size * (1.12 + 0.35 * p.wide - 0.18 * happy + (rest - 1) * 0.6),
          size * 0.15
        );
        brow.rotation.z = Math.PI / 2 + side * (0.12 * p.wide - 0.2 * p.tilt * side + 0.08 * happy);
      }
    }
  };
}

export interface Mouth {
  mesh: THREE.Mesh;
  update(p: Pose): void;
}

export function makeMouth(width: number, ink: THREE.ColorRepresentation = 0x3b1f2a): Mouth {
  const uniforms = {
    uSmile: { value: 0.3 },
    uOpen: { value: 0 },
    uRound: { value: 0 },
    uInk: { value: new THREE.Color(ink) },
    uTongue: { value: new THREE.Color(0xe8798a) }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    vertexShader: /* glsl */ `
      uniform float uSmile, uOpen, uRound; varying vec2 vP;
      void main(){
        vec2 p = position.xy; vP = p;
        float w = mix(1.0, 0.42, uRound);
        float h = mix(0.13, 1.0, max(uOpen, uRound * 0.75));
        vec2 q = vec2(p.x * w, p.y * h * 0.5);
        if (p.y < 0.0) q.y *= mix(1.0, 1.7, uOpen * (1.0 - uRound));
        q.y += uSmile * (p.x * p.x - 0.35) * 0.38 * (1.0 - uRound);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpen, uRound; uniform vec3 uInk, uTongue; varying vec2 vP;
      void main(){
        float r = length(vP);
        float a = 1.0 - smoothstep(0.86, 1.0, r);
        vec3 c = uInk;
        float tongue = smoothstep(-0.25, -0.6, vP.y) * smoothstep(0.2, 0.45, uOpen) * (1.0 - uRound);
        c = mix(c, uTongue, tongue * (1.0 - smoothstep(0.6, 0.95, r)));
        gl_FragColor = vec4(c, a);
        ${OUT}
      }`
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 40), mat);
  mesh.scale.setScalar(width / 2);
  mesh.renderOrder = 3;
  return {
    mesh,
    update(p) {
      uniforms.uSmile.value = p.smile;
      uniforms.uOpen.value = p.open;
      uniforms.uRound.value = p.round;
    }
  };
}

export function makeCheek(size: number, color: THREE.ColorRepresentation, strength = 0.55): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uA: { value: strength } },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uA; varying vec2 vUv;
      void main(){ float d = length((vUv - 0.5) * vec2(1.0, 1.6)) * 2.0; gl_FragColor = vec4(uColor, uA * (1.0 - smoothstep(0.2, 1.0, d))); ${OUT} }`
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.renderOrder = 2;
  return m;
}

/** Turns a world-space look target into a small 2D offset for the eyes, given the face's world matrix. */
export function lookOffset(face: THREE.Object3D, target: THREE.Vector3, out: THREE.Vector2): THREE.Vector2 {
  const local = face.worldToLocal(target.clone());
  const len = Math.max(0.001, local.length());
  out.set(THREE.MathUtils.clamp(local.x / len, -1, 1) * 1.4, THREE.MathUtils.clamp(local.y / len, -1, 1) * 1.4);
  out.x = THREE.MathUtils.clamp(out.x, -1, 1);
  out.y = THREE.MathUtils.clamp(out.y, -1, 1);
  return out;
}
