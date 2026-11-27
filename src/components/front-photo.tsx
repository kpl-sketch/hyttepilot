import large from "@/assets/forside/sommerkveld-1485.webp";
import small from "@/assets/forside/sommerkveld-800.webp";

/**
 * Bildet på forsiden og målgruppesidene: et ekte fotografi fra en hytte,
 * rammet inn som et papirbilde limt inn i en hyttebok.
 *
 * Bildet er åpent for alle, også uten innlogging. Derfor gjelder to regler:
 * det skal være tatt på en hytte prosjekteierne selv låner bort, og verken
 * bildet eller teksten under skal si hvor hytta ligger. Hyttene i tjenesten
 * er private, og forsiden skal ikke vise noe annet.
 *
 * Filene importeres herfra og ligger derfor under /_next/static, som
 * innloggingssjekken i src/proxy.ts slipper forbi. Legges bildet i public/,
 * blir den som ikke er logget inn, sendt til innlogging i stedet for å få det.
 */
export function FrontPhoto({ className = "" }: { className?: string }) {
  return (
    <figure
      className={`rotate-1 rounded-sm bg-white p-3 pb-4 shadow-print sm:p-4 sm:pb-5 ${className}`}
    >
      {/* Filene er allerede laget i to størrelser, så de hentes direkte og
          ikke gjennom bildeoptimaliseringen i Next. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={large.src}
        srcSet={`${small.src} ${small.width}w, ${large.src} ${large.width}w`}
        sizes="(min-width: 1024px) 45vw, 100vw"
        width={large.width}
        height={large.height}
        alt="Solnedgang over en fjord, sett fra terrassen på en hytte"
        decoding="async"
        className="block aspect-[4/3] w-full rounded-[2px] bg-paper object-cover"
      />
      <figcaption className="pt-3 text-center font-display text-lg text-muted sm:pt-4">
        En sommerkveld på en av hyttene
      </figcaption>
    </figure>
  );
}
