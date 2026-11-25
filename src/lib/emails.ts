import { APP_NAME, appUrl, WHAT_IT_IS } from "./brand";
import { formatDate, formatRange, todayInOslo } from "./dates";
import type { Mail } from "./email";
import { formatKroner } from "./pricing";

const sign = `\n\nHilsen ${APP_NAME}`;

export function loginCodeMail(to: string, code: string): Mail {
  return {
    to,
    subject: `${code} er innloggingskoden din`,
    text: `Koden din er ${code}. Den gjelder i ti minutter.\n\nHar du ikke bedt om koden, kan du se bort fra denne e-posten.${sign}`,
  };
}

/** Fornavnet, til hilsener: «Thomas» av «Thomas Lund». */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function greeting(inviterName: string, message: string): string {
  return message ? `\n\nHilsen fra ${firstName(inviterName)}:\n«${message}»` : "";
}

/** Datoen invitasjonen gjelder til, slik den står i e-posten. */
function lastDay(expiresAt: Date): string {
  return formatDate(todayInOslo(expiresAt));
}

type ShareInfo = { cabinName: string; cabinArea: string; message: string };

/**
 * Personlig invitasjon til en som ikke er med ennå. Sier hvem som inviterer,
 * hvilken hytte som deles, og hva mottakeren får tilgang til.
 */
export function cabinInvitationMail(
  to: string,
  inviterName: string,
  info: ShareInfo & { token: string; expiresAt: Date },
): Mail {
  const first = firstName(inviterName);
  return {
    to,
    subject: `${inviterName} inviterer deg til ${APP_NAME}`,
    text: `${inviterName} inviterer deg til ${APP_NAME} og vil vise deg hytta ${info.cabinName} (${info.cabinArea}).${greeting(inviterName, info.message)}\n\nI ${APP_NAME} ${WHAT_IT_IS}.\n\nDette får du tilgang til:\n- Du ser hytta, bildene, prisen og når den er ledig.\n- Du kan sende ${first} en forespørsel om å låne den.\n\n${first} bestemmer når hytta er ledig, og svarer ja eller nei på hver forespørsel. Invitasjonen gjelder bare denne hytta.\n\nSe hytta:\n${appUrl()}/invitasjon/${info.token}\n\nInvitasjonen er personlig. Den gjelder for ${to} til ${lastDay(info.expiresAt)}. Lenken viser bilder og området, men bare du kan låne hytta med den.${sign}`,
  };
}

/** Varsel til en som allerede er med: eieren har delt en hytte med deg. */
export function cabinSharedMail(
  to: string,
  inviterName: string,
  info: ShareInfo & { link: string },
): Mail {
  const first = firstName(inviterName);
  return {
    to,
    subject: `${inviterName} viser deg ${info.cabinName}`,
    text: `${inviterName} viser deg hytta ${info.cabinName} (${info.cabinArea}) i ${APP_NAME}.${greeting(inviterName, info.message)}\n\nDu ser nå hytta, bildene, prisen og når den er ledig, og du kan sende ${first} en forespørsel om å låne den. ${first} svarer ja eller nei på hver forespørsel.\n\nSe hytta:\n${info.link}${sign}`,
  };
}

/**
 * Til eieren: noen har åpnet en invitasjon og logget inn med en annen adresse
 * enn den invitasjonen ble sendt til. Personen ser ingenting før eieren godkjenner.
 */
export function accessRequestMail(
  to: string,
  info: {
    requesterName: string;
    requesterEmail: string;
    invitedEmail: string;
    cabinName: string;
    link: string;
  },
): Mail {
  return {
    to,
    subject: `${info.requesterName} vil se ${info.cabinName}`,
    text: `${info.requesterName} (${info.requesterEmail}) åpnet invitasjonen du sendte til ${info.invitedEmail}, og logget inn med en annen adresse.\n\n${firstName(info.requesterName)} ser ikke ${info.cabinName} før du godkjenner. Kjenner du ikke personen, eller er du usikker, kan du si nei.\n\nGodkjenn eller si nei her:\n${info.link}${sign}`,
  };
}

/**
 * Invitasjon fra en administrator: slipper mottakeren inn i tjenesten, uten
 * tilgang til noen hytter.
 */
export function accountInvitationMail(
  to: string,
  inviterName: string,
  info: { message: string; token: string; expiresAt: Date },
): Mail {
  return {
    to,
    subject: `${inviterName} inviterer deg til ${APP_NAME}`,
    text: `${inviterName} inviterer deg til ${APP_NAME}. Her ${WHAT_IT_IS}.${greeting(inviterName, info.message)}\n\nDu kan legge inn hytta di og velge hvem som får se den. Du bestemmer når den er ledig, og svarer ja eller nei på hver forespørsel.\n\nInvitasjonen gir ikke tilgang til andres hytter. Dem ser du når en eier velger å vise deg hytta si.\n\nSe invitasjonen:\n${appUrl()}/invitasjon/${info.token}\n\nInvitasjonen er personlig. Den gjelder for ${to} til ${lastDay(info.expiresAt)}.${sign}`,
  };
}

type BookingInfo = {
  cabinName: string;
  startDate: string;
  endDate: string;
  totalPrice: number;
};

