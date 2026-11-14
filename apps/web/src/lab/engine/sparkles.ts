/** A burst of four-pointed sparkles for celebrations (and a small one for touches). */
import * as THREE from 'three';
import { shared } from './shared';

export interface Sparkles {
  points: THREE.Points;
  burst(at: THREE.Vector3, count: number, power?: number): void;
  update(dt: number, px: number): void;
}

export function buildSparkles(max = 140): Sparkles {
  const pos = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const hue = new Float32Array(max);
  const vel: THREE.Vector3[] = Array.from({ length: max }, () => new THREE.Vector3());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
  g.setAttribute('aHue', new THREE.BufferAttribute(hue, 1));
  const uPx = { value: 1 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPx, uTime: shared.uTime },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aLife; attribute float aHue; uniform float uPx, uTime; varying float vL; varying float vH;
      void main(){ vL = aLife; vH = aHue; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aLife > 0.0 ? (0.07 + 0.05 * sin(uTime * 20.0 + aHue * 40.0)) * uPx / -mv.z * smoothstep(0.0, 0.3, aLife) : 0.0;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      varying float vL; varying float vH;
      void main(){ vec2 c = (gl_PointCoord - 0.5) * 2.0;
        float star = max(1.0 - abs(c.x) * 6.0 - abs(c.y) * 0.9, 0.0) + max(1.0 - abs(c.y) * 6.0 - abs(c.x) * 0.9, 0.0);
        float core = exp(-dot(c, c) * 10.0);
        vec3 col = mix(vec3(1.0, 0.86, 0.5), mix(vec3(0.7, 0.95, 1.0), vec3(1.0, 0.75, 0.85), step(0.66, vH)), step(0.33, vH));
        gl_FragColor = vec4(col * (star + core) * min(1.0, vL * 2.0), 1.0); }`
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = 7;
  let next = 0;
  return {
    points,
    burst(at, count, power = 1) {
      for (let k = 0; k < count; k++) {
        const i = next;
        next = (next + 1) % max;
        pos[i * 3] = at.x;
        pos[i * 3 + 1] = at.y;
        pos[i * 3 + 2] = at.z;
        const a = Math.random() * Math.PI * 2;
        const up = Math.random();
        vel[i]!.set(
          Math.cos(a) * (0.6 + Math.random()),
          0.6 + up * 1.6,
          Math.sin(a) * (0.6 + Math.random())
        ).multiplyScalar(power);
        life[i] = 1 + Math.random() * 0.6;
        hue[i] = Math.random();
      }
    },
    update(dt, px) {
      uPx.value = px;
      for (let i = 0; i < max; i++) {
        if (life[i]! <= 0) continue;
        life[i] = life[i]! - dt * 0.7;
        const v = vel[i]!;
        v.multiplyScalar(Math.exp(-dt * 1.8));
        v.y -= dt * 0.6;
        pos[i * 3] = pos[i * 3]! + v.x * dt;
        pos[i * 3 + 1] = pos[i * 3 + 1]! + v.y * dt;
        pos[i * 3 + 2] = pos[i * 3 + 2]! + v.z * dt;
      }
      (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (g.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
    }
  };
}
