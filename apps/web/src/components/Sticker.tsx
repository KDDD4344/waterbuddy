import type { ReactNode } from 'react';
import type { StickerId } from '../domain/tasks';

/**
 * Journal stickers, printed in two inks: an ochre fill slightly off-register under a rust
 * outline, like a hand-pressed stamp. One per field task.
 */
const SHAPES: Record<StickerId, { name: string; fill: ReactNode; line: ReactNode }> = {
  leaf: {
    name: 'Pressed leaf',
    fill: <path d="M10 38 C8 20 20 8 38 8 C38 26 28 38 10 38 Z" />,
    line: (
      <>
        <path d="M10 38 C8 20 20 8 38 8 C38 26 28 38 10 38 Z" />
        <path d="M10 38 L30 16 M18 30 L18 22 M24 24 L30 24" />
      </>
    )
  },
  shell: {
    name: 'Scallop shell',
    fill: <path d="M24 40 L8 22 Q24 2 40 22 Z" />,
    line: (
      <>
        <path d="M24 40 L8 22 Q24 2 40 22 Z" />
        <path d="M24 40 L16 14 M24 40 L24 10 M24 40 L32 14" />
      </>
    )
  },
  moon: {
    name: 'Crescent moon',
    fill: <path d="M30 8 A16 16 0 1 0 30 40 A12 12 0 1 1 30 8 Z" />,
    line: (
      <>
        <path d="M30 8 A16 16 0 1 0 30 40 A12 12 0 1 1 30 8 Z" />
        <path d="M38 14 l2 -2 M40 22 h3" />
      </>
    )
  },
  tumbler: {
    name: 'Steel tumbler',
    fill: <path d="M13 10 H35 L31 40 H17 Z" />,
    line: (
      <>
        <path d="M13 10 H35 L31 40 H17 Z" />
        <path d="M15 22 Q24 19 33 22" />
      </>
    )
  },
  feather: {
    name: 'Feather',
    fill: <path d="M12 40 C14 24 26 10 38 8 C36 22 26 34 12 40 Z" />,
    line: (
      <>
        <path d="M12 40 C14 24 26 10 38 8 C36 22 26 34 12 40 Z" />
        <path d="M12 40 L32 14 M22 28 l-4 -6 M27 22 l-3 -6 M24 29 l6 1" />
      </>
    )
  },
  compass: {
    name: 'Compass',
    fill: <circle cx="24" cy="24" r="16" />,
    line: (
      <>
        <circle cx="24" cy="24" r="16" />
        <path d="M24 11 L28 24 L24 37 L20 24 Z M24 6 v3 M24 39 v3 M6 24 h3 M39 24 h3" />
      </>
    )
  },
  lantern: {
    name: 'Lantern',
    fill: <rect x="15" y="15" width="18" height="22" rx="4" />,
    line: (
      <>
        <rect x="15" y="15" width="18" height="22" rx="4" />
        <path d="M19 15 Q24 6 29 15 M15 22 H33 M15 30 H33 M24 37 v4" />
      </>
    )
  },
  starfish: {
    name: 'Starfish',
    fill: <path d="M24 6 L28.5 18.5 L42 19 L31.5 27.5 L35 41 L24 33 L13 41 L16.5 27.5 L6 19 L19.5 18.5 Z" />,
    line: (
      <>
        <path d="M24 6 L28.5 18.5 L42 19 L31.5 27.5 L35 41 L24 33 L13 41 L16.5 27.5 L6 19 L19.5 18.5 Z" />
        <circle cx="24" cy="24" r="2" />
      </>
    )
  },
  bell: {
    name: 'Bell',
    fill: <path d="M12 34 Q12 13 24 11 Q36 13 36 34 Z" />,
    line: (
      <>
        <path d="M12 34 Q12 13 24 11 Q36 13 36 34 Z M9 34 H39" />
        <circle cx="24" cy="38" r="3" />
        <path d="M24 11 V7" />
      </>
    )
  },
  mint: {
    name: 'Mint sprig',
    fill: (
      <>
        <ellipse cx="17" cy="22" rx="8" ry="11" transform="rotate(-30 17 22)" />
        <ellipse cx="31" cy="22" rx="8" ry="11" transform="rotate(30 31 22)" />
      </>
    ),
    line: (
      <>
        <ellipse cx="17" cy="22" rx="8" ry="11" transform="rotate(-30 17 22)" />
        <ellipse cx="31" cy="22" rx="8" ry="11" transform="rotate(30 31 22)" />
        <path d="M24 42 V18" />
      </>
    )
  },
  sun: {
    name: 'Sun',
    fill: <circle cx="24" cy="24" r="10" />,
    line: (
      <>
        <circle cx="24" cy="24" r="10" />
        <path d="M24 4 v6 M24 38 v6 M4 24 h6 M38 24 h6 M10 10 l4 4 M34 34 l4 4 M38 10 l-4 4 M10 38 l4 -4" />
      </>
    )
  },
  pebble: {
    name: 'River pebble',
    fill: <ellipse cx="24" cy="26" rx="17" ry="12" />,
    line: (
      <>
        <ellipse cx="24" cy="26" rx="17" ry="12" />
        <path d="M14 24 Q20 20 28 22" />
      </>
    )
  },
  owl: {
    name: 'Owl',
    fill: <ellipse cx="24" cy="26" rx="14" ry="16" />,
    line: (
      <>
        <ellipse cx="24" cy="26" rx="14" ry="16" />
        <circle cx="18" cy="22" r="4" />
        <circle cx="30" cy="22" r="4" />
        <path d="M22 28 L24 31 L26 28 M12 12 L16 15 M36 12 L32 15" />
      </>
    )
  },
  bottle: {
    name: 'Message in a bottle',
    fill: <path d="M12 18 H30 L36 22 H41 V30 H36 L30 34 H12 Q6 34 6 26 Q6 18 12 18 Z" />,
    line: (
      <>
        <path d="M12 18 H30 L36 22 H41 V30 H36 L30 34 H12 Q6 34 6 26 Q6 18 12 18 Z" />
        <rect x="13" y="23" width="13" height="6" rx="3" />
      </>
    )
  }
};

// eslint-disable-next-line react-refresh/only-export-components
export function stickerName(id: StickerId): string {
  return SHAPES[id].name;
}

type Props = { id: StickerId; size?: number; className?: string; title?: string };

export function Sticker({ id, size = 48, className, title }: Props) {
  const s = SHAPES[id];
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={title ?? `${s.name} sticker`}>
      <g fill="var(--wb-ochre)" opacity="0.7" transform="translate(2 2)">
        {s.fill}
      </g>
      <g fill="#F3E3BC">{s.fill}</g>
      <g fill="none" stroke="var(--wb-rust)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {s.line}
      </g>
    </svg>
  );
}
