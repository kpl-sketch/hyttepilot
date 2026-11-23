import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { PageTitle } from "@/components/ui";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/brand";
import { canSuggestDescription } from "@/lib/description-assist";

export const metadata: Metadata = { title: "Personvern" };

/*
 * UTKAST. Teksten beskriver hva tjenesten faktisk lagrer, men den er ikke
 * juridisk kvalitetssikret. Før ekte brukere slipper inn må den som er
 * behandlingsansvarlig fylles inn (NEXT_PUBLIC_CONTROLLER_NAME), og teksten
 * bør leses av noen som kan personvern.
 */
const controller = process.env.NEXT_PUBLIC_CONTROLLER_NAME || "";

/** Avsnittene om tekstforslag vises bare når tekstforslag er slått på. */
const suggestions = canSuggestDescription();

export default function PrivacyPage() {
  return (
    <PublicShell>
      <PageTitle
        title="Personvern"
        lead={`${APP_NAME} er en pilot i en lukket krets. Vi lagrer bare det som trengs for at lån av hytter skal fungere.`}
      />

      {!controller && (
        <p className="mb-8 rounded-xl border border-barn p-4 font-medium text-barn">
          Utkast: Hvem som er ansvarlig for opplysningene, er ikke fylt inn ennå.
        </p>
      )}

      <div className="max-w-[65ch] space-y-8">
        <section>
          <h2 className="text-xl font-bold">Hvem er ansvarlig</h2>
          <p className="mt-2">
            {controller
              ? `${controller} er ansvarlig for opplysningene i tjenesten.`
              : "Ansvarlig for opplysningene fylles inn før piloten åpner."}
            {CONTACT_EMAIL && ` Kontakt: ${CONTACT_EMAIL}.`}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">Hva vi lagrer</h2>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>Navn, e-postadresse og mobilnummer.</li>
            <li>Tidspunktet du ga Hytteløftet.</li>
            <li>Hytter du legger inn: navn, sted, adresse, kartposisjon, beskrivelse, bilder, pris, regler, Vipps-nummer og praktiske opplysninger. Opptaksdata i bildene, som GPS-posisjon, fjernes før bildene lagres.</li>
            <li>Forespørsler du sender eller får, med datoer, antall personer, pris og meldinger.</li>
            <li>Hvem som har invitert hvem, hvilken hytte invitasjonen gjelder, og en hilsen hvis avsenderen skrev en.</li>
            <li>Innlogginger: tidspunkt, IP-adresse og nettlesertype.</li>
            {suggestions && (
              <li>Tidspunktet du ba om et tekstforslag til en hytte. Selve forslaget lagrer vi ikke.</li>
            )}
          </ul>
          <p className="mt-2">Betaling skjer i Vipps, utenfor tjenesten. Vi lagrer ingen betalingsopplysninger.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold">Hvem ser hva</h2>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>En hytte er privat til eieren velger hvem som får se den. Bare eieren, de eieren har valgt, og administratorene ser hytta, bildene og navnet på eieren.</li>
            <li>Det å eie en hytte gir ikke innsyn i andres hytter.</li>
            <li>Administratorene ser alle hytter slik lånerne ser dem: bilder, beskrivelse, pris, regler, ledige datoer og området på kart. De ser også hvor mange som ser hver hytte, har spurt om å låne den og har lånt den. De ser ikke adresse, kartposisjon, Vipps-nummer eller praktiske opplysninger, og ikke hvem som har spurt eller lånt. De kan ikke spørre om å låne en hytte eieren ikke har vist dem.</li>
            <li>Du ser navnet på dem som viser deg en hytte, og dem du viser din. Ingen ser en liste over alle som er med.</li>
            <li>Eieren ser navnet på dem som ser hytta, og adressen eieren selv skrev inn i invitasjonen.</li>
            <li>Åpnes en invitasjonslenke uten innlogging, vises bare navnet på den som inviterer og en maskert e-postadresse.</li>
            <li>Eieren ser navn, e-postadresse og mobilnummer til den som sender en forespørsel.</li>
            <li>Vipps-nummeret vises til låneren når eieren har sagt ja. Adresse, kartposisjon og praktiske opplysninger vises når lånet er betalt.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">Leverandører</h2>
          <p className="mt-2">
            Tjenesten kjører hos leverandører av nettdrift, database og utsending av e-post.
            De behandler opplysningene på våre vegne.
          </p>
          <p className="mt-2">
            Når en hytteeier skriver inn adressen til hytta, slår vi den opp i Kartverkets åpne
            adresseregister for å foreslå riktig adresse og plassering. Kartverket får bare
            søketeksten, ikke hvem som søker.
          </p>
          <p className="mt-2">
            Lenkene som viser veien til hytta, åpner Google Maps eller Apple Kart. De får da
            vite adressen eller posisjonen du ber om veibeskrivelse til.
          </p>
          {suggestions && (
            <p className="mt-2">
              Ber du om et tekstforslag til beskrivelsen av hytta, sender vi forsidebildet og
              stedsnavnet til en AI-tjeneste som skriver utkastet. Navnet ditt, navnet på hytta,
              adressen og kartposisjonen sendes ikke. Vi ber om at bildet behandles i EU, og at
              AI-tjenesten sletter bildet og teksten når forslaget er laget.
            </p>
          )}
        </section>

        <section>
          <h2 className="text-xl font-bold">Innsyn og sletting</h2>
          <p className="mt-2">
            Du kan be om å få se, rette eller slette opplysningene dine.
            {CONTACT_EMAIL ? ` Send en e-post til ${CONTACT_EMAIL}.` : " Ta kontakt med den som inviterte deg."}
          </p>
        </section>
      </div>
    </PublicShell>
  );
}
