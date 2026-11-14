import type * as THREE from 'three';
import type { Pose, Temperament } from '../animator';

export type BuddyId = 'sprite' | 'bloop' | 'cobble' | 'nimbus';

export interface BuddyContext {
  t: number;
  dt: number;
  /** Today's progress toward the goal, 0..1. */
  progress: number;
  /** Where Buddy is looking, in world space. */
  look: THREE.Vector3;
  camera: THREE.Camera;
  /** Refraction texture of the scene behind (Bloop's jelly samples it). */
  refraction: THREE.Texture | null;
  resolution: THREE.Vector2;
  /** How hard water is pouring right now, 0..1 (Buddy gets excited). */
  flow?: number;
  reduced?: boolean;
}

export interface Buddy {
  id: BuddyId;
  /** Origin is the centre of the contact patch on the ground. */
  root: THREE.Group;
  /** Meshes that count as "touching Buddy". */
  hit: THREE.Object3D[];
  /** Hidden while the refraction texture is drawn, so Bloop doesn't refract itself. */
  refractionHidden: THREE.Object3D[];
  temperament: Temperament;
  /** Top of the head above the origin, for framing and sparkles. */
  height: number;
  apply(pose: Pose, ctx: BuddyContext): void;
  dispose(): void;
}

export interface BuddyInfo {
  id: BuddyId;
  name: string;
  kind: string;
  line: string;
}

export const BUDDIES: BuddyInfo[] = [
  {
    id: 'sprite',
    name: 'Ripple',
    kind: 'Water sprite',
    line: 'Your approved Buddy, rebuilt and rigged from the Tripo turnaround: it blinks, smiles and curls its tail.'
  },
  {
    id: 'cobble',
    name: 'Cobble',
    kind: 'River stone',
    line: 'A thousand years smoothed by water. Its sprout grows as you drink.'
  },
  {
    id: 'bloop',
    name: 'Bloop',
    kind: 'Living jelly',
    line: 'A wobbly drop of the spring itself, with a glowing heart.'
  },
  {
    id: 'nimbus',
    name: 'Nimbus',
    kind: 'Little cloud',
    line: 'A daydreaming cloud that drizzles when happy and makes rainbows.'
  }
];

/** The team's approved design (rebuilt from the Tripo reference). */
export const RECOMMENDED: BuddyId = 'sprite';
