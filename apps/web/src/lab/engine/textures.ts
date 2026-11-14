/**
 * Original foliage textures, painted at load time on canvases (no image downloads, no
 * licensing questions): fern fronds, leaf clusters, distant tree lines and lily pads.
 */
import * as THREE from 'three';
import { mulberry32 } from './noise';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  return [c, g];
}

function tex(c: HTMLCanvasElement, renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  t.needsUpdate = true;
  return t;
}

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

function leaf(
  g: CanvasRenderingContext2D,
  len: number,
  wid: number,
  fill: string | CanvasGradient,
  rib: string | null
) {
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(wid, len * 0.45, 0, len);
  g.quadraticCurveTo(-wid, len * 0.45, 0, 0);
  g.fillStyle = fill;
  g.fill();
  if (rib) {
    g.beginPath();
    g.moveTo(0, len * 0.05);
    g.lineTo(0, len * 0.9);
    g.strokeStyle = rib;
    g.lineWidth = Math.max(1, wid * 0.08);
    g.stroke();
  }
}

/** A fern frond, base at the bottom centre, tip at the top. */
export function fernTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const W = 256;
  const Hh = 512;
  const [c, g] = canvas(W, Hh);
  const r = mulberry32(11);
  const n = 26;
  const stem = (t: number) => ({ x: W / 2 + Math.sin(t * 2.2) * 10 * t, y: Hh * (1 - t * 0.97) });
  for (let i = 0; i < n; i++) {
    const t = 0.04 + (i / n) * 0.92;
    const p = stem(t);
    const L = 112 * Math.sin(Math.PI * (0.12 + 0.88 * t)) ** 0.7 * (1 - t * 0.55);
    for (const side of [-1, 1]) {
      g.save();
      g.translate(p.x, p.y);
      g.rotate(side * (Math.PI / 2 - 0.55 + t * 0.35) + Math.PI);
      const light = 30 + t * 12 + r() * 6;
      const grad = g.createLinearGradient(0, 0, 0, L);
      grad.addColorStop(0, hsl(98, 48, light - 8));
      grad.addColorStop(1, hsl(86, 55, light + 10));
      // Each pinna is a row of small lobes.
      const lobes = Math.max(3, Math.round(L / 9));
      for (let k = 0; k < lobes; k++) {
        const u = k / lobes;
        g.save();
        g.translate(0, u * L);
        g.rotate(side * 0.0);
        leaf(g, L / lobes + 7, 7 * (1 - u * 0.6), grad, null);
        g.restore();
      }
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, L * 0.95);
      g.strokeStyle = hsl(90, 40, 26);
      g.lineWidth = 1.5;
      g.stroke();
      g.restore();
    }
  }
  g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const p = stem(i / 40);
    if (i === 0) g.moveTo(p.x, p.y);
    else g.lineTo(p.x, p.y);
  }
  g.strokeStyle = hsl(80, 40, 24);
  g.lineWidth = 4;
  g.stroke();
  return tex(c, renderer);
}

/** A loose cluster of broad leaves, for canopy and hanging foliage. */
export function leafClusterTexture(renderer?: THREE.WebGLRenderer, seed = 3): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas(S, S);
  const r = mulberry32(seed);
  for (let i = 0; i < 95; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * S * 0.36;
    const x = S / 2 + Math.cos(a) * d;
    const y = S / 2 + Math.sin(a) * d * 0.85;
    const len = 60 + r() * 70;
    g.save();
    g.translate(x, y);
    g.rotate(a + Math.PI / 2 + (r() - 0.5) * 1.2);
    const l = 18 + r() * 22 + (y < S / 2 ? 8 : 0);
    const grad = g.createLinearGradient(-20, 0, 20, len);
    grad.addColorStop(0, hsl(105 + r() * 25, 45 + r() * 15, l));
    grad.addColorStop(1, hsl(90 + r() * 20, 50, l + 14));
    leaf(g, len, len * 0.32, grad, hsl(80, 35, l + 22, 0.6));
    g.restore();
  }
  return tex(c, renderer);
}

/** A soft, painterly band of distant trees: bumpy crowns, sunlit tops, a little haze. */
export function treelineTexture(top: string, bottom: string, seed = 5): THREE.CanvasTexture {
  const W = 1024;
  const Hh = 256;
  const [c, g] = canvas(W, Hh);
  const r = mulberry32(seed);
  const grad = g.createLinearGradient(0, 0, 0, Hh);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  const crowns: [number, number, number][] = [];
  let x = -20;
  while (x < W + 40) {
    const h = Hh * (0.3 + r() * 0.5);
    const w = 26 + r() * 50;
    crowns.push([x, Hh - h, w]);
    x += w * (0.55 + r() * 0.3);
  }
  g.fillStyle = grad;
  for (const [cx, cy, w] of crowns) {
    // A crown is a cluster of small lobes, not one circle.
    for (let k = 0; k < 16; k++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * w * 0.55;
      g.beginPath();
      g.arc(cx + Math.cos(a) * d, cy + w * 0.3 + Math.sin(a) * d * 0.8, w * (0.16 + r() * 0.16), 0, Math.PI * 2);
      g.fill();
    }
    g.fillRect(cx - w * 0.45, cy + w * 0.35, w * 0.9, Hh);
  }
  // Sunlight catching the upper-left of each crown.
  g.globalCompositeOperation = 'source-atop';
  for (const [cx, cy, w] of crowns) {
    for (let k = 0; k < 6; k++) {
      g.fillStyle = `rgba(255, 246, 214, ${0.08 + r() * 0.1})`;
      g.beginPath();
      g.arc(
        cx - w * 0.2 + (r() - 0.5) * w * 0.5,
        cy + w * 0.15 + (r() - 0.5) * w * 0.3,
        w * (0.12 + r() * 0.12),
        0,
        Math.PI * 2
      );
      g.fill();
    }
  }
  g.globalCompositeOperation = 'source-over';
  // Soften: atmospheric perspective blurs far edges.
  const [c2, g2] = canvas(W, Hh);
  g2.filter = 'blur(1.6px)';
  g2.drawImage(c, 0, 0);
  const t = new THREE.CanvasTexture(c2);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function lilyTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  const r = mulberry32(21);
  const grad = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  grad.addColorStop(0, hsl(95, 42, 40));
  grad.addColorStop(0.8, hsl(105, 48, 30));
  grad.addColorStop(1, hsl(60, 35, 30));
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = hsl(85, 40, 50, 0.45);
  g.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + r() * 0.05;
    g.beginPath();
    g.moveTo(S / 2, S / 2);
    const mx = S / 2 + Math.cos(a + 0.08) * S * 0.25;
    const my = S / 2 + Math.sin(a + 0.08) * S * 0.25;
    g.quadraticCurveTo(mx, my, S / 2 + Math.cos(a) * S * 0.5, S / 2 + Math.sin(a) * S * 0.5);
    g.stroke();
  }
  for (let i = 0; i < 10; i++) {
    g.fillStyle = hsl(55, 45, 45, 0.25);
    g.beginPath();
    g.arc(r() * S, r() * S, 3 + r() * 10, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c, renderer);
}
