/**
 * Decorative concentric rings and tick marks behind the globe. Static SVG
 * with CSS rotation only — no data, so nothing here can be mistaken for a
 * reading.
 */
export function HudRings({ className }: { className?: string }) {
  const ticks = Array.from({ length: 72 }, (_, i) => i);
  return (
    <svg viewBox="-200 -200 400 400" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" className="text-accent-cyan">
        <circle r="196" strokeWidth="0.5" opacity="0.25" />
        <circle r="168" strokeWidth="0.5" opacity="0.18" strokeDasharray="2 6" />
        <g className="origin-center animate-[spin_90s_linear_infinite]">
          <circle r="182" strokeWidth="1.2" opacity="0.35" strokeDasharray="60 22 6 22" />
        </g>
        <g className="origin-center animate-[spin_140s_linear_infinite_reverse]">
          <circle r="154" strokeWidth="0.8" opacity="0.3" strokeDasharray="14 10" />
        </g>
        <g opacity="0.35">
          {ticks.map((i) => {
            const major = i % 6 === 0;
            return (
              <line
                key={i}
                x1="0"
                y1={-(major ? 188 : 192)}
                x2="0"
                y2="-199"
                strokeWidth={major ? 1.2 : 0.6}
                transform={`rotate(${i * 5})`}
              />
            );
          })}
        </g>
      </g>
    </svg>
  );
}
