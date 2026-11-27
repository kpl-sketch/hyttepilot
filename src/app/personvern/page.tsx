import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { PageTitle } from "@/components/ui";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/brand";
import { canSuggestDescription } from "@/lib/description-assist";
import { canFetchFromLinkedIn } from "@/lib/linkedin";

export const metadata: Metadata = { title: "Personvern" };

/*
 * UTKAST. Teksten beskriver hva tjenesten faktisk lagrer, men den er ikke
 * juridisk kvalitetssikret. Før ekte brukere slipper inn må den som er
 * behandlingsansvarlig fylles inn (NEXT_PUBLIC_CONTROLLER_NAME), og teksten
 * bør leses av noen som kan personvern.
 *
 * Avsnittene «Hvorfor vi kan bruke opplysningene», «Klage» og det som står om
 * leverandørenes land, er et utkast fra 2026-11-27. Valget av
 * behandlingsgrunnlag er ikke vurdert av en jurist. Det som står om
 * leverandørene, må holdes ved like: bytter vi leverandør eller sted, skal
 * teksten endres samme dag.
 */
const controller = process.env.NEXT_PUBLIC_CONTROLLER_NAME || "";

/** Avsnittene om tekstforslag vises bare når tekstforslag er slått på. */
const suggestions = canSuggestDescription();

/** Avsnittene om LinkedIn vises bare når henting av profilbilde derfra er slått på. */
const linkedIn = canFetchFromLinkedIn();

