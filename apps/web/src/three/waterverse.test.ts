import { describe, expect, it } from 'vitest';
import { Waterverse } from './waterverse';
import { atlasState, ISLANDS } from '../domain/atlas';

function run(w: Waterverse, seconds: number, step = 1 / 30) {
  for (let t = 0; t < seconds; t += step) w.update(step, t);
}

describe('atlas state', () => {
  it('starts with everything in fog except the next island', () => {
    const s = atlasState(new Set(), 0);
    expect(s.status).toEqual(['next', 'fog', 'fog', 'fog', 'fog', 'fog']);
    expect(s.from).toBe(-1);
    expect(s.arrivals).toEqual([]);
  });

  it('new postcards become arrivals to sail to, in order', () => {
    const s = atlasState(new Set(['loktak', 'umngot']), 0);
    expect(s.status).toEqual(['arriving', 'arriving', 'next', 'fog', 'fog', 'fog']);
    expect(s.arrivals).toEqual([0, 1]);
    expect(s.from).toBe(-1);
  });

  it('islands already watched stay clear and are not sailed to again', () => {
    const s = atlasState(new Set(['loktak', 'umngot']), 2);
    expect(s.status.slice(0, 3)).toEqual(['clear', 'clear', 'next']);
    expect(s.arrivals).toEqual([]);
    expect(s.from).toBe(1);
  });

  it('the fog never comes back: the seen count can only lift fog, not add it', () => {
    const s = atlasState(new Set(['loktak']), 5);
    expect(s.status[0]).toBe('clear');
    expect(s.clearCount).toBe(1);
  });

  it('lays out six islands that do not overlap', () => {
    expect(ISLANDS).toHaveLength(6);
    for (const a of ISLANDS)
      for (const b of ISLANDS) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.radius + b.radius + 1);
  });
});

describe('Waterverse voyage', () => {
  it('sails from the harbour to a new island, then lifts its fog', () => {
    const w = new Waterverse();
    const s = atlasState(new Set(['loktak']), 0);
    w.setStatus(s.status, true);
    const arrived: number[] = [];
    w.voyage(s.from, s.arrivals, (i) => arrived.push(i));
    expect(w.busy).toBe(true);
    expect(w.islands[0]!.reveal).toBe(0);
    run(w, 1);
    expect(w.bottlePosition.distanceTo(w.focus)).toBeLessThan(0.01); // camera follows the bottle
    run(w, 12);
    expect(w.busy).toBe(false);
    expect(arrived).toEqual([0]);
    expect(w.islands[0]!.reveal).toBeGreaterThan(0.95);
    const isl = ISLANDS[0]!;
    expect(Math.hypot(w.bottlePosition.x - isl.x, w.bottlePosition.z - isl.z)).toBeLessThan(isl.radius + 1.5);
    w.dispose();
  });

  it('with reduced motion, new islands clear at once with no sailing', () => {
    const w = new Waterverse({ reducedMotion: true });
    const s = atlasState(new Set(['loktak', 'umngot']), 0);
    w.setStatus(s.status, true);
    const arrived: number[] = [];
    w.voyage(s.from, s.arrivals, (i) => arrived.push(i));
    expect(w.busy).toBe(false);
    expect(arrived).toEqual([0, 1]);
    run(w, 0.1);
    expect(w.islands[1]!.reveal).toBe(1);
    w.dispose();
  });

  it('finds which island a tapped object belongs to', () => {
    const w = new Waterverse();
    expect(w.islandOf(w.islands[3]!.hit)).toBe(3);
    expect(w.islandOf(w.group)).toBe(-1);
    w.dispose();
  });

  it('Moss lives at Loktak and appears once its fog lifts', () => {
    const w = new Waterverse({ reducedMotion: true });
    const moss = w.islands[0]!.group.getObjectByName('Moss')!;
    expect(moss).toBeTruthy();
    w.setStatus(atlasState(new Set(), 0).status, true);
    w.update(0.1, 0.1);
    expect(moss.visible).toBe(false);
    w.setStatus(atlasState(new Set(['loktak']), 1).status, true);
    w.update(0.1, 0.2);
    expect(moss.visible).toBe(true);
    w.dispose();
  });
});
