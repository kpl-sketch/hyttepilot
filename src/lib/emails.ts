import { APP_NAME, appUrl } from "./brand";
import { formatRange } from "./dates";
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

export function ownerInvitationMail(to: string, inviterName: string): Mail {
  return {
    to,
    subject: `${inviterName} inviterer deg til ${APP_NAME}`,
    text: `${inviterName} har invitert deg til ${APP_NAME}, en lukket krets der hytteeiere låner ut hytta til folk de kjenner, til omtrent selvkost.\n\nSom hytteeier kan du legge inn hytta di, bestemme hvem som får se den, og svare ja eller nei på hver forespørsel.\n\nLogg inn med denne e-postadressen:\n${appUrl()}/logg-inn?e=${encodeURIComponent(to)}${sign}`,
  };
}

export function friendInvitationMail(
  to: string,
  inviterName: string,
  cabinName: string,
): Mail {
  return {
    to,
    subject: `${inviterName} vil låne deg hytta`,
    text: `${inviterName} har gitt deg tilgang til ${cabinName} i ${APP_NAME}. Du kan se når hytta er ledig og sende en forespørsel om å låne den.\n\nLogg inn med denne e-postadressen:\n${appUrl()}/logg-inn?e=${encodeURIComponent(to)}${sign}`,
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
    text: `${ownerName} kan dessverre ikke låne ut ${b.cabinName} ${formatRange(b.startDate, b.endDate)}.${reply}\n\nDu kan se andre ledige perioder her:\n${appUrl()}/hytter${sign}`,
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
