/**
 * Adressen til et bilde. `small` gir det lille bildet som brukes i lister.
 * `base` er stedet bildene hentes fra: `/bilder` for innloggede, og
 * `/invitasjon/<nøkkel>/bilder` på invitasjonssiden.
 */
export function photoSrc(photoId: string, small = false, base = "/bilder") {
  return small ? `${base}/${photoId}?s=liten` : `${base}/${photoId}`;
}

/**
 * Forsidebildet til en hytte i en liste. Hytter uten bilder får en rolig
 * flate med et hyttetak, slik at radene i listen står likt.
 */
export function CabinThumb({
  photoId,
  card = false,
  feature = false,
}: {
  photoId: string | null;
  card?: boolean;
  feature?: boolean;
}) {
  // card: stort bilde øverst i et kort, slik hytter vises i rutenett.
  // feature: ett bilde som fyller halve kortet når en hytte står alene. Da
  // hentes det store bildet, siden det lille blir uskarpt i den størrelsen.
  const frame = feature
    ? "aspect-[4/3] w-full transition-opacity group-hover:opacity-90 lg:aspect-auto lg:h-full lg:min-h-[26rem]"
    : card
      ? "aspect-[4/3] w-full rounded-2xl transition-opacity group-hover:opacity-90"
      : "h-24 w-28 shrink-0 rounded-xl sm:h-28 sm:w-40";
  if (!photoId) {
    return (
      <span
        aria-hidden="true"
        className={`${frame} grid place-items-center bg-fjord-soft text-pine/40`}
      >
        <svg viewBox="0 0 48 36" className={card || feature ? "w-20" : "w-12"} fill="none" stroke="currentColor" strokeWidth="2.5">
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
      src={photoSrc(photoId, !feature)}
      alt=""
      loading={feature ? undefined : "lazy"}
      decoding="async"
      className={`${frame} block bg-paper object-cover`}
    />
  );
}
