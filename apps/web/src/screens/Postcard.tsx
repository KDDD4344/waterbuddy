import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PostcardRecord } from '../data/db';
import { markPostcardRead } from '../data/repo';
import { dayLabel } from '../domain/dates';
import { postcardById, ROUTE_1, type Postcard as Card } from '../domain/voyage';
import { useToday } from '../hooks/useToday';
import { PostcardPicture } from '../components/PostcardArt';
import { Sheet } from '../ui/Sheet';

/** Opens a postcard: it unfolds from the message bottle, picture side first. */
export function PostcardSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const card = id ? postcardById(id) : undefined;
  const record = useLiveQuery(() => (id ? db.postcards.get(id) : undefined), [id]);
  const [back, setBack] = useState(false);

  useEffect(() => {
    setBack(false);
    if (id && record && !record.readAt) void markPostcardRead(id);
  }, [id, record]);

  return (
    <Sheet open={!!card} onClose={onClose} title={card ? `Postcard ${card.number} of ${ROUTE_1.length}` : 'Postcard'} className="fold">
      {card && (
        <div className="sheet-form">
          <div className="postcard-unfold">
            <Postcard card={card} record={record} back={back} />
          </div>
          <div className="row">
            <button type="button" className="btn ghost grow" onClick={() => setBack(!back)} aria-pressed={back}>
              {back ? 'See the picture' : 'Turn it over'}
            </button>
            <button type="button" className="btn primary grow" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export function Postcard({ card, record, back }: { card: Card; record?: PostcardRecord; back: boolean }) {
  const today = useToday();
  return (
    <div className="postcard" data-side={back ? 'back' : 'front'}>
      <div className="postcard-inner">
        <figure className="postcard-face postcard-front" inert={back}>
          <PostcardPicture card={card} className="postcard-art" large />
          <figcaption>
            <span className="postcard-place">{card.place}</span>
            <span className="postcard-region">{card.region}</span>
          </figcaption>
          <p className="sr-only">{card.alt}</p>
        </figure>
        <div className="postcard-face postcard-back" inert={!back}>
          <div className="postcard-stamp" aria-hidden="true">
            <span>{card.number}</span>
            <small>of {ROUTE_1.length}</small>
          </div>
          {record && (
            <p className="postcard-postmark" aria-label={`Sailed ${dayLabel(record.day, today)}`}>
              {dayLabel(record.day, today)}
            </p>
          )}
          <p className="postcard-message hand">{card.message}</p>
          <p className="postcard-sign hand">— Pip</p>
          <div className="postcard-find">
            <p className="label">Field find</p>
            <p>
              <b>{card.fieldFind.name}.</b> {card.fieldFind.note}
            </p>
          </div>
          <p className="small muted">
            {card.place}, {card.region} · {card.coordinates}
          </p>
          <details className="postcard-sources">
            <summary>Where these facts come from</summary>
            <ul>
              {card.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
            {!card.reviewed && <p className="small muted">A reviewer hasn&rsquo;t checked this card yet.</p>}
          </details>
        </div>
      </div>
    </div>
  );
}

/** The bottle that washes up on Today when a postcard is waiting. */
export function MessageBottle({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button type="button" className="message-bottle" onClick={onOpen} aria-label={count > 1 ? `${count} messages washed up. Open the first` : 'A message washed up. Open it'}>
      <svg viewBox="0 0 96 48" width="96" height="48" aria-hidden="true">
        <path d="M14 14 H58 L70 20 H82 V28 H70 L58 34 H14 Q4 34 4 24 Q4 14 14 14Z" fill="rgba(213,244,238,0.55)" stroke="#D5F4EE" strokeWidth="2" />
        <rect x="80" y="19" width="10" height="10" rx="2" fill="#B5835A" />
        <rect x="16" y="19" width="34" height="10" rx="5" fill="#F3E3BC" stroke="#9E4430" strokeWidth="1.5" />
        <path d="M30 19 v10" stroke="#9E4430" strokeWidth="1.5" />
      </svg>
      <span>{count > 1 ? `${count} messages washed up` : 'A message washed up'}</span>
    </button>
  );
}

/** Route I's six cards in the Journal. Places still ahead stay as blank slots. */
export function PostcardAlbum() {
  const records = useLiveQuery(() => db.postcards.toArray(), []);
  const [open, setOpen] = useState<string | null>(null);
  const got = new Map((records ?? []).map((r) => [r.id, r]));
  return (
    <>
      <p className="small muted">
        {got.size} of {ROUTE_1.length} · a card washes up the morning after each day the bottle fills.
      </p>
      <ul className="album">
        {ROUTE_1.map((c) =>
          got.has(c.id) ? (
            <li key={c.id}>
              <button type="button" className="album-card" onClick={() => setOpen(c.id)}>
                <PostcardPicture card={c} className="album-art" />
                <span className="album-place">{c.place}</span>
              </button>
            </li>
          ) : (
            <li key={c.id} className="album-empty" aria-label={`Postcard ${c.number}, still at sea`}>
              <span aria-hidden="true">{c.number}</span>
            </li>
          )
        )}
      </ul>
      <PostcardSheet id={open} onClose={() => setOpen(null)} />
    </>
  );
}
