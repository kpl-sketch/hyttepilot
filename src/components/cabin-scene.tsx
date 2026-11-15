/**
 * Fjell, fjord og en rød hytte i kveldslys, med lys i vinduet. Et opplyst
 * vindu betyr at hytta er ledig. Samme gullfarge brukes i kalenderen.
 * Hver gradient har en id med prefiks, så scenen kan stå flere ganger på
 * samme side uten at fargene blandes.
 */
export function CabinScene({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 640 300"
      className={`w-full overflow-hidden rounded-3xl shadow-card ${className}`}
      role="img"
      aria-label="En rød hytte ved en fjord i kveldslys, med fjell bak og lys i vinduet"
    >
      <defs>
        <linearGradient id="hytte-himmel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9b98a" />
          <stop offset="0.55" stopColor="#f6d9b4" />
          <stop offset="1" stopColor="#fbecd8" />
        </linearGradient>
        <linearGradient id="hytte-fjord" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6f8790" />
          <stop offset="1" stopColor="#2f4651" />
        </linearGradient>
        <radialGradient id="hytte-sol" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3d6" />
          <stop offset="1" stopColor="#fff3d6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hytte-glod" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd77a" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffd77a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="640" height="300" fill="url(#hytte-himmel)" />
      {/* Lav kveldssol bak fjellene. */}
      <circle cx="170" cy="150" r="110" fill="url(#hytte-sol)" />
      <circle cx="170" cy="150" r="26" fill="#fff1d2" />
      <path d="M0 190 L90 92 L150 140 L230 60 L320 160 L400 100 L470 150 L560 70 L640 140 L640 200 L0 200 Z" fill="#c4a29a" />
      <path d="M230 60 L254 86 L242 84 L230 92 L218 82 L208 85 Z M560 70 L582 94 L570 92 L560 100 L549 90 L540 92 Z M90 92 L108 112 L98 110 L90 116 L82 108 L74 110 Z" fill="#fff6ea" />
      <path d="M0 200 L60 150 L130 185 L210 130 L300 196 L380 150 L450 188 L540 140 L640 196 L640 214 L0 214 Z" fill="#8f7a7c" />
      <rect y="206" width="640" height="94" fill="url(#hytte-fjord)" />
      {/* Solstripe i vannet. */}
      <path d="M150 222 h40 M140 234 h60 M156 246 h28" stroke="#fbe2b8" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />
      <path d="M0 214 Q60 206 120 212 T240 212 T360 212 T480 212 T640 212" fill="none" stroke="#fff6ea" strokeOpacity="0.35" strokeWidth="2" />
      <path d="M300 300 L300 238 Q420 214 640 226 L640 300 Z" fill="#3d4a33" />
      <path d="M612 236 l14 -46 l14 46 z M584 238 l11 -34 l11 34 z M356 240 l9 -28 l9 28 z" fill="#2c3826" />
      {/* Varmt lys fra vinduet. */}
      <circle cx="471" cy="216" r="46" fill="url(#hytte-glod)" />
      <path d="M430 236 v-34 l42 -26 l42 26 v34 z" fill="#a13a26" />
      <path d="M422 204 l50 -32 l50 32" fill="none" stroke="#2a221d" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M430 236 v-34 M514 236 v-34" stroke="#fff6ea" strokeWidth="3" />
      <rect x="456" y="206" width="30" height="20" fill="#f6c45a" stroke="#fff6ea" strokeWidth="3" />
      <path d="M471 206 v20" stroke="#fff6ea" strokeWidth="2" />
      <rect x="492" y="172" width="9" height="20" fill="#2a221d" />
      {/* Røyk fra pipa: noen er der. */}
      <path d="M497 166 q-8 -10 2 -18 q10 -8 0 -18" fill="none" stroke="#fff6ea" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
