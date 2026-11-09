/**
 * The Today tidepool: depth-graded water, light shafts, caustics on the sand, swaying
 * seagrass, drifting motes and a small school of fish. All procedural, no texture downloads.
 * `quality: 'low'` drops the costliest extras for slower phones.
 */
import * as THREE from 'three';
import { OUTPUT } from './shaders';

export type Quality = 'high' | 'low';

export interface Tidepool {
  group: THREE.Group;
  /** Where the contact shadow sits (Pip's bottle). */
  setShadow(x: number, z: number): void;
  update(dt: number, t: number, camera: THREE.Camera): void;
  dispose(): void;
}

export function buildTidepool(quality: Quality = 'high'): Tidepool {
  const group = new THREE.Group();
  const uTime = { value: 0 };
  const hiQ = quality === 'high';

  const bg = new THREE.Mesh(
    new THREE.SphereGeometry(70, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uTime },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; varying vec3 vP;
        void main(){ float h = vP.y;
          vec3 deep = vec3(0.05, 0.24, 0.29), mid = vec3(0.19, 0.50, 0.53), top = vec3(0.70, 0.89, 0.86);
          vec3 c = mix(deep, mid, smoothstep(-0.45, 0.12, h)); c = mix(c, top, smoothstep(0.12, 0.78, h));
          float g = pow(max(dot(vP, normalize(vec3(0.25, 1.0, -0.35))), 0.0), 16.0);
          c += g * vec3(1.0, 0.93, 0.78) * 0.55;
          float sh = smoothstep(0.5, 0.92, h) * (0.5 + 0.5 * sin(vP.x * 38.0 + uTime * 1.1) * sin(vP.z * 33.0 - uTime * 0.8));
          c += sh * 0.1;
          gl_FragColor = vec4(c, 1.0); ${OUTPUT} }`
    })
  );
  group.add(bg);

  const shadow = { value: new THREE.Vector3(-0.3, 0.45, 2.0) };
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.ShaderMaterial({
      uniforms: { uTime, uShadow: shadow },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uShadow; varying vec3 vW;
        float caustic(vec2 p, float t){ vec2 i = p; float c = 1.0; float inten = 0.005;
          for (int n = 0; n < 4; n++) { float tt = t * (1.0 - (3.5 / float(n + 1)));
            i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
            c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten))); }
          c /= 4.0; c = 1.17 - pow(c, 1.4); return clamp(pow(abs(c), 8.0), 0.0, 1.0); }
        void main(){
          float c = caustic(vW.xz * 1.15 - 250.0, uTime * 0.42);
          vec3 s = vec3(0.86, 0.79, 0.64);
          float grain = fract(sin(dot(floor(vW.xz * 38.0), vec2(12.9898, 78.233))) * 43758.5453);
          s *= 0.95 + 0.05 * grain;
          s *= 0.92 + 0.08 * sin(vW.x * 2.6 + sin(vW.z * 1.4) * 1.6);
          vec3 col = s * (0.6 + 0.95 * c) * vec3(0.78, 0.92, 0.94);
          float d = length(vW.xz - uShadow.xy); col *= 1.0 - 0.42 * exp(-d * d / uShadow.z);
          col = mix(col, vec3(0.24, 0.55, 0.57), smoothstep(6.0, 24.0, length(vW - cameraPosition)));
          gl_FragColor = vec4(col, 1.0); ${OUTPUT} }`
    })
  );
  sand.rotation.x = -Math.PI / 2;
  group.add(sand);

  const hemi = new THREE.HemisphereLight(0xdaf4ee, 0x2a4c54, 1.2);
  const key = new THREE.DirectionalLight(0xfff0d8, 2.0);
  key.position.set(2, 8, 4);
  const rim = new THREE.DirectionalLight(0x8fe0d6, 1.3);
  rim.position.set(-4, 3, -5);
  group.add(hemi, key, rim);

  const rockMats = [
    new THREE.MeshStandardMaterial({ color: 0x5f7f80, roughness: 0.95, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x9a8a72, roughness: 0.95, flatShading: true })
  ] as const;
  const rock = (r: number, x: number, y: number, z: number, m: 0 | 1, seed: number) => {
    const g = new THREE.IcosahedronGeometry(r, 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      v.multiplyScalar(1 + 0.16 * Math.sin(v.x * 3.1 + seed) * Math.sin(v.y * 2.7 + seed * 2) + 0.08 * Math.sin(v.z * 5.3 + seed * 3));
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, rockMats[m]);
    mesh.position.set(x, y, z);
    mesh.scale.y = 0.68;
    mesh.rotation.y = seed;
    group.add(mesh);
  };
  rock(1.2, -2.7, 0.2, -1.8, 0, 1);
  rock(1.5, 2.9, 0.3, -2.6, 0, 2);
  rock(0.62, -3.3, 0.1, 0.9, 1, 3);
  rock(0.45, 2.3, 0.05, 1.5, 1, 4);
  rock(1.0, 0.6, 0.0, -4.2, 0, 5);

  // seagrass: one instanced draw call, swaying in the vertex shader
  const grassGeo = new THREE.PlaneGeometry(0.1, 1.5, 1, 10);
  grassGeo.translate(0, 0.75, 0);
  const grassMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime },
    vertexShader: `uniform float uTime; varying float vH; varying vec3 vW;
      void main(){ vec3 p = position; float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3; float h = uv.y;
        p.x += sin(uTime * 1.25 + ph + h * 2.0) * 0.24 * h * h; p.z += cos(uTime * 0.95 + ph) * 0.09 * h * h;
        vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0); vH = h; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying float vH; varying vec3 vW;
      void main(){ vec3 c = mix(vec3(0.09, 0.28, 0.21), vec3(0.47, 0.72, 0.44), vH);
        c = mix(c, vec3(0.24, 0.55, 0.57), smoothstep(9.0, 26.0, length(vW - cameraPosition)));
        gl_FragColor = vec4(c, 1.0); ${OUTPUT} }`
  });
  const grassN = hiQ ? 90 : 36;
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassN);
  const clusters: [number, number][] = [
    [-2.6, -1.0],
    [2.9, -1.8],
    [-3.6, 1.4],
    [0.6, -3.4],
    [3.3, 0.6],
    [-1.2, -3.0]
  ];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < grassN; i++) {
    const c = clusters[i % clusters.length] ?? [0, 0];
    const a = Math.random() * 6.28;
    const r = Math.random() * 0.9;
    q.setFromEuler(new THREE.Euler(0, Math.random() * 3.14, 0));
    m4.compose(new THREE.Vector3(c[0] + Math.cos(a) * r, 0, c[1] + Math.sin(a) * r), q, new THREE.Vector3(1, 0.6 + Math.random() * 0.8, 1));
    grass.setMatrixAt(i, m4);
  }
  group.add(grass);

  // light shafts (additive, billboarded around the vertical axis)
  const rays: THREE.Mesh[] = [];
  for (let i = 0; i < (hiQ ? 5 : 3); i++) {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime, uSeed: { value: i } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime, uSeed; varying vec2 vUv;
        void main(){ float edge = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
          float a = edge * smoothstep(0.0, 1.0, vUv.y) * (0.6 + 0.4 * sin(uTime * 0.7 + uSeed * 4.0)) * 0.16;
          gl_FragColor = vec4(vec3(1.0, 0.98, 0.9) * a, a); }`
    });
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + Math.random() * 0.8, 14).translate(0, -7, 0), mat);
    ray.position.set(-3 + i * 1.5 + Math.random() * 0.4, 9.5, -1.5 - Math.random() * 2.5);
    ray.rotation.z = 0.2 + Math.random() * 0.12;
    ray.renderOrder = 6;
    group.add(ray);
    rays.push(ray);
  }

  // drifting motes
  const moteN = hiQ ? 160 : 60;
  const mp = new Float32Array(moteN * 3);
  const ms = new Float32Array(moteN);
  for (let i = 0; i < moteN; i++) {
    mp[i * 3] = (Math.random() - 0.5) * 12;
    mp[i * 3 + 1] = Math.random() * 7;
    mp[i * 3 + 2] = -5 + Math.random() * 9;
    ms[i] = Math.random();
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 1));
  const motes = new THREE.Points(
    mg,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute float aSeed; varying float vA;
        void main(){ vec3 p = position; p.y = mod(p.y + uTime * (0.08 + aSeed * 0.12), 7.0) - 0.3; p.x += sin(uTime * 0.5 + aSeed * 20.0) * 0.25;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (1.5 + aSeed * 2.5) * 40.0 / -mv.z; vA = 0.25 + aSeed * 0.35; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; gl_FragColor = vec4(vec3(0.95, 1.0, 0.95), vA * (1.0 - r * 2.0)); }`
    })
  );
  motes.frustumCulled = false;
  group.add(motes);

  // a small school of fish (high quality only)
  const fishMat = new THREE.MeshStandardMaterial({ color: 0xbfd9d4, roughness: 0.35, metalness: 0.35 });
  const fishes: { g: THREE.Group; tail: THREE.Mesh; off: number; y: number; r: number }[] = [];
  if (hiQ) {
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), fishMat);
      b.scale.set(1.6, 0.6, 0.45);
      g.add(b);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 4), fishMat);
      tail.rotation.z = Math.PI / 2;
      tail.position.x = -0.3;
      g.add(tail);
      group.add(g);
      fishes.push({ g, tail, off: i * 0.32 + Math.random() * 0.1, y: 1.9 + Math.random() * 0.6, r: 5.2 + Math.random() * 0.8 });
    }
  }

  return {
    group,
    setShadow(x, z) {
      shadow.value.x = x;
      shadow.value.y = z;
    },
    update(_dt, t, camera) {
      uTime.value = t;
      for (const r of rays) r.rotation.y = Math.atan2(camera.position.x - r.position.x, camera.position.z - r.position.z);
      for (const f of fishes) {
        const a = t * 0.22 + f.off;
        f.g.position.set(Math.cos(a) * f.r, f.y + Math.sin(t + f.off * 3) * 0.15, Math.sin(a) * f.r * 0.45 - 3.2);
        f.g.rotation.y = -a + Math.PI / 2;
        f.tail.rotation.y = Math.sin(t * 12 + f.off * 9) * 0.5;
      }
    },
    dispose() {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((m) => m.dispose());
      });
    }
  };
}
