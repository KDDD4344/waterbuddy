// On-device storage (IndexedDB via Dexie). Decision D-001: drink logs never leave the
// phone unless the person opts in to sync in a later phase.
import Dexie, { type Table } from 'dexie';
import type { AgeBandId } from '../domain/goals';
import type { DayKey } from '../domain/dates';
import type { Units } from '../domain/units';
import type { TaskAnswer } from '../domain/tasks';

export interface Profile {
  id: 'me';
  ageBand: AgeBandId;
  goalMl: number;
  goalSource: 'suggested' | 'custom';
  units: Units;
  cupMl: number;
  parentConfirmed: boolean;
  createdAt: string;
  /** Animated 3D tidepool on Today. Default on where the device supports it. */
  scene3d?: boolean;
  /** Pour and reaction sounds. Default off. */
  sound?: boolean;
  /** Overrides the system reduce-motion setting when set. */
  reduceMotion?: boolean;
  /** Usual sleep time "HH:MM", from the last-call field task. Reminders stop 2 hours before (Phase 6). */
  bedtime?: string;
  /** Preferred reminder window from field task 9, or "none". */
  reminderPref?: string;
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

/** A field task outcome. "skipped" costs nothing; the task returns the next day. */
export interface TaskRecord {
  /** The task's id from content/field-tasks.json. */
  id: string;
  status: 'done' | 'skipped';
  day: DayKey;
  at: string;
  answer?: TaskAnswer;
}

/** One journal note per day. */
export interface Note {
  day: DayKey;
  text: string;
  at: string;
}

export class WaterBuddyDB extends Dexie {
  profile!: Table<Profile, 'me'>;
  vessels!: Table<Vessel, string>;
  logs!: Table<DrinkLog, string>;
  goals!: Table<GoalChange, string>;
  tasks!: Table<TaskRecord, string>;
  notes!: Table<Note, string>;

  constructor(name = 'waterbuddy') {
    super(name);
    this.version(1).stores({
      profile: 'id',
      vessels: 'id, order',
      logs: 'id, day, at',
      goals: 'id, day, at'
    });
    // Phase 3: field tasks and journal notes. Additive, so existing data is untouched.
    this.version(2).stores({
      tasks: 'id, day',
      notes: 'day'
    });
  }
}

export const db = new WaterBuddyDB();

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
