// On-device storage (IndexedDB via Dexie). Decision D-001: drink logs never leave the
// phone unless the person opts in to sync in a later phase.
import Dexie, { type Table } from 'dexie';
import type { AgeBandId } from '../domain/goals';
import type { DayKey } from '../domain/dates';
import type { Units } from '../domain/units';
import type { TaskAnswer } from '../domain/tasks';
import type { Contrast, TextSize } from '../domain/modes';

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
  /** Usual wake-up time "HH:MM" (V1). No reminders before it. */
  wake?: string;
  /** Preferred reminder window from field task 9, or "none". */
  reminderPref?: string;
  /** How many Waterverse islands the person has watched clear (Phase 5). */
  atlasSeen?: number;
  /** Daily reminder (Phase 6). `id` is this device's random key on the server. */
  reminders?: { on: boolean; time: string; id: string };
  /** Text size (Phase 8). Unset means the age mode's default. */
  textSize?: TextSize;
  /** Stronger colours for low vision or bright sun (Phase 8). */
  contrast?: Contrast;
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

/** A postcard that washed up after a night voyage. Never taken back. */
export interface PostcardRecord {
  /** The card's id from content/postcards. */
  id: string;
  /** The goal day whose voyage brought it. */
  day: DayKey;
  deliveredAt: string;
  /** Null until the message in the bottle is opened. */
  readAt: string | null;
}

/** What someone found in Ripple's spring on a day (the daily quest is to find all four). */
export interface Discovery {
  day: DayKey;
  /** Kinds found: 'ripple', 'water', 'pad', 'spout'. */
  found: string[];
  /** When all four were found, if they were. */
  completedAt: string | null;
}

export class WaterBuddyDB extends Dexie {
  profile!: Table<Profile, 'me'>;
  vessels!: Table<Vessel, string>;
  logs!: Table<DrinkLog, string>;
  goals!: Table<GoalChange, string>;
  tasks!: Table<TaskRecord, string>;
  notes!: Table<Note, string>;
  postcards!: Table<PostcardRecord, string>;
  discoveries!: Table<Discovery, DayKey>;

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
    // Phase 4: postcards from the night voyage.
    this.version(3).stores({
      postcards: 'id, day'
    });
    // V1: Ripple's spring (Atlas) remembers what was found each day.
    this.version(4).stores({
      discoveries: 'day'
    });
  }
}

export const db = new WaterBuddyDB();

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
