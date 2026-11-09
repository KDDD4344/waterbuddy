import * as THREE from 'three';
import { OUTPUT } from './shaders';

/** A fixed pool of soft round particles (splashes, bubbles). No allocation per frame. */
export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private age: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private geo: THREE.BufferGeometry;

  constructor(
    private max: number,
    { color = 0xffffff, ring = false }: { color?: number; ring?: boolean } = {}
  ) {
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uScale: { value: 300 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; varying float vA;
        void main(){ vec2 p = gl_PointCoord - 0.5; float r = length(p); if (r > 0.5) discard;
          float a = ${ring ? 'smoothstep(0.5, 0.38, r) * (0.35 + smoothstep(0.3, 0.46, r))' : 'smoothstep(0.5, 0.1, r)'};
          vec3 c = uColor + ${ring ? 'vec3(0.25) * smoothstep(0.2, 0.0, length(p - vec2(-0.15, 0.15)))' : 'vec3(0.0)'};
          gl_FragColor = vec4(c, a * vA); ${OUTPUT} }`,
      transparent: true,
      depthWrite: false
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    // Particles are decoration: never let them swallow taps meant for Pip.
    this.points.raycast = () => {};
  }

  spawn(p: THREE.Vector3, v: THREE.Vector3, life: number, size: number) {
    let i = -1;
    for (let k = 0; k < this.max; k++) {
      if ((this.life[k] ?? 0) <= 0) {
        i = k;
        break;
      }
    }
    if (i < 0) return;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = life;
    this.age[i] = 0;
    this.size[i] = size;
  }

  update(dt: number, { gravity = -9, drag = 0.5, fadeIn = 0.05, ceiling }: { gravity?: number; drag?: number; fadeIn?: number; ceiling?: number } = {}) {
    const P = this.pos;
    const V = this.vel;
    for (let i = 0; i < this.max; i++) {
      const life = this.life[i] ?? 0;
      if (life <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      const age = (this.age[i] ?? 0) + dt;
      this.age[i] = age;
      const k = i * 3;
      const dr = Math.exp(-drag * dt);
      V[k + 1] = ((V[k + 1] ?? 0) + gravity * dt) * dr;
      V[k] = (V[k] ?? 0) * dr;
      V[k + 2] = (V[k + 2] ?? 0) * dr;
      P[k] = (P[k] ?? 0) + (V[k] ?? 0) * dt;
      P[k + 1] = (P[k + 1] ?? 0) + (V[k + 1] ?? 0) * dt;
      P[k + 2] = (P[k + 2] ?? 0) + (V[k + 2] ?? 0) * dt;
      const t = age / life;
      if (t >= 1 || (ceiling !== undefined && (P[k + 1] ?? 0) > ceiling)) {
        this.life[i] = 0;
        this.alpha[i] = 0;
        continue;
      }
      this.alpha[i] = Math.min(1, age / fadeIn) * (1 - t * t);
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  activeCount(): number {
    let n = 0;
    for (let i = 0; i < this.max; i++) if ((this.life[i] ?? 0) > 0) n++;
    return n;
  }

  dispose() {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
