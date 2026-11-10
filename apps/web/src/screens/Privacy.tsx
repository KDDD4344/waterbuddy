import notice from '../../../../content/privacy-notice.json';
import { Sheet } from '../ui/Sheet';

type Notice = {
  version: number;
  updated: string;
  operator: string | null;
  contact: string | null;
  sections: { heading: string; paragraphs: string[] }[];
  review: { status: string };
};

export const PRIVACY = notice as Notice;

/** The privacy notice in plain words (Phase 8). Text lives in content/privacy-notice.json. */
export function PrivacySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const n = PRIVACY;
  const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(`${n.updated}T12:00:00`)
  );
  return (
    <Sheet open={open} onClose={onClose} title="Privacy" className="privacy-sheet">
      <div className="sheet-form privacy">
        {n.review.status !== 'approved' && (
          <p className="note">Draft for the pilot. It is waiting for a legal check before WaterBuddy launches.</p>
        )}
        {n.sections.map((s) => (
          <section key={s.heading}>
            <h3>{s.heading}</h3>
            {s.paragraphs.map((p) => (
              <p key={p.slice(0, 40)}>{p}</p>
            ))}
          </section>
        ))}
        <section>
          <h3>Who runs WaterBuddy</h3>
          <p>{n.operator ?? 'The WaterBuddy team. A name and address will be added here before launch.'}</p>
          <p>{n.contact ? <>Contact: {n.contact}</> : 'A contact address will be added here before launch.'}</p>
        </section>
        <p className="small muted">
          Version {n.version}, updated {date}.
        </p>
      </div>
    </Sheet>
  );
}
