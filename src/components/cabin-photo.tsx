/** Adressen til et bilde. `small` gir det lille bildet som brukes i lister. */
export function photoSrc(photoId: string, small = false) {
  return small ? `/bilder/${photoId}?s=liten` : `/bilder/${photoId}`;
}

/**
 * Forsidebildet til en hytte i en liste. Hytter uten bilder får en rolig
 * flate med et hyttetak, slik at radene i listen står likt.
 */
export function CabinThumb({ photoId, card = false }: { photoId: string | null; card?: boolean }) {
  // card: stort bilde øverst i et kort, slik hytter vises i rutenett.
  const frame = card
    ? "aspect-[4/3] w-full rounded-2xl transition-opacity group-hover:opacity-90"
    : "h-24 w-28 shrink-0 rounded-xl sm:h-28 sm:w-40";
  if (!photoId) {
    return (
      <span
        aria-hidden="true"
        className={`${frame} grid place-items-center bg-fjord-soft text-pine/40`}
      >
        <svg viewBox="0 0 48 36" className={card ? "w-20" : "w-12"} fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M4 20 24 5l20 15" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 17v14h28V17" strokeLinejoin="round" />
          <path d="M21 31v-8h6v8" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    // Bildene ligger bak innlogging og er allerede forminsket, så de hentes
    // direkte og ikke gjennom bildeoptimaliseringen i Next.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoSrc(photoId, true)}
      alt=""
      loading="lazy"
      decoding="async"
      className={`${frame} block bg-paper object-cover`}
    />
  );
}
