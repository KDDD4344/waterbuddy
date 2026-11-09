import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TidepoolController } from './controller';

const camera = new THREE.PerspectiveCamera(36, 0.75, 0.1, 100);
camera.position.set(0, 2.5, 11);

function run(c: TidepoolController, seconds: number, step = 1 / 60) {
  for (let t = 0; t < seconds; t += step) c.update(step, t, camera);
}

describe('TidepoolController', () => {
  it('pours: Pip hides, the stream falls, the bottle fills, Pip comes back', () => {
    const c = new TidepoolController({ fill: 0.5 });
    run(c, 0.5);
    c.pour({ ml: 250, fromFill: 0.5, toFill: 0.625, milestone: null, overGoal: false });
    expect(c.pouring).toBe(true);
    run(c, 0.45);
    expect(c.streamVisible).toBe(true);
    run(c, 1.2);
    expect(c.pip.fill).toBeGreaterThan(0.6);
    run(c, 3);
    expect(c.pouring).toBe(false);
    expect(c.streamVisible).toBe(false);
    expect(c.pip.fill).toBeCloseTo(0.625, 2);
  });

  it('never celebrates past the goal (safety rule 1)', () => {
    const c = new TidepoolController({ fill: 1 });
    c.pour({ ml: 250, fromFill: 1, toFill: 1, milestone: null, overGoal: true });
    expect(c.pouring).toBe(false);
    run(c, 0.5);
    expect(c.streamVisible).toBe(false);
  });

  it('with reduced motion, fills without a stream', () => {
    const c = new TidepoolController({ fill: 0.2, reducedMotion: true });
    c.pour({ ml: 500, fromFill: 0.2, toFill: 0.45, milestone: 25, overGoal: false });
    expect(c.pouring).toBe(false);
    run(c, 0.5);
    expect(c.streamVisible).toBe(false);
    run(c, 2);
    expect(c.pip.fill).toBeCloseTo(0.45, 2);
  });

  it('holds stored-total changes until the pour lands, then catches up', () => {
    const c = new TidepoolController({ fill: 0.3 });
    c.pour({ ml: 250, fromFill: 0.3, toFill: 0.425, milestone: null, overGoal: false });
    c.syncFill(0.425);
    run(c, 0.3);
    expect(c.pip.fill).toBeCloseTo(0.3, 2);
    c.syncFill(0.3); // undo during the pour
    run(c, 5);
    expect(c.pip.fill).toBeCloseTo(0.3, 2);
  });

  it('undo lowers the water', () => {
    const c = new TidepoolController({ fill: 0.6 });
    c.undo(0.475);
    run(c, 2);
    expect(c.pip.fill).toBeCloseTo(0.475, 2);
  });

  it('cleans up GPU resources', () => {
    const c = new TidepoolController();
    expect(() => c.dispose()).not.toThrow();
  });

  it('celebrates a finished field task: Pip dances and a chord plays', () => {
    const chord = vi.fn();
    const c = new TidepoolController({ fill: 0.4, sound: { enabled: true, pour() {}, tone() {}, chord } });
    const trigger = vi.spyOn(c.pip, 'trigger');
    c.celebrate();
    expect(trigger).toHaveBeenCalledWith('dance');
    expect(chord).toHaveBeenCalledTimes(1);
    run(c, 3);
    expect(c.pip.fill).toBeCloseTo(0.4, 2); // a task never changes the water
  });

  it('a celebration waits its turn: never interrupts a pour', () => {
    const c = new TidepoolController({ fill: 0.4 });
    c.pour({ ml: 250, fromFill: 0.4, toFill: 0.525, milestone: null, overGoal: false });
    const trigger = vi.spyOn(c.pip, 'trigger');
    c.celebrate();
    expect(trigger).not.toHaveBeenCalled();
  });

  it('with reduced motion, a celebration is a nod', () => {
    const c = new TidepoolController({ fill: 0.4, reducedMotion: true });
    const trigger = vi.spyOn(c.pip, 'trigger');
    c.celebrate();
    expect(trigger).toHaveBeenCalledWith('nod');
  });

  it('corks the bottle once a goal-reaching pour has finished, not during it', () => {
    const c = new TidepoolController({ fill: 0.9 });
    c.pour({ ml: 250, fromFill: 0.9, toFill: 1, milestone: 100, overGoal: false });
    c.syncCorked(true);
    expect(c.pip.corked).toBe(false);
    run(c, 5);
    expect(c.pouring).toBe(false);
    expect(c.pip.corked).toBe(true);
    c.syncCorked(false); // an undo below the goal pulls the cork straight away
    expect(c.pip.corked).toBe(false);
  });
});