export default function PrivacyPage() {
  return (
    <PublicShell memberNav>
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
            <li>
              Profilbildet ditt, hvis du legger inn et. Opptaksdata i bildet, som
              GPS-posisjon, fjernes før det lagres.
              {linkedIn &&
                " Henter du bildet fra LinkedIn, lagrer vi en kopi av bildet og ingenting annet fra LinkedIn-profilen din."}
            </li>
            <li>Tidspunktet du ga Hytteløftet.</li>
            <li>Hytter du legger inn: navn, sted, adresse, kartposisjon, beskrivelse, bilder, pris, regler, Vipps-nummer og praktiske opplysninger. Opptaksdata i bildene, som GPS-posisjon, fjernes før bildene lagres.</li>
            <li>Forespørsler du sender eller får, med datoer, antall personer, pris og meldinger.</li>
            <li>Hvem som har invitert hvem, hvilken hytte invitasjonen gjelder, og en hilsen hvis avsenderen skrev en.</li>
            <li>Innlogginger: tidspunkt, IP-adresse og nettlesertype.</li>
            <li>
              Ber du om invitasjon uten å være med: navnet og e-postadressen du skriver, om du
              har hytte, og det du skriver om hvem du kjenner her. Sier vi nei, sletter vi det
              etter 30 dager. Har du ikke hørt fra oss innen 14 dager, har vi ikke plass nå, og
              etter 90 dager sletter vi det du skrev.
              Inviterer vi deg, blir det stående sammen med invitasjonen. For å bremse misbruk
              av skjemaet lagrer vi IP-adressen din i inntil et døgn.
            </li>
            {suggestions && (
              <li>Tidspunktet du ba om et tekstforslag til en hytte. Selve forslaget lagrer vi ikke.</li>
            )}
          </ul>
          <p className="mt-2">Betaling skjer i Vipps, utenfor tjenesten. Vi lagrer ingen betalingsopplysninger.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold">Hvorfor vi kan bruke opplysningene</h2>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>
              Er du med i {APP_NAME}, bruker vi opplysningene dine for å gi deg tjenesten du
              har valgt å bruke: vise hytter, sende forespørsler og varsle deg. Grunnlaget er
              avtalen med deg (personvernforordningen artikkel 6 nr. 1 bokstav b).
            </li>
            <li>
              Ber du om invitasjon, bruker vi det du skriver, bare til å svare deg. Du har
              selv bedt oss om det (samme bestemmelse).
            </li>
            <li>
              Inviterer noen deg, lagrer vi e-postadressen din for å kunne sende invitasjonen.
              Innlogginger og IP-adresser lagrer vi for å holde tjenesten trygg og stoppe
              misbruk. Grunnlaget er vår berettigede interesse i å drive en lukket og trygg
              tjeneste (artikkel 6 nr. 1 bokstav f). Du kan protestere mot dette.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">Hvem ser hva</h2>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>En hytte er privat til eieren velger hvem som får se den. Bare eieren, de eieren har valgt, og administratorene ser hytta, bildene og navnet på eieren.</li>
            <li>Det å eie en hytte gir ikke innsyn i andres hytter.</li>
            <li>Administratorene ser alle hytter slik lånerne ser dem: bilder, beskrivelse, pris, regler, ledige datoer og området på kart. De ser også hvor mange som ser hver hytte, har spurt om å låne den og har lånt den. De ser ikke adresse, kartposisjon, Vipps-nummer eller praktiske opplysninger, og ikke hvem som har spurt eller lånt. De kan ikke spørre om å låne en hytte eieren ikke har vist dem.</li>
            <li>Du ser navnet på dem som viser deg en hytte, og dem du viser din. Ingen ser en liste over alle som er med.</li>
            <li>Bare administratorene ser hvem som har bedt om invitasjon, og hva de skrev. Vi sender ingen e-post til adressen før en administrator har valgt å invitere.</li>
            <li>Profilbildet ditt står ved navnet ditt, og bare der navnet vises fra før: hos dem du viser en hytte til, hos dem som viser deg sin, i forespørsler mellom eier og låner, og hos eieren som skal godkjenne deg. Administratorene kan se det. Andre medlemmer ser det ikke. Du kan fjerne bildet når du vil.</li>
            <li>Eieren ser navnet på dem som ser hytta, og adressen eieren selv skrev inn i invitasjonen.</li>
            <li>Åpnes en invitasjonslenke uten innlogging, vises navnet og profilbildet til den som inviterer, og en maskert e-postadresse. Gjelder invitasjonen en hytte, vises også bildene av hytta og området på kart. Det gjelder bare så lenge invitasjonen ikke er trukket tilbake eller utløpt.</li>
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
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>Nettdrift: Vercel. Tjenesten kjører fra Frankfurt.</li>
            <li>Database: Neon. Databasen ligger i Frankfurt.</li>
            <li>
              E-post: Resend. Navnet ditt, e-postadressen din og innholdet i e-postene vi
              sender deg, går gjennom Resend, som lagrer opplysninger i USA.
            </li>
          </ul>
          <p className="mt-2">
            Alle tre er amerikanske selskaper. Opplysninger kan derfor bli behandlet utenfor
            EØS. Overføringen bygger på EUs standardavtaler for overføring av
            personopplysninger, som inngår i databehandleravtalene med leverandørene.
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
          {linkedIn && (
            <p className="mt-2">
              Velger du å hente profilbildet ditt fra LinkedIn, sender vi deg til LinkedIn, der
              du selv godkjenner at {APP_NAME} får se navnet og profilbildet ditt. LinkedIn får
              da vite at du bruker {APP_NAME}. Vi henter bare bildet. Vi ber ikke om
              e-postadressen din, vi får ikke se kontakter, meldinger eller innlegg, og vi kan
              ikke publisere noe. Godkjenningen kan du trekke tilbake hos LinkedIn når du vil.
            </p>
          )}
          {suggestions && (
            <p className="mt-2">
              Ber du om et tekstforslag til beskrivelsen av hytta, sender vi bildene av hytta,
              stedsnavnet, en avrundet posisjon for området, antall sengeplasser og det du har
              skrevet i beskrivelsen, til en AI-tjeneste som skriver utkastet. Navnet ditt, navnet
              på hytta, adressen og den nøyaktige kartposisjonen sendes ikke. Vi ber om at
              opplysningene behandles i EU, og at AI-tjenesten sletter dem når forslaget er laget.
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

        <section>
          <h2 className="text-xl font-bold">Klage</h2>
          <p className="mt-2">
            Mener du at vi bruker opplysningene dine feil, vil vi gjerne høre det først, så
            retter vi det vi kan. Du kan også klage til Datatilsynet. Se{" "}
            <a href="https://www.datatilsynet.no" className="underline">
              datatilsynet.no
            </a>
            .
          </p>
        </section>
      </div>
    </PublicShell>
  );
}
