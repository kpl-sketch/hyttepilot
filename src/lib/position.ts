/*
 * Kartposisjon: tolking av det eieren skriver eller limer inn, og lenker til
 * kart. Filen brukes både i nettleseren og på serveren.
 */

export type Position = { latitude: number; longitude: number };

const NUMBER = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

/** Mønstre i lenker fra karttjenester, i den rekkefølgen de er mest presise. */
const LINK_PATTERNS = [
  // Google Maps: selve stedet i lenken, ikke bare midten av kartutsnittet.
  new RegExp(`!3d${NUMBER}!4d${NUMBER}`),
  new RegExp(`[?&](?:q|query|ll|sll|destination|daddr|center)=(?:loc:)?${NUMBER}(?:,|%2C)\\s*${NUMBER}`, "i"),
  new RegExp(`@${NUMBER},${NUMBER}`),
  // OpenStreetMap og norgeskart-lignende lenker: #map=15/61.23/10.45
  new RegExp(`#map=\\d+/${NUMBER}/${NUMBER}`),
];

/** To tall med punktum som desimaltegn: «61.2345, 10.4567». */
const PLAIN = new RegExp(`^${NUMBER}\\s*[,;\\s]\\s*${NUMBER}$`);

/** To tall med komma som desimaltegn, slik vi skriver på norsk: «61,2345 10,4567». */
const PLAIN_COMMA = /^(-?\d{1,3}),(\d+)\s*[;\s]\s*(-?\d{1,3}),(\d+)$/;

/** Grader, minutter og sekunder: 61°14'04.2"N 10°27'24.1"E. Ø og V er øst og vest. */
const DMS =
  /(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:"|″|'')?\s*([NSEWØV])/gi;

function valid(latitude: number, longitude: number): Position | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  // Seks desimaler er omtrent ti centimeter. Mer er bare støy.
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  return { latitude: round(latitude), longitude: round(longitude) };
}

/**
 * Finner en kartposisjon i teksten: to tall, grader med minutter og sekunder,
 * eller en lenke fra en karttjeneste. Gir null hvis teksten ikke har noen.
 */
export function parsePosition(text: string): Position | null {
  const input = text.trim();
  if (input === "") return null;

  const plain = PLAIN.exec(input);
  if (plain) return valid(Number(plain[1]), Number(plain[2]));

  const comma = PLAIN_COMMA.exec(input);
  if (comma) {
    return valid(Number(`${comma[1]}.${comma[2]}`), Number(`${comma[3]}.${comma[4]}`));
  }

  const parts = [...input.matchAll(DMS)];
  if (parts.length === 2) {
    const degrees = parts.map((part) => {
      const value =
        Number(part[1]) + Number(part[2]) / 60 + Number(part[3].replace(",", ".")) / 3600;
      const direction = part[4].toUpperCase();
      return {
        value: direction === "S" || direction === "W" || direction === "V" ? -value : value,
        isLatitude: direction === "N" || direction === "S",
      };
    });
    const latitude = degrees.find((degree) => degree.isLatitude);
    const longitude = degrees.find((degree) => !degree.isLatitude);
    if (latitude && longitude) return valid(latitude.value, longitude.value);
  }

  if (/^https?:\/\//i.test(input)) {
    let link = input;
    try {
      link = decodeURIComponent(input);
    } catch {
      // Lenken har ugyldige tegn. Da leter vi i den slik den står.
    }
    for (const pattern of LINK_PATTERNS) {
      const found = pattern.exec(link);
      if (found) return valid(Number(found[1]), Number(found[2]));
    }
  }
  return null;
}

/** Posisjonen som tekst, slik den vises i skjemaet: «61.2345, 10.4567». */
export function formatPosition(position: Position): string {
  return `${position.latitude}, ${position.longitude}`;
}

/** Det kartlenkene skal peke på: posisjonen hvis hytta har en, ellers adressen. */
function target(place: { address: string; latitude: number | null; longitude: number | null }) {
  if (place.latitude !== null && place.longitude !== null) {
    return `${place.latitude},${place.longitude}`;
  }
  return place.address.trim();
}

/**
 * Lenker som åpner veibeskrivelse til hytta i kartappen på telefonen, eller i
 * nettleseren på en datamaskin. Null hvis hytta verken har adresse eller posisjon.
 */
export function directionLinks(place: {
  address: string;
  latitude: number | null;
  longitude: number | null;
}): { google: string; apple: string } | null {
  const destination = target(place);
  if (destination === "") return null;
  const encoded = encodeURIComponent(destination);
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
    apple: `https://maps.apple.com/?daddr=${encoded}`,
  };
}

/** Lenke som viser stedet i kartet, slik at eieren kan sjekke at posisjonen stemmer. */
export function mapLink(position: Position): string {
  const point = `${position.latitude},${position.longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point)}`;
}
