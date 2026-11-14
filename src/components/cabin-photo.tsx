/** Adressen til et bilde. `small` gir det lille bildet som brukes i lister. */
export function photoSrc(photoId: string, small = false) {
  return small ? `/bilder/${photoId}?s=liten` : `/bilder/${photoId}`;
}

/**
 * Forsidebildet til en hytte i en liste. Hytter uten bilder får en rolig
 * flate med et hyttetak, slik at radene i listen står likt.
 */
export function CabinThumb({ photoId }: { photoId: string | null }) {
  const frame = "h-[4.5rem] w-24 shrink-0 rounded-md sm:h-24 sm:w-32";
  if (!photoId) {
    return (
      <span
        aria-hidden="true"
        className={`${frame} grid place-items-center border border-line bg-surface text-line`}
      >
        <svg viewBox="0 0 48 36" className="w-12" fill="none" stroke="currentColor" strokeWidth="2.5">
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
      className={`${frame} border border-line bg-surface object-cover`}
    />
  );
}
