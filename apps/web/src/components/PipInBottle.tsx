// Static 2D Pip for the Phase 0 shell and the no-3D fallback.
// Phase 2 replaces this on capable devices with the real-time 3D tidepool.

type Props = { className?: string; fill?: number; label?: string; transparent?: boolean; corked?: boolean };

export function PipInBottle({ className, fill = 0.62, label, transparent = false, corked = false }: Props) {
  // The water is drawn full and slid down, so the level can animate with a CSS transform.
  const drop = (1 - Math.max(0, Math.min(1, fill))) * 92;
  return (
    <svg
      className={className}
      viewBox="0 0 360 200"
      role="img"
      aria-label={label ?? 'Pip the hermit crab peeking out of his glass bottle, which is partly full of water.'}
    >
      <defs>
        <clipPath id="pib-body">
          <path d="M70 70 Q70 52 92 52 H222 Q246 52 262 66 L282 82 H300 V118 H282 L262 134 Q246 148 222 148 H92 Q70 148 70 130 Z" />
        </clipPath>
      </defs>
      {!transparent && <rect width="360" height="200" fill="#0E3A49" />}
      {!transparent && <path d="M0 170 Q90 160 180 170 T360 168 V200 H0 Z" fill="#165363" />}
      <g clipPath="url(#pib-body)">
        <g className="pib-water" style={{ transform: `translateY(${drop}px)` }}>
          <rect x="60" y="58" width="250" height="120" fill="#4FC0B2" />
          <path d="M60 58 Q120 52 180 58 T310 58" fill="none" stroke="#CFF3EC" strokeWidth="3" />
        </g>
      </g>
      <path
        d="M70 70 Q70 52 92 52 H222 Q246 52 262 66 L282 82 H300 V118 H282 L262 134 Q246 148 222 148 H92 Q70 148 70 130 Z"
        fill="rgba(213,244,238,0.12)"
        stroke="#D5F4EE"
        strokeWidth="2.5"
      />
      <path d="M96 62 H200" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="4" strokeLinecap="round" />
      {corked && <rect className="pib-cork" x="258" y="80" width="24" height="40" rx="4" fill="#B5835A" stroke="#7A4A2E" strokeWidth="2" />}
      <g transform="translate(300 94)">
        <line x1="-8" y1="-18" x2="-14" y2="-40" stroke="#E9784F" strokeWidth="5" strokeLinecap="round" />
        <line x1="8" y1="-18" x2="12" y2="-42" stroke="#E9784F" strokeWidth="5" strokeLinecap="round" />
        <circle cx="-14" cy="-44" r="9" fill="#FCFBF6" />
        <circle cx="12" cy="-46" r="9" fill="#FCFBF6" />
        <circle cx="-12" cy="-43" r="5" fill="#0F1D26" />
        <circle cx="14" cy="-45" r="5" fill="#0F1D26" />
        <ellipse cx="0" cy="0" rx="30" ry="22" fill="#E9784F" />
        <path d="M-30 -2 Q0 -26 30 -2" fill="#C0523A" />
        <ellipse cx="34" cy="10" rx="13" ry="10" fill="#E9784F" />
        <path d="M40 4 L52 0" stroke="#5A2A22" strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  );
}
