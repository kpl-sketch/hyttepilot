/**
 * Fjell, fjord og en rød hytte med lys i vinduet. Et opplyst vindu betyr
 * at hytta er ledig. Samme gulfarge brukes i kalenderen.
 */
export function CabinScene({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 640 300"
      className={`w-full overflow-hidden rounded-3xl ${className}`}
      role="img"
      aria-label="En rød hytte ved en fjord, med fjell bak og lys i vinduet"
    >
      <defs>
        <linearGradient id="himmel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfe2ec" />
          <stop offset="1" stopColor="#f3f7f9" />
        </linearGradient>
        <linearGradient id="fjord" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5d8aa3" />
          <stop offset="1" stopColor="#2f5d78" />
        </linearGradient>
      </defs>
      <rect width="640" height="300" fill="url(#himmel)" />
      <path d="M0 190 L90 92 L150 140 L230 60 L320 160 L400 100 L470 150 L560 70 L640 140 L640 200 L0 200 Z" fill="#9db6c4" />
      <path d="M230 60 L254 86 L242 84 L230 92 L218 82 L208 85 Z M560 70 L582 94 L570 92 L560 100 L549 90 L540 92 Z M90 92 L108 112 L98 110 L90 116 L82 108 L74 110 Z" fill="#ffffff" />
      <path d="M0 200 L60 150 L130 185 L210 130 L300 196 L380 150 L450 188 L540 140 L640 196 L640 214 L0 214 Z" fill="#6f8fa1" />
      <rect y="206" width="640" height="94" fill="url(#fjord)" />
      <path d="M0 214 Q60 206 120 212 T240 212 T360 212 T480 212 T640 212" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" />
      <path d="M300 300 L300 238 Q420 214 640 226 L640 300 Z" fill="#2e4a3a" />
      <path d="M612 236 l14 -46 l14 46 z M584 238 l11 -34 l11 34 z" fill="#1f3a2c" />
      <path d="M430 236 v-34 l42 -26 l42 26 v34 z" fill="#b8312a" />
      <path d="M422 204 l50 -32 l50 32" fill="none" stroke="#1d2327" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M430 236 v-34 M514 236 v-34" stroke="#ffffff" strokeWidth="3" />
      <rect x="456" y="206" width="30" height="20" fill="#f4c04e" stroke="#ffffff" strokeWidth="3" />
      <path d="M471 206 v20" stroke="#ffffff" strokeWidth="2" />
      <rect x="492" y="172" width="9" height="20" fill="#1d2327" />
    </svg>
  );
}
