import { useId, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { completeTask, NOTE_MAX, skipTask } from '../data/repo';
import { answerSummary, cueSentence, FIELD_TASKS, firstGlassCue, taskState, type FieldTask as Task, type TaskAnswer } from '../domain/tasks';
import { useToday } from '../hooks/useToday';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/toast';
import { Sticker, stickerName } from '../components/Sticker';
import { tidepoolBus } from '../three/bus';

const OWN = '__own__';

/** Today's field task as a chip (Today) or a card (Journal). Both open the same sheet. */
export function FieldTaskEntry({ variant }: { variant: 'chip' | 'card' }) {
  const today = useToday();
  const records = useLiveQuery(() => db.tasks.toArray(), []);
  // Held separately so the sheet stays open for the sticker moment after the task is stored.
  const [active, setActive] = useState<{ task: Task; number: number } | null>(null);
  if (!records) return null;
  const s = taskState(records, today);
  const cue = firstGlassCue(records);
  const cueTask = FIELD_TASKS[0];
  const cueLine = cue && cueTask ? cueSentence(cueTask, cue) : null;

  let body: React.ReactNode;
  if (s.state === 'available') {
    const { task, number } = s;
    body = (
      <button type="button" className={variant === 'chip' ? 'task-chip' : 'task-card'} onClick={() => setActive({ task, number })}>
        <Sticker id={task.sticker} size={variant === 'chip' ? 34 : 48} title="" className="task-sticker" />
        <span className="task-text">
          <span className="task-kicker">
            Field task {number} of {FIELD_TASKS.length} · {task.kind}
          </span>
          <span className="task-title">{task.title}</span>
          {variant === 'card' && <span className="small muted">Under 30 seconds. Earns a sticker.</span>}
        </span>
      </button>
    );
  } else if (s.state === 'skipped-today') {
    body = <p className="task-note">Field task saved for tomorrow. Nothing lost.</p>;
  } else if (s.state === 'done-today') {
    body = <p className="task-note">{cueLine ? `Field task done. Your cue: ${cueLine}` : 'Field task done. The next one opens tomorrow.'}</p>;
  } else {
    body = <p className="task-note">All {FIELD_TASKS.length} field tasks done.{cueLine ? ` Your cue: ${cueLine}` : ''}</p>;
  }

  return (
    <>
      {body}
      {active && <FieldTaskSheet key={active.task.id} task={active.task} number={active.number} onClose={() => setActive(null)} />}
    </>
  );
}

function FieldTaskSheet({ task, number, onClose }: { task: Task; number: number; onClose: () => void }) {
  const toast = useToast();
  const [choice, setChoice] = useState<string | null>(null);
  const [own, setOwn] = useState('');
  const [scale, setScale] = useState<number | null>(null);
  const [time, setTime] = useState(task.default ?? '22:30');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<TaskAnswer | null>(null);
  const ownId = useId();
  const timeId = useId();
  const noteId = useId();

  const text = choice === OWN ? own.trim() : (choice ?? '');
  let answer: TaskAnswer | null = null;
  if (task.type === 'cue' || task.type === 'choice') answer = text ? { kind: 'text', value: text } : null;
  if (task.type === 'check') answer = { kind: 'check' };
  if (task.type === 'scale') answer = scale ? { kind: 'scale', value: scale } : null;
  if (task.type === 'time') answer = /^\d{2}:\d{2}$/.test(time) ? { kind: 'time', value: time } : null;
  if (task.type === 'note') answer = note.trim() ? { kind: 'text', value: note.trim().slice(0, NOTE_MAX) } : null;

  const primary =
    task.type === 'cue'
      ? 'Set this cue'
      : task.type === 'check'
        ? (task.confirm ?? 'Done')
        : task.type === 'time'
          ? 'Save my last call'
          : task.type === 'note'
            ? 'Save to my journal'
            : 'Save';

  const finish = async () => {
    if (!answer) return;
    await completeTask(task.id, answer);
    setDone(answer);
    tidepoolBus.emit({ type: 'celebrate' });
  };

  return (
    <Sheet open onClose={onClose} title={done ? 'Pressed into your journal' : task.title} className="fold">
      {done ? (
        <div className="sheet-form task-done">
          <Sticker id={task.sticker} size={132} className="slap" />
          <p className="lead center" role="status">
            {stickerName(task.sticker)} sticker added. {answerSummary(task, done)}
          </p>
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form
          className="sheet-form"
          onSubmit={(e) => {
            e.preventDefault();
            void finish();
          }}
        >
          <p className="task-kicker">
            Field task {number} of {FIELD_TASKS.length} · {task.kind}
          </p>
          <p>{task.body}</p>

          {task.type === 'cue' && (
            <p className="plan" aria-live="polite">
              {text ? cueSentence(task, text) : cueSentence(task, '…')}
            </p>
          )}

          {(task.type === 'cue' || task.type === 'choice') && (
            <fieldset className="options">
              <legend className="sr-only">{task.title}</legend>
              {(task.options ?? []).map((o) => (
                <label key={o} className="option">
                  <input type="radio" name={`task-${task.id}`} value={o} checked={choice === o} onChange={() => setChoice(o)} />
                  <span className="option-title">{task.type === 'cue' ? capitalise(o) : o}</span>
                </label>
              ))}
              {task.allowOwn && (
                <>
                  <label className="option">
                    <input type="radio" name={`task-${task.id}`} value={OWN} checked={choice === OWN} onChange={() => setChoice(OWN)} />
                    <span className="option-title">Something else</span>
                  </label>
                  {choice === OWN && (
                    <div className="field">
                      <label htmlFor={ownId} className="label">
                        In your own words
                      </label>
                      <input id={ownId} type="text" maxLength={60} value={own} onChange={(e) => setOwn(e.target.value)} autoFocus />
                    </div>
                  )}
                </>
              )}
            </fieldset>
          )}

          {task.type === 'scale' && (
            <fieldset className="options">
              <legend className="sr-only">{task.title}</legend>
              <div className="scale">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="scale-point">
                    <input type="radio" name={`task-${task.id}`} value={n} checked={scale === n} onChange={() => setScale(n)} />
                    <span>{n}</span>
                  </label>
                ))}
              </div>
              <div className="scale-ends small muted">
                <span>1 · {task.low}</span>
                <span>5 · {task.high}</span>
              </div>
            </fieldset>
          )}

          {task.type === 'time' && (
            <div className="field">
              <label htmlFor={timeId} className="label">
                I usually go to sleep at
              </label>
              <input id={timeId} className="big-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              <p className="small muted">Last call will be two hours before.</p>
            </div>
          )}

          {task.type === 'note' && (
            <div className="field">
              <label htmlFor={noteId} className="label">
                A line for future you
              </label>
              <textarea id={noteId} className="note-input" maxLength={NOTE_MAX} rows={3} placeholder={task.placeholder} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}

          <div className="row">
            <button
              type="button"
              className="btn ghost"
              onClick={async () => {
                await skipTask(task.id);
                onClose();
                toast({ text: 'Saved for tomorrow. Nothing lost.' });
              }}
            >
              Not today
            </button>
            <button type="submit" className="btn primary grow" disabled={!answer}>
              {primary}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
