import type { Audience } from "@/components/audience-page";
import { WHAT_IT_IS } from "./brand";

/**
 * Ti måter å forklare tjenesten på, én per målgruppe. Sidene ligger på /v1 til
 * /v10 og lenkes ikke fra forsiden. Tekstene følger reglene i AGENTS.md: ingen
 * «dele», å låne bort tilbake er et valg, og ingen løfter om mange hytter.
 */
export const AUDIENCES: Record<string, { name: string; audience: Audience }> = {
  v1: {
    name: "Hytteeieren",
    audience: {
      forWhom: "For deg som har hytte",
      title: "Hytta di står tom. Noen du kjenner hadde elsket den.",
      lead: (
        <>
          Her {WHAT_IT_IS}. Du bestemmer hvem som får se hytta, hvilke datoer som er åpne, og
          hva et opphold koster.
        </>
      ),
      stepsTitle: "Slik låner du bort hytta",
      steps: [
        "Du legger inn hytta og velger hvem som får se den. Ingen andre ser den.",
        "Du åpner datoene som passer deg. De du har valgt, spør om å låne, og du svarer ja eller nei.",
        "De betaler et bidrag til strøm og faste kostnader med Vipps. Du setter prisen.",
      ],
      extra: {
        title: "Og kanskje får du låne selv",
        body: "Låner du bort hytta di til noen som også har hytte, kan de velge å låne bort sin til deg.",
      },
    },
  },
  v2: {
    name: "Den uten hytte",
    audience: {
      forWhom: "For deg som ikke har hytte",
      title: "Du trenger ingen hytte for å komme deg på hytta.",
      lead: (
        <>
          Her {WHAT_IT_IS}. Også den som ikke eier en selv, kan bli invitert av noen som har
          hytte, og spørre om å låne.
        </>
      ),
      stepsTitle: "Slik låner du en hytte",
      steps: [
        "En du kjenner viser deg hytta si. Du ser bilder, pris og hvilke datoer som er ledige.",
        "Du velger datoer og spør om å låne. Eieren svarer ja eller nei.",
        "Får du ja, betaler du et bidrag til strøm og faste kostnader med Vipps.",
      ],
      extra: {
        title: "Ingen pinlige spørsmål",
        body: "Du slipper å spørre på måfå om hytta er ledig. Eieren har allerede åpnet datoene og valgt å vise deg hytta.",
      },
    },
  },
  v3: {
    name: "Foreldre i samme klasse",
    audience: {
      forWhom: "For foreldre i samme klasse",
      title: "Fra foreldremøtet til hytteturen.",
      lead: (
        <>
          Dere kjenner hverandre nok til å stole på hverandre, men sjelden godt nok til å spørre
          om å låne hytta. Her {WHAT_IT_IS}.
        </>
      ),
      stepsTitle: "Slik virker det for en klasse",
      steps: [
        "Har du hytte, velger du selv hvilke av foreldrene som får se den.",
        "Ledige datoer står i kalenderen, så ingen trenger å spørre høyt i foreldregruppa.",
        "Den som låner, betaler et bidrag til strøm og faste kostnader med Vipps. Eieren setter prisen.",
      ],
      extra: {
        title: "Har dere ikke hytte?",
        body: "Da kan dere spørre om å låne av dem som viser dere hytta si. Barna får et nytt sted å dra, og dere blir bedre kjent med familiene rundt dem.",
      },
    },
  },
  v4: {
    name: "Vennegjengen",
    audience: {
      forWhom: "For vennegjengen som allerede låner av hverandre",
      title: "Slutt på «er hytta ledig i påsken?» i gruppechatten.",
      lead: (
        <>
          Dere låner allerede hytter av hverandre. Her {WHAT_IT_IS}, med ledige datoer, svar og
          pris samlet ett sted.
        </>
      ),
      stepsTitle: "Slik får dere orden på det",
      steps: [
        "Den som har hytte, åpner datoene. Alle som har fått se hytta, ser hva som er ledig.",
        "Du spør om å låne på datoene du vil ha. Eieren svarer ja eller nei, uten at noen må mase.",
        "Bidraget til strøm og faste kostnader betales med Vipps. Da blir pengepraten enkel.",
      ],
      extra: {
        title: "Fortsatt bare dere",
        body: "Den som har fått se en hytte, kan ikke vise den videre. Kretsen blir ikke større enn eieren selv velger.",
      },
    },
  },
  v5: {
    name: "Familiehytta",
    audience: {
      forWhom: "For deg som har hytte i familien",
      title: "Når søskenbarn og svigerfamilie spør om å låne hytta.",
      lead: (
        <>
          Familiehytta er lett å låne bort, men vanskelig å holde oversikt over. Her{" "}
          {WHAT_IT_IS}.
        </>
      ),
      stepsTitle: "Slik får du oversikt",
      steps: [
        "Du velger hvem i familien som får se hytta.",
        "Ledige datoer står i kalenderen, så du slipper å huske hvem som spurte først.",
        "Den som låner, betaler et bidrag til strøm og faste kostnader med Vipps. Du setter prisen.",
      ],
      extra: {
        title: "Rettferdig, uten pengepraten",
        body: "Prisen står der før noen spør. Da vet alle hva et opphold koster, og ingen må ta den samtalen over middagsbordet.",
      },
    },
  },
  v6: {
    name: "Den som bruker hytta mindre",
    audience: {
      forWhom: "For deg som bruker hytta mindre enn før",
      title: "Hytta trenger folk. Du trenger ikke flere bekymringer.",
      lead: (
        <>
          Står hytta mer tom enn før, kan den bli brukt av folk du kjenner, uten at du gir fra
          deg styringen. Her {WHAT_IT_IS}.
        </>
      ),
      stepsTitle: "Slik beholder du kontrollen",
      steps: [
        "Du låner bare bort til folk du selv har valgt.",
        "Du åpner bare datoene som passer deg, og stenger dem når du vil dit selv.",
        "Alle som låner, har lovet å behandle hytta som sin egen og si fra samme dag hvis noe går i stykker.",
      ],
      extra: {
        title: "Enkelt å komme i gang",
        body: "Du logger inn med e-postadressen din og en kode du får tilsendt. Det er ingen passord å huske.",
      },
    },
  },
  v7: {
    name: "Den forsiktige eieren",
    audience: {
      forWhom: "For deg som aldri ville leid ut hytta",
      title: "Ikke utleie. Ikke fremmede. Bare folk du kjenner.",
      lead: (
        <>
          Mange vil aldri slippe fremmede inn på hytta. Det trenger du ikke. Her{" "}
          {WHAT_IT_IS}.
        </>
      ),
      stepsTitle: "Slik er du trygg",
      steps: [
        "Hytta er privat til du selv viser den til noen. Venner av vennene dine ser den ikke.",
        "Ingen kan låne uten at du har sagt ja. Du svarer hver gang.",
        "Adressen får den som låner, først når oppholdet er betalt.",
      ],
      extra: {
        title: "Hvis noe går galt",
        body: "Alle som låner, har lovet å si fra samme dag og gjøre opp for seg. Det er et løfte mellom folk som kjenner hverandre, og det erstatter ikke forsikringen din.",
      },
    },
  },
  v8: {
    name: "Eieren som drømmer om en annen hytte",
    audience: {
      forWhom: "For deg som har hytte, og drømmer om en annen",
      title: "Fjellhytte om vinteren. Sjøhytte om sommeren.",
      lead: (
        <>
          Har du hytte på fjellet, kjenner du kanskje noen med hytte ved sjøen. Her{" "}
          {WHAT_IT_IS}. Låner du bort din, kan de velge å låne bort sin til deg.
        </>
      ),
      stepsTitle: "Slik kan det bli to hytter",
      steps: [
        "Du viser hytta di til andre hytteeiere du kjenner.",
        "Etterpå får de spørsmål om de vil vise deg sin. Det er deres valg.",
        "Hvert opphold avtales for seg, med ja eller nei fra den som eier hytta.",
      ],
      extra: {
        title: "Ingen bytteavtale",
        body: "Ingen skylder noen et opphold. Dere låner av hverandre når det passer, akkurat som venner ellers gjør.",
      },
    },
  },
  v9: {
    name: "Unge voksne",
    audience: {
      forWhom: "For dere som vil på tur, men ikke eier noe å dra til",
      title: "Helg på hytta, uten å eie en.",
      lead: (
        <>
          Mange kjenner noen med hytte: venner, foreldrene til venner eller kolleger. Her{" "}
          {WHAT_IT_IS}.
        </>
      ),
      stepsTitle: "Slik kommer du deg på hytta",
      steps: [
        "Noen du kjenner viser deg hytta si, og du ser hvilke datoer som er ledige.",
        "Du spør om å låne. Eieren svarer ja eller nei.",
        "Du betaler et bidrag til strøm og faste kostnader med Vipps. Prisen setter eieren.",
      ],
      extra: {
        title: "Ærlig talt",
        body: "Hvor mange hytter du ser, avhenger av hvem du kjenner og hvem som velger å vise deg sin.",
      },
    },
  },
  v10: {
    name: "Den som er invitert",
    audience: {
      forWhom: "For deg som har fått en invitasjon",
      title: "Du er invitert. Det betyr at noen stoler på deg.",
      lead: <>Her {WHAT_IT_IS}. Nå kan du se det de har valgt å vise deg.</>,
      stepsTitle: "Dette skjer nå",
      steps: [
        "Du logger inn med adressen invitasjonen ble sendt til.",
        "Du lover å behandle hytta som din egen, og ser hytta og hvilke datoer som er ledige.",
        "Vil du låne, velger du datoer og spør. Eieren svarer ja eller nei.",
      ],
      extra: {
        title: "Har du hytte selv?",
        body: "Da kan du legge den inn og velge hvem som får se den. Du kan også velge å la den som inviterte deg, låne din.",
      },
      invited: true,
    },
  },
};
