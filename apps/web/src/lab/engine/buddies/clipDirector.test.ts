import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ClipDirector } from './clipDirector';

// A stand-in for the GLB: one node, and four clips that each move it to a different x.
function rig() {
  const root = new THREE.Group();
  const node = new THREE.Object3D();
  node.name = 'n';
  root.add(node);
  const clip = (name: string, seconds: number, x: number) =>
    new THREE.AnimationClip(name, seconds, [
      new THREE.VectorKeyframeTrack('n.position', [0, seconds], [x, 0, 0, x, 0, 0])
    ]);
  const clips = [clip('idle', 4, 0), clip('happy', 1.8, 1), clip('curious', 2.6, 2), clip('celebrate', 3.4, 3)];
  return { root, node, director: new ClipDirector(root, clips) };
}

const run = (d: ClipDirector, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) d.update(1 / 60);
};

describe('ClipDirector (plays the GLB clips)', () => {
  it('loops idle by default', () => {
    const { node, director } = rig();
    run(director, 9);
    expect(director.playing).toBeNull();
    expect(node.position.x).toBeCloseTo(0);
  });

  it('cross-fades into a reaction, then back to idle on its own', () => {
    const { node, director } = rig();
    run(director, 0.5);
    expect(director.request('happy')).toBe(true);
    run(director, 0.1);
    // Mid cross-fade: between idle (0) and happy (1), not a jump.
    expect(node.position.x).toBeGreaterThan(0.05);
    expect(node.position.x).toBeLessThan(0.95);
    run(director, 0.6);
    expect(node.position.x).toBeCloseTo(1, 1);
    run(director, 2.5);
    expect(director.playing).toBeNull();
    expect(node.position.x).toBeCloseTo(0, 2);
  });

  it("doesn't restart a reaction that's already playing", () => {
    const { director } = rig();
    director.request('curious');
    run(director, 1);
    expect(director.request('curious')).toBe(false);
    expect(director.playing).toBe('curious');
  });

  it('never lets a smaller reaction interrupt a bigger one', () => {
    const { node, director } = rig();
    director.request('celebrate');
    run(director, 1);
    expect(director.request('curious')).toBe(false);
    expect(director.request('happy')).toBe(false);
    run(director, 0.5);
    expect(node.position.x).toBeCloseTo(3, 1);
  });

  it('lets a bigger reaction take over smoothly', () => {
    const { node, director } = rig();
    director.request('curious');
    run(director, 1);
    expect(director.request('celebrate')).toBe(true);
    run(director, 0.1);
    expect(node.position.x).toBeGreaterThan(2.05);
    expect(node.position.x).toBeLessThan(2.95);
    run(director, 1);
    expect(director.playing).toBe('celebrate');
    expect(node.position.x).toBeCloseTo(3, 1);
  });

  it('reports missing clips instead of failing', () => {
    const root = new THREE.Group();
    const d = new ClipDirector(root, [new THREE.AnimationClip('idle', 1, [])]);
    expect(d.missing).toEqual(['happy', 'curious', 'celebrate']);
    expect(d.request('happy')).toBe(false);
  });
});
