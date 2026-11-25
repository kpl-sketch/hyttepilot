import { APP_NAME } from "./brand";

/** Endres teksten, økes versjonen, slik at vi vet hvilket løfte hver bruker ga. */
export const PLEDGE_VERSION = "2026-11-25";

export const PLEDGE_INTRO = `Når jeg låner en hytte gjennom ${APP_NAME}, låner jeg noe som er privat og kjært for noen jeg kjenner. Derfor lover jeg:`;

export const PLEDGE_POINTS: { title: string; body: string }[] = [
  {
    title: "Jeg behandler hytta som min egen.",
    body: "Jeg er like forsiktig med huset, møblene og utstyret som jeg ville vært hjemme hos meg selv.",
  },
  {
    title: "Jeg sier fra med en gang hvis noe går galt.",
    body: "Går noe i stykker, melder jeg fra til eieren samme dag og gjør opp for det.",
  },
  {
    title: "Jeg forlater hytta slik jeg fant den.",
    // Eieren kan ta betalt for vask (cleaningFee). Da skal ikke løftet også kreve
    // at låneren vasker. Endret 2026-11-25 etter tilbakemelding fra en låner.
    body: "Ryddet, søppel tatt med, vann og strøm slik eieren har bedt om, og vasket når eieren ikke tar betalt for vask.",
  },
  {
    title: "Jeg følger eierens regler.",
    body: "Antall gjester, dyr, røyking, fest og aldersgrense er eierens valg, ikke mitt.",
  },
  {
    title: "Jeg tar bare med folk jeg selv går god for.",
    body: "Inviterer jeg noen, er det jeg som har ansvaret for dem.",
  },
  {
    title: "Jeg respekterer naboene.",
    body: "Ro om kvelden og hilsen om dagen.",
  },
  {
    title: "Jeg betaler det vi ble enige om, når vi ble enige om det.",
    body: "",
  },
];

export const PLEDGE_OUTRO = `Dette er ikke et juridisk dokument. Det er et løfte mellom folk som stoler på hverandre, og tilliten er det som gjør ${APP_NAME} mulig.`;

/** Løftet i én setning, for velkomstsiden. Hele teksten ligger bak «Les hele løftet». */
export const PLEDGE_SHORT =
  "Kort sagt: Du behandler hytta som din egen, følger eierens regler, sier fra hvis noe går galt og betaler det dere blir enige om.";

export const PLEDGE_CONFIRM = "Jeg lover å holde Hytteløftet.";
