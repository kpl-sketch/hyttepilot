const SIZES = {
  /** Ved siden av et navn i en linje. */
  sm: "size-8 text-sm",
  /** I kort og lister. */
  md: "size-11 text-base",
  /** Øverst på invitasjonen og i hilsener. */
  lg: "size-16 text-2xl",
  /** På profilsiden. */
  xl: "size-28 text-5xl",
};

/**
 * Profilbildet til en person, eller initialen i en rund brikke når personen
 * ikke har bilde. Bildet er pynt ved siden av navnet, som alltid står i
 * teksten. Derfor har det tom alt-tekst og leses ikke opp to ganger.
 *
 * `src` lages av avatarSrc eller inviterAvatarSrc, med versjonen tjenestelaget
 * gir. Uten versjon er `src` null, og initialen vises.
 */
export function Avatar({
  name,
  src,
  size = "md",
  className = "",
}: {
  name: string;
  src: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const frame = `${SIZES[size]} shrink-0 rounded-full ${className}`;
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className={`${frame} grid place-items-center bg-pine font-bold text-white`}
      >
        {name.trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    // Bildene ligger bak tilgangsreglene og er allerede forminsket, så de
    // hentes direkte og ikke gjennom bildeoptimaliseringen i Next.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      decoding="async"
      className={`${frame} block bg-fjord-soft object-cover`}
    />
  );
}