export function newRequestMail(
  to: string,
  borrowerName: string,
  b: BookingInfo & { guests: number; message: string },
): Mail {
  const message = b.message ? `\n\nMelding fra ${borrowerName}:\n${b.message}` : "";
  return {
    to,
    subject: `${borrowerName} vil låne ${b.cabinName}`,
    text: `${borrowerName} ber om å låne ${b.cabinName} ${formatRange(b.startDate, b.endDate)}, for ${b.guests} ${b.guests === 1 ? "person" : "personer"}. Prisen blir ${formatKroner(b.totalPrice)}.${message}\n\nSvar ja eller nei her:\n${appUrl()}/foresporsler${sign}`,
  };
}

export function approvedMail(
  to: string,
  ownerName: string,
  b: BookingInfo & { vippsNumber: string; ownerReply: string },
): Mail {
  const reply = b.ownerReply ? `\n\nMelding fra ${ownerName}:\n${b.ownerReply}` : "";
  return {
    to,
    subject: `Ja! Du får låne ${b.cabinName}`,
    text: `${ownerName} har sagt ja til at du låner ${b.cabinName} ${formatRange(b.startDate, b.endDate)}.\n\nVipps ${formatKroner(b.totalPrice)} til ${b.vippsNumber}. Når ${ownerName} har markert at betalingen er mottatt, er oppholdet reservert.${reply}\n\nSe forespørselen:\n${appUrl()}/foresporsler${sign}`,
  };
}

export function declinedMail(
  to: string,
  ownerName: string,
  b: BookingInfo & { ownerReply: string },
): Mail {
  const reply = b.ownerReply ? `\n\nMelding fra ${ownerName}:\n${b.ownerReply}` : "";
  return {
    to,
    subject: `${b.cabinName} passer ikke denne gangen`,
    text: `${ownerName} kan dessverre ikke låne ut ${b.cabinName} ${formatRange(b.startDate, b.endDate)}.${reply}\n\nDu kan se andre ledige perioder her:\n${appUrl()}/krets${sign}`,
  };
}

export function paidMail(to: string, ownerName: string, b: BookingInfo): Mail {
  return {
    to,
    subject: `${b.cabinName} er reservert`,
    text: `${ownerName} har mottatt betalingen. ${b.cabinName} er reservert for deg ${formatRange(b.startDate, b.endDate)}.\n\nAdresse og praktiske opplysninger finner du her:\n${appUrl()}/foresporsler\n\nGod tur!${sign}`,
  };
}

export function cancelledMail(
  to: string,
  cancelledByName: string,
  b: BookingInfo,
): Mail {
  return {
    to,
    subject: `Lånet av ${b.cabinName} er avlyst`,
    text: `${cancelledByName} har avlyst lånet av ${b.cabinName} ${formatRange(b.startDate, b.endDate)}.\n\nSe oversikten:\n${appUrl()}/foresporsler${sign}`,
  };
}

/**
 * Til eieren: hytta er åpen for lån de neste ukene, men ingen har spurt.
 * Sendes høyst én gang i måneden per hytte (se services/reminders.ts).
 */
export function idleCabinMail(
  to: string,
  ownerName: string,
  info: {
    cabinId: string;
    cabinName: string;
    holidayName: string;
    startDate: string;
    endDate: string;
  },
): Mail {
  return {
    to,
    subject: `${info.cabinName} er ledig i ${info.holidayName}`,
    text: `Hei ${firstName(ownerName)}!\n\nSnart er det ${info.holidayName}. ${info.cabinName} er åpen for lån ${formatRange(info.startDate, info.endDate)}, men ingen har spurt ennå.\n\nKjenner du noen som ville likt en tur? Skriv adressene deres her, så får de se hytta og kan spørre om å låne den:\n${appUrl()}/mine-hytter/${info.cabinId}/inviter\n\nDu får bare en slik påminnelse før de store feriene, når hytta står ledig. Vil du ikke ha dem, slår du dem av på siden for hytta:\n${appUrl()}/mine-hytter/${info.cabinId}#paminnelser${sign}`,
  };
}

/**
 * Til administratorene: det har kommet e-post til den felles innboksen.
 * Nevner avsender og emne, aldri innholdet (se services/inbox-notices.ts).
 * Avsender og emne er renset før de kommer hit.
 */
export function inboxNoticeMail(
  to: string,
  info: {
    inbox: string;
    listed: { from: string; subject: string }[];
    /** E-poster det ikke er varslet om før. */
    fresh: number;
    /** Alle uleste e-poster i innboksen, også de det er varslet om. */
    unread: number;
  },
): Mail {
  const one = info.fresh === 1;
  const lines = info.listed.map((m) => `- ${m.from}${m.subject ? `: «${m.subject}»` : ""}`);
  const more = info.fresh - info.listed.length;
  if (more > 0) lines.push(`- og ${more} til`);
  const waiting =
    info.unread > info.fresh
      ? `\n\nI alt ligger det ${info.unread} uleste e-poster i innboksen.`
      : "";
  return {
    to,
    subject: one ? `Ny e-post til ${info.inbox}` : `${info.fresh} nye e-poster til ${info.inbox}`,
    text: `Det har kommet ${one ? "en ny e-post" : `${info.fresh} nye e-poster`} til ${info.inbox}.\n\n${lines.join("\n")}${waiting}\n\nLes og svar i innboksen:\n${appUrl()}/admin/innboks\n\nDu får denne e-posten fordi du er administrator i ${APP_NAME}. Svar i innboksen, ikke på denne e-posten.${sign}`,
  };
}
