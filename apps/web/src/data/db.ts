// On-device storage (IndexedDB via Dexie). Decision D-001: drink logs never leave the
// phone unless the person opts in to sync in a later phase.
import Dexie, { type Table } from 'dexie';
import type { AgeBandId } from '../domain/goals';
import type { DayKey } from '../domain/dates';
import type { Units } from '../domain/units';

export interface Profile {
  id: 'me';
  ageBand: AgeBandId;
  goalMl: number;
  goalSource: 'suggested' | 'custom';
  units: Units;
  cupMl: number;
  parentConfirmed: boolean;
  createdAt: string;
}

export interface Vessel {
  id: string;
  name: string;
  ml: number;
  order: number;
}

export interface DrinkLog {
  id: string;
  ml: number;
  /** When the drink was logged, ISO UTC. */
  at: string;
  /** Local calendar day at the moment of logging. */
  day: DayKey;
  /** Device time zone when logged, so day boundaries can be explained. */
  tz: string;
  vesselId: string | null;
  /** Soft delete so Undo can restore. */
  deletedAt: string | null;
}

/** Every goal change is kept, so history shows each day against the goal of that day. */
export interface GoalChange {
  id: string;
  ml: number;
  /** The goal applies from this local day onward. */
  day: DayKey;
  source: 'suggested' | 'custom';
  at: string;
}

export class WaterBuddyDB extends Dexie {
  profile!: Table<Profile, 'me'>;
  vessels!: Table<Vessel, string>;
  logs!: Table<DrinkLog, string>;
  goals!: Table<GoalChange, string>;

  constructor(name = 'waterbuddy') {
    super(name);
    this.version(1).stores({
      profile: 'id',
      vessels: 'id, order',
      logs: 'id, day, at',
      goals: 'id, day, at'
    });
  }
}

export const db = new WaterBuddyDB();

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
