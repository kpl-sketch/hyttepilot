import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { PageTitle } from "@/components/ui";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/brand";

export const metadata: Metadata = { title: "Personvern" };

/*
 * UTKAST. Teksten beskriver hva tjenesten faktisk lagrer, men den er ikke
 * juridisk kvalitetssikret. Før ekte brukere slipper inn må den som er
 * behandlingsansvarlig fylles inn (NEXT_PUBLIC_CONTROLLER_NAME), og teksten
 * bør leses av noen som kan personvern.
 */
const controller = process.env.NEXT_PUBLIC_CONTROLLER_NAME || "";

export default function PrivacyPage() {
  return (
    <PublicShell>
      <PageTitle
        title="Personvern"
        lead={`${APP_NAME} er en pilot i en lukket krets. Vi lagrer bare det som trengs for at lån av hytter skal fungere.`}
      />

      {!controller && (
        <p className="mb-8 rounded-md border border-barn p-4 font-medium text-barn">
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
            <li>Hytter du legger inn: navn, sted, beskrivelse, bilder, pris, regler, Vipps-nummer og praktiske opplysninger. Opptaksdata i bildene, som GPS-posisjon, fjernes før bildene lagres.</li>
            <li>Forespørsler du sender eller får, med datoer, antall personer, pris og meldinger.</li>
            <li>Hvem som har invitert hvem.</li>
            <li>Innlogginger: tidspunkt, IP-adresse og nettlesertype.</li>
          </ul>
          <p className="mt-2">Betaling skjer i Vipps, utenfor tjenesten. Vi lagrer ingen betalingsopplysninger.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold">Hvem ser hva</h2>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>Hytteeiere i kretsen ser alle hyttene og navnet på eieren.</li>
            <li>Venner uten egen hytte ser bare hyttene de er invitert til.</li>
            <li>Bildene av en hytte vises bare til dem som får se hytta.</li>
            <li>Eieren ser navn, e-postadresse og mobilnummer til den som sender en forespørsel.</li>
            <li>Vipps-nummeret vises til låneren når eieren har sagt ja. Adresse og praktiske opplysninger vises når lånet er betalt.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">Leverandører</h2>
          <p className="mt-2">
            Tjenesten kjører hos leverandører av nettdrift, database og utsending av e-post.
            De behandler opplysningene på våre vegne.
          </p>
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
