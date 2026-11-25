import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { PageTitle } from "@/components/ui";
import { APP_NAME, CONTACT_EMAIL, WHAT_IT_IS } from "@/lib/brand";

export const metadata: Metadata = { title: `Om ${APP_NAME}` };

/*
 * Hvem som står bak tjenesten. Faktaene om Martin bygger på intervjuer i
 * Dagsavisen (2021), DN og E24 om Maritim Utleie. Martin bør lese teksten.
 */
export default function AboutPage() {
  return (
    <PublicShell memberNav>
      <PageTitle
        title={`Om ${APP_NAME}`}
        lead={`${APP_NAME} er laget av Martin Koren og Karl Philip Lund. Vi vil gjøre det enkelt å låne bort hytta til folk du kjenner.`}
      />

      <div className="max-w-[65ch] space-y-8">
        <section>
          <h2 className="text-xl font-bold">Hvorfor vi lager {APP_NAME}</h2>
          <p className="mt-2">
            Mange hytter står tomme store deler av året. Samtidig har de fleste av oss venner
            med hytter vi aldri har vært på. I {APP_NAME} {WHAT_IT_IS}.
          </p>
          <p className="mt-2">
            Vi tror tillit vokser best mellom folk som kjenner hverandre. Derfor er en ny hytte
            privat til eieren selv velger hvem som får se den. Eieren svarer på hver forespørsel,
            og venners venner får ikke tilgang av seg selv. Alt starter i din egen hyttekrets.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">Martin Koren</h2>
          <p className="mt-2">
            Martin har jobbet med utleie mellom privatpersoner i over tjue år. Fra 2004 drev han
            Maritim Utleie, som formidlet private båter fra båteiere til leietakere. Dagens
            Næringsliv omtalte ham som den første i Norge med en slik tjeneste. Han stilte strenge
            krav til leietakerne, og tjenesten hadde svært få skader. Den erfaringen tar han med
            inn i {APP_NAME}: tydelige krav, gode rutiner og trygghet for den som låner bort.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">Karl Philip Lund</h2>
          <p className="mt-2">
            Karl Philip er partner og eier i INEVO, et digitalbyrå i Oslo med 20 ansatte som
            hjelper nettbutikker å vokse. Han er høyskolelektor ved Høyskolen Kristiania og NLA
            Høgskolen, der han underviser i digital markedsføring og praktisk bruk av KI. Han
            skriver jevnlig i norske aviser om teknologi, utdanning og åpenhet om KI. I {APP_NAME}{" "}
            bygger han selve tjenesten.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">Der vi er nå</h2>
          <p className="mt-2">
            {APP_NAME} er en lukket pilot. Bare de som er invitert, kan være med. De første er
            hytteeiere vi kjenner, og folk de selv inviterer. Betaling skjer foreløpig med Vipps,
            utenfor tjenesten. Til selskapet er stiftet, står vi to personlig bak.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">Ta kontakt</h2>
          <p className="mt-2">
            {CONTACT_EMAIL
              ? `Har du spørsmål? Send en e-post til ${CONTACT_EMAIL}.`
              : "Har du spørsmål? Ta kontakt med den som inviterte deg."}
          </p>
        </section>
      </div>
    </PublicShell>
  );
}
