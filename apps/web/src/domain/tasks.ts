import tasksData from '../../../../content/field-tasks.json';
import type { DayKey } from './dates';

export type TaskType = 'cue' | 'choice' | 'check' | 'scale' | 'time' | 'note';
export type StickerId =
  | 'leaf' | 'shell' | 'moon' | 'tumbler' | 'feather' | 'compass' | 'lantern'
  | 'starfish' | 'bell' | 'mint' | 'sun' | 'pebble' | 'owl' | 'bottle'; // prettier-ignore

export interface FieldTask {
  id: string;
  day: number;
  kind: string;
  type: TaskType;
  title: string;
  body: string;
  sticker: StickerId;
  sentence?: string;
  options?: string[];
  allowOwn?: boolean;
  confirm?: string;
  low?: string;
  high?: string;
  default?: string;
  placeholder?: string;
}

type Raw = (typeof tasksData.tasks)[number] & {
  sentence?: string;
  options?: string[];
  allow_own?: boolean;
  confirm?: string;
  low?: string;
  high?: string;
  default?: string;
  placeholder?: string;
};

export const FIELD_TASKS: FieldTask[] = (tasksData.tasks as Raw[])
  .map((t) => ({
    id: t.id,
    day: t.day,
    kind: t.kind,
    type: t.type as TaskType,
    title: t.title,
    body: t.body,
    sticker: t.sticker as StickerId,
    sentence: t.sentence,
    options: t.options,
    allowOwn: t.allow_own,
    confirm: t.confirm,
    low: t.low,
    high: t.high,
    default: t.default,
    placeholder: t.placeholder
  }))
  .sort((a, b) => a.day - b.day);

export type TaskAnswer =
  | { kind: 'text'; value: string }
  | { kind: 'check' }
  | { kind: 'scale'; value: number }
  | { kind: 'time'; value: string };

export interface TaskRecordLike {
  id: string;
  status: 'done' | 'skipped';
  day: DayKey;
  answer?: TaskAnswer;
}

export type TaskState =
  | { state: 'available'; task: FieldTask; number: number }
  | { state: 'skipped-today'; task: FieldTask; number: number }
  | { state: 'done-today'; next: FieldTask | null }
  | { state: 'complete' };

/**
 * One task a day, in order. Skipping costs nothing: the same task comes back tomorrow.
 * Finishing one closes the day; the next task opens tomorrow.
 */
export function taskState(records: TaskRecordLike[], today: DayKey): TaskState {
  const done = new Set(records.filter((r) => r.status === 'done').map((r) => r.id));
  const doneToday = records.some((r) => r.status === 'done' && r.day === today);
  const nextIndex = FIELD_TASKS.findIndex((t) => !done.has(t.id));
  const next = nextIndex >= 0 ? (FIELD_TASKS[nextIndex] ?? null) : null;
  if (doneToday) return { state: 'done-today', next };
  if (!next) return { state: 'complete' };
  const skippedToday = records.some((r) => r.id === next.id && r.status === 'skipped' && r.day === today);
  return { state: skippedToday ? 'skipped-today' : 'available', task: next, number: nextIndex + 1 };
}

/** Fill a cue sentence: "When I have my morning chai, I'll fill my glass too." */
export function cueSentence(task: FieldTask, answer: string): string {
  return (task.sentence ?? '{answer}').replace('{answer}', answer.trim());
}

/** The person's most recent first-glass cue, for the Today chip and (Phase 6) reminders. */
export function firstGlassCue(records: TaskRecordLike[]): string | null {
  const r = records.find((x) => x.id === 'first-cue' && x.status === 'done');
  return r?.answer?.kind === 'text' ? r.answer.value : null;
}

export function answerSummary(task: FieldTask, answer: TaskAnswer | undefined): string | null {
  if (!answer) return null;
  if (answer.kind === 'text') return task.type === 'cue' ? cueSentence(task, answer.value) : answer.value;
  if (answer.kind === 'scale') return `${answer.value} of 5`;
  if (answer.kind === 'time') return `Usually asleep by ${answer.value}`;
  return task.confirm ?? 'Done';
}
