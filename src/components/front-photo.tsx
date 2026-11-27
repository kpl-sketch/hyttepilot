import saunaLarge from "@/assets/forside/badstue-1086.webp";
import saunaSmall from "@/assets/forside/badstue-600.webp";
import bayLarge from "@/assets/forside/bukt-1200.webp";
import baySmall from "@/assets/forside/bukt-600.webp";
import large from "@/assets/forside/sommerkveld-1485.webp";
import small from "@/assets/forside/sommerkveld-800.webp";
import roomLarge from "@/assets/forside/stue-1200.webp";
import roomSmall from "@/assets/forside/stue-600.webp";

/*
 * Bildene på forsiden og målgruppesidene er ekte fotografier fra hytter.
 * De er åpne for alle, også uten innlogging. Derfor gjelder to regler:
 * bildene skal være tatt på eller ved en hytte prosjekteierne selv låner
 * bort, og verken bildene eller tekstene til dem skal si hvor hytta ligger.
 * Hyttene i tjenesten er private, og forsiden skal ikke vise noe annet.
 * Prosjekteier har sagt ja til disse fire bildene (2026-11-27). Et nytt bilde
 * trenger et nytt ja.
 *
 * Filene importeres herfra og ligger derfor under /_next/static, som
 * innloggingssjekken i src/proxy.ts slipper forbi. Legges et bilde i public/,
 * blir den som ikke er logget inn, sendt til innlogging i stedet for å få det.
 *
 * Hvert bilde finnes i to bredder, så mobilen slipper å hente det store.
 * Filene er allerede forminsket og hentes direkte, ikke gjennom
 * bildeoptimaliseringen i Next.
 */

type Source = { src: string; width: number; height: number };

function srcSet(a: Source, b: Source) {
  return `${a.src} ${a.width}w, ${b.src} ${b.width}w`;
}

/** Hovedbildet: rammet inn som et papirbilde limt inn i en hyttebok. */
export function FrontPhoto({ className = "" }: { className?: string }) {
  return (
    <figure
      className={`rotate-1 rounded-sm bg-white p-3 pb-4 shadow-print sm:p-4 sm:pb-5 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={large.src}
        srcSet={srcSet(small, large)}
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

/**
 * Tre bilder lenger ned på forsiden: det man ser fram til på en hytte. På
 * mobil står det første stort og de to andre ved siden av hverandre under.
 * På større skjermer står alle tre på rad, med badstua i midten.
 *
 * Ikke en liste: bildene er stemning, ikke punkter å lese gjennom.
 */
export function FrontPhotoRow({ className = "" }: { className?: string }) {
  const frame = "block aspect-[4/3] w-full rounded-2xl bg-paper object-cover";
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={saunaLarge.src}
        srcSet={srcSet(saunaSmall, saunaLarge)}
        sizes="(min-width: 640px) 33vw, 100vw"
        width={saunaLarge.width}
        height={saunaLarge.height}
        alt="Badstue med vindu ut mot sjøen og to småbåter"
        loading="lazy"
        decoding="async"
        className={`${frame} col-span-2 sm:order-2 sm:col-span-1`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={roomLarge.src}
        srcSet={srcSet(roomSmall, roomLarge)}
        sizes="(min-width: 640px) 33vw, 50vw"
        width={roomLarge.width}
        height={roomLarge.height}
        alt="Lys stue med sofa, lenestol og salongbord"
        loading="lazy"
        decoding="async"
        className={`${frame} sm:order-1`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bayLarge.src}
        srcSet={srcSet(baySmall, bayLarge)}
        sizes="(min-width: 640px) 33vw, 50vw"
        width={bayLarge.width}
        height={bayLarge.height}
        alt="Bukt med svaberg og strand under tung himmel"
        loading="lazy"
        decoding="async"
        className={`${frame} sm:order-3`}
      />
    </div>
  );
}
