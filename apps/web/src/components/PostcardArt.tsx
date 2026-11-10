import { useId } from 'react';
import type { Postcard, SceneId } from '../domain/voyage';

/**
 * Placeholder postcard illustrations, drawn in the app's inks. Phase 7 replaces them with
 * hand-painted art (content/postcards/<route>/<id>.json → "art"); until then each place
 * gets a simple scene that matches its alt text.
 */
export function PostcardArt({ scene, className }: { scene: SceneId; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const g = (name: string) => `${name}-${uid}`;
  return (
    <svg className={className} viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={g('day')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F3E3BC" />
          <stop offset="1" stopColor="#CFE7E2" />
        </linearGradient>
        <linearGradient id={g('dusk')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0E3A49" />
          <stop offset="0.55" stopColor="#E9784F" />
          <stop offset="1" stopColor="#F3C98A" />
        </linearGradient>
        <linearGradient id={g('water')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6FB7B0" />
          <stop offset="1" stopColor="#0E3A49" />
        </linearGradient>
        <linearGradient id={g('clear')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A9D6CF" />
          <stop offset="1" stopColor="#4F9C95" />
        </linearGradient>
      </defs>
      {SCENES[scene](g)}
      <rect width="320" height="200" fill="none" stroke="#13303A" strokeOpacity="0.15" strokeWidth="2" />
    </svg>
  );
}

/** The painted illustration when it exists, else the drawn placeholder. */
export function PostcardPicture({ card, className, large = false }: { card: Postcard; className?: string; large?: boolean }) {
  if (!card.art) return <PostcardArt scene={card.scene} className={className} />;
  const base = `/art/postcards/${card.id}`;
  return (
    <img
      className={className}
      src={`${base}-800.webp`}
      srcSet={`${base}-800.webp 800w, ${base}-1600.webp 1600w`}
      sizes={large ? '(max-width: 520px) 92vw, 480px' : '160px'}
      alt=""
      loading={large ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
}

type Draw = (g: (n: string) => string) => React.ReactNode;

const palm = (x: number, y: number, s = 1) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0 0 Q4 -30 2 -56" stroke="#5B4A33" strokeWidth="4" fill="none" strokeLinecap="round" />
    <g fill="#2F6B4F">
      <path d="M2 -56 Q-20 -64 -34 -48 Q-16 -56 2 -54Z" />
      <path d="M2 -56 Q24 -66 38 -50 Q20 -58 2 -54Z" />
      <path d="M2 -56 Q-8 -78 -26 -80 Q-8 -70 1 -56Z" />
      <path d="M2 -56 Q14 -78 32 -78 Q14 -70 3 -56Z" />
    </g>
  </g>
);

const SCENES: Record<SceneId, Draw> = {
  'floating-islands': (g) => (
    <>
      <rect width="320" height="200" fill={`url(#${g('day')})`} />
      <path d="M0 92 Q50 56 100 80 Q150 50 210 78 Q260 58 320 82 V110 H0Z" fill="#4F7F7A" opacity="0.55" />
      <rect y="96" width="320" height="104" fill={`url(#${g('water')})`} />
      {[
        [60, 128, 34],
        [150, 116, 22],
        [206, 138, 36],
        [110, 168, 28],
        [210, 182, 20]
      ].map(([x, y, r]) => (
        <g key={`${x}-${y}`}>
          <ellipse cx={x} cy={y} rx={r} ry={r! * 0.32} fill="#5E8C4A" />
          <ellipse cx={x} cy={y} rx={r! * 0.55} ry={r! * 0.16} fill="#3F6F8A" opacity="0.8" />
          <ellipse cx={x} cy={y! - 2} rx={r} ry={r! * 0.3} fill="none" stroke="#86AE5E" strokeWidth="2" />
        </g>
      ))}
      <g transform="translate(200 124)" fill="#7A4A2E">
        <ellipse cx="0" cy="0" rx="9" ry="5" />
        <path d="M6 -3 L12 -12 L14 -11 L10 -2Z M12 -12 l-3 -5 M12 -12 l4 -5" stroke="#7A4A2E" strokeWidth="1.5" />
        <path d="M-6 3 v8 M-2 3 v8 M3 3 v8 M7 3 v8" stroke="#7A4A2E" strokeWidth="1.6" />
      </g>
      <path d="M150 146 h34 l-6 6 h-22z" fill="#5B4A33" />
    </>
  ),
  'clear-river': (g) => (
    <>
      <rect width="320" height="200" fill={`url(#${g('clear')})`} />
      {Array.from({ length: 70 }, (_, i) => {
        const x = (i * 53) % 320;
        const y = 30 + ((i * 37) % 170);
        const r = 5 + ((i * 7) % 9);
        return <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.7} fill={i % 3 ? '#C9BFA6' : '#9C9A86'} opacity="0.75" />;
      })}
      <path d="M0 0 H320 V26 Q240 40 160 30 T0 34Z" fill="#3E6B4C" />
      <path d="M0 200 V176 Q90 166 170 178 T320 172 V200Z" fill="#3E6B4C" />
      <path d="M96 142 q60 14 130 0 l-10 10 q-55 10 -110 0z" fill="#0E3A49" opacity="0.28" />
      <path d="M90 104 q66 16 140 0 l-12 12 q-58 12 -116 0z" fill="#7A4A2E" />
      <path d="M100 106 q56 10 120 0" stroke="#A9744A" strokeWidth="3" fill="none" />
      <path d="M150 100 l18 -30" stroke="#5B4A33" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  'river-island': (g) => (
    <>
      <rect width="320" height="200" fill={`url(#${g('day')})`} />
      <rect y="78" width="320" height="122" fill="#8FA89A" />
      <path d="M0 78 H320 V96 Q160 88 0 98Z" fill="#B7C7B9" />
      <path d="M20 128 Q120 104 300 118 Q250 140 40 140Z" fill="#5E8C4A" />
      {[60, 96, 150, 210, 250].map((x, i) => (
        <circle key={x} cx={x} cy={118 - (i % 2) * 4} r={10 + (i % 3) * 3} fill="#3F6F45" />
      ))}
      {[118, 180, 228].map((x) => (
        <g key={x} transform={`translate(${x} 124)`}>
          <rect x="-8" y="-6" width="16" height="10" fill="#C9A66B" />
          <path d="M-12 -6 L0 -18 L12 -6Z" fill="#8C6A3E" />
        </g>
      ))}
      <path d="M190 168 h56 l-8 9 h-40z" fill="#5B4A33" />
      <rect x="204" y="158" width="18" height="10" fill="#E9784F" />
      <path d="M0 150 Q80 146 160 152 T320 150" stroke="#CFE7E2" strokeWidth="2" fill="none" opacity="0.7" />
    </>
  ),
  mangroves: (g) => (
    <>
      <rect width="320" height="200" fill={`url(#${g('dusk')})`} />
      <circle cx="236" cy="70" r="16" fill="#F3E3BC" opacity="0.9" />
      <rect y="128" width="320" height="72" fill="#244E57" />
      <path d="M0 140 Q160 134 320 142" stroke="#F3C98A" strokeWidth="2" opacity="0.5" fill="none" />
      {[30, 92, 160, 270].map((x, i) => (
        <g key={x} transform={`translate(${x} 128)`}>
          <ellipse cx="0" cy={-42 - (i % 2) * 8} rx={34 - (i % 2) * 6} ry="22" fill="#1E3B33" />
          <path d="M0 -30 V-6 M0 -14 Q-14 -6 -20 10 M0 -14 Q14 -6 20 10 M0 -8 Q-6 2 -8 12 M0 -8 Q6 2 8 12" stroke="#1E3B33" strokeWidth="3" fill="none" />
        </g>
      ))}
      <g transform="translate(206 166)">
        <path d="M-14 0 Q0 -14 14 0 Z" fill="#7A4A2E" />
        <path d="M14 0 L28 4" stroke="#7A4A2E" strokeWidth="2" />
      </g>
    </>
  ),
  lagoon: (g) => (
    <>
      <rect width="320" height="200" fill={`url(#${g('day')})`} />
      <rect y="92" width="320" height="108" fill="#6FB7B0" />
      <path d="M0 92 Q100 86 200 90 T320 88 V96 H0Z" fill="#E7D6A8" />
      {[110, 130, 150, 170].map((y, i) => (
        <path key={y} d={`M${20 + i * 30} ${y} h${60 - i * 6}`} stroke="#CFE7E2" strokeWidth="2" opacity="0.7" />
      ))}
      <path d="M150 152 Q172 120 196 152 Z" fill="#5E6F78" />
      <path d="M140 154 Q170 148 206 154" stroke="#CFE7E2" strokeWidth="2.5" fill="none" />
      {[
        [70, 40],
        [96, 52],
        [230, 34],
        [252, 46]
      ].map(([x, y]) => (
        <path key={`${x}`} d={`M${x} ${y} q6 -6 12 0 q6 -6 12 0`} stroke="#13303A" strokeWidth="2" fill="none" />
      ))}
    </>
  ),
  backwaters: (g) => (
    <>
      <rect width="320" height="200" fill={`url(#${g('day')})`} />
      <rect y="70" width="320" height="34" fill="#6FB7B0" />
      <path d="M0 102 H320 V112 H0Z" fill="#9C7B52" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} y={112 + i * 15} width="320" height="15" fill={i % 2 ? '#7DB55B' : '#9BCB68'} />
      ))}
      {Array.from({ length: 30 }, (_, i) => (
        <path key={i} d={`M${(i * 23) % 320} ${126 + ((i * 17) % 70)} l3 -8 l3 8`} stroke="#4F8A3A" strokeWidth="1.5" fill="none" />
      ))}
      {palm(40, 104, 0.9)}
      {palm(120, 102, 1.1)}
      {palm(270, 104, 1)}
      <path d="M180 86 h48 l-6 8 h-36z" fill="#5B4A33" />
      <path d="M186 86 q18 -14 36 0" fill="#C9A66B" />
    </>
  )
};
