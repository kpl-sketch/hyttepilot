"use client";

import { type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import {
  formatPosition,
  isShortMapLink,
  mapLink,
  parsePosition,
  type Position,
} from "@/lib/position";
import { LocationMap, type MapFocus } from "./location-map";
import { inputClass } from "./ui";

type Suggestion = {
  kind: "adresse" | "sted";
  label: string;
  detail: string;
  area: string;
  address: string;
  latitude: number;
  longitude: number;
  abroad?: true;
};

/**
 * Gjetter området fra en adresse eieren skrev selv: delen etter første komma,
 * uten postnummer og land. «Krokviksvägen 17, 439 54 Åsa, Sverige» gir «Åsa».
 * Gatenavnet blir aldri området. Gir tom tekst hvis det ikke går.
 */
function guessArea(text: string): string {
  const parts = text.split(",").slice(1);
  for (const part of parts) {
    const name = part.replace(/[\d]+/g, "").replace(/\s+/g, " ").trim();
    if (name.length >= 2 && !ABROAD_ADDRESS.test(`, ${name}`) && !/^(norge|norway)$/i.test(name)) {
      return name.slice(0, 80);
    }
  }
  return "";
}

/** En adresse som slutter på et annet land, for eksempel «…, Sverige». */
const ABROAD_ADDRESS = /,\s*(Sverige|Danmark|Finland|Tyskland|Spania|Frankrike|Italia|Sweden|Denmark)\s*$/i;

/** Hvor nært kartet viser en adresse og et sted. */
const ZOOM = { adresse: 16, sted: 13, her: 16 } as const;

/**
 * «Hvor ligger hytta?»: ett felt for både sted og adresse, et kart der eieren
 * drar nålen til hytta, og andre måter bak én lenke.
 *
 * Skjemaet får tre felt herfra:
 * - `area`: området alle som ser hytta, får se. For eksempel «Hafjell».
 * - `address`: adressen låneren får når lånet er betalt. Kan være tom.
 * - `position`: nålen i kartet som «61.2345, 10.4567». Kan være tom.
 *
 * Skriver eieren uten å velge et forslag, blir teksten området. Har teksten
 * tall, er den nok en adresse. Da blir den adressen, og eieren må skrive
 * området selv, slik at adressen ikke vises til alle.
 */
export function LocationFields({
  defaultArea = "",
  defaultAddress = "",
  defaultPosition = "",
}: {
  defaultArea?: string;
  defaultAddress?: string;
  defaultPosition?: string;
}) {
  const [query, setQuery] = useState(defaultAddress || defaultArea);
  const [area, setArea] = useState(defaultArea);
  const [address, setAddress] = useState(defaultAddress);
  const [position, setPosition] = useState(defaultPosition);
  const [focus, setFocus] = useState<MapFocus | null>(() => {
    const found = parsePosition(defaultPosition);
    return found ? { ...found, zoom: ZOOM.adresse } : null;
  });
  const [editingArea, setEditingArea] = useState(false);
  const [abroad, setAbroad] = useState(ABROAD_ADDRESS.test(defaultAddress));
  // Sant når området bare er det eieren holder på å skrive i søkefeltet.
  const areaFromTyping = useRef(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [notice, setNotice] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [pasted, setPasted] = useState("");
  const [resolving, setResolving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);
  const linkRequest = useRef<AbortController | null>(null);
  const queryId = useId();
  const hintId = useId();
  const listId = useId();
  const areaId = useId();
  const pasteId = useId();

  function stopSearch() {
    if (timer.current) clearTimeout(timer.current);
    request.current?.abort();
  }
  useEffect(() => stopSearch, []);
  useEffect(() => () => linkRequest.current?.abort(), []);

  // Skrev eieren før siden var ferdig lastet, står teksten i feltet uten at
  // skjemaet vet om den. Da tar vi den med nå.
  const queryInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const typed = queryInput.current?.value ?? "";
    if (typed !== (defaultAddress || defaultArea)) onQueryChange(typed);
    // Skal bare skje én gang, når siden er lastet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Setter nålen et nytt sted og flytter kartet dit. */
  function place(found: Position, zoom: number) {
    setPosition(formatPosition(found));
    setFocus({ ...found, zoom });
  }

  /** Eieren har dratt nålen eller trykket i kartet. */
  const onMove = useCallback((found: Position) => {
    const exact = parsePosition(`${found.latitude}, ${found.longitude}`);
    if (exact) setPosition(formatPosition(exact));
  }, []);

  function onQueryChange(value: string) {
    setQuery(value);
    setNotice(null);
    const text = value.trim();
    if (/\d/.test(text)) {
      // Ser ut som en adresse. Den skal ikke bli det alle ser.
      setAddress(text.slice(0, 200));
      setAbroad(ABROAD_ADDRESS.test(text));
      // Området gjettes bare når det ikke er valgt eller skrevet fra før.
      if (areaFromTyping.current || area === "") {
        const guess = guessArea(text);
        setArea(guess);
        areaFromTyping.current = guess !== "";
      }
    } else {
      setArea(text.slice(0, 80));
      setAddress("");
      setAbroad(false);
      areaFromTyping.current = true;
    }
    setEditingArea(false);

    stopSearch();
    if (text.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    // Venter litt, slik at vi søker når eieren stopper å skrive og ikke for hver bokstav.
    timer.current = setTimeout(async () => {
      const controller = new AbortController();
      request.current = controller;
      try {
        const response = await fetch("/adressesok", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: value }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { results?: Suggestion[] };
        setSuggestions(data.results ?? []);
        setActive(-1);
        setOpen((data.results ?? []).length > 0);
      } catch {
        // Uten forslag skriver eieren selv.
      }
    }, 250);
  }

  function choose(suggestion: Suggestion) {
    stopSearch();
    setQuery(suggestion.label);
    setArea(suggestion.area);
    areaFromTyping.current = false;
    setAddress(suggestion.address);
    setAbroad(suggestion.abroad === true);
    setEditingArea(suggestion.area === "");
    place(suggestion, ZOOM[suggestion.kind]);
    setOpen(false);
    setNotice(null);
  }

  function onQueryKey(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === "Enter") {
      // Enter skal velge et forslag eller lukke listen, ikke sende hele skjemaet.
      event.preventDefault();
      if (active >= 0) choose(suggestions[active]);
      else setOpen(false);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  function locate() {
    if (!("geolocation" in navigator)) {
      setNotice("Nettleseren deler ikke posisjonen din. Søk etter stedet i stedet.");
      return;
    }
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      (found) => {
        const here = parsePosition(`${found.coords.latitude}, ${found.coords.longitude}`);
        if (here) place(here, ZOOM.her);
        setLocating(false);
      },
      () => {
        setNotice(
          "Vi fikk ikke tak i posisjonen din. Sjekk at nettleseren har lov til å bruke posisjon.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  /**
   * Lenke fra Google Maps eller koordinater. En kort delingslenke har ingen
   * koordinater i seg, så serveren følger den og gir oss posisjonen.
   */
  async function onPaste(value: string) {
    setPasted(value);
    setNotice(null);
    linkRequest.current?.abort();
    setResolving(false);
    const found = parsePosition(value);
    if (found) {
      place(found, ZOOM.adresse);
      return;
    }
    if (!isShortMapLink(value)) return;
    // Lagres lenken før vi har lest den, følger serveren den ved lagring.
    setPosition(value.trim());
    const controller = new AbortController();
    linkRequest.current = controller;
    setResolving(true);
    try {
      const response = await fetch("/kartlenke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value.trim() }),
        signal: controller.signal,
      });
      const data = response.ok
        ? ((await response.json()) as { position?: Position | null })
        : null;
      if (data?.position) place(data.position, ZOOM.adresse);
      else
        setNotice(
          "Vi fikk ikke lest posisjonen fra lenken. Åpne den i Google Maps, trykk lenge på hytta og kopier tallene som kommer opp.",
        );
    } catch {
      if (!controller.signal.aborted) setNotice("Vi fikk ikke lest posisjonen fra lenken.");
    } finally {
      if (linkRequest.current === controller) setResolving(false);
    }
  }

  function removePin() {
    setPosition("");
    setFocus(null);
    setPasted("");
  }

  const pin = parsePosition(position);
  const pastedUnreadable =
    pasted.trim() !== "" && !parsePosition(pasted) && !isShortMapLink(pasted);
  const askArea = editingArea || (area === "" && address !== "");

  return (
    <div className="grid gap-3">
      <div className="relative">
        <label htmlFor={queryId} className="block font-semibold">
          Hvor ligger hytta?
        </label>
        <span id={hintId} className="block text-sm text-muted">
          Skriv stedet eller adressen, og velg fra listen.
        </span>
        <input
          ref={queryInput}
          id={queryId}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onQueryKey}
          onBlur={() => setOpen(false)}
          maxLength={200}
          autoComplete="off"
          placeholder="For eksempel Hafjell eller Fjellvegen 12"
          required={area === "" && address === ""}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-describedby={hintId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          className={inputClass}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="Forslag"
          hidden={!open}
          className="absolute z-[1100] mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.label}|${suggestion.detail}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // mousedown, slik at valget skjer før feltet mister fokus og listen lukkes.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(suggestion);
              }}
              onMouseEnter={() => setActive(index)}
              className={`cursor-pointer px-4 py-2.5 ${index === active ? "bg-paper" : ""}`}
            >
              <span className="block font-medium">{suggestion.label}</span>
              <span className="block text-sm text-muted">{suggestion.detail}</span>
            </li>
          ))}
        </ul>
      </div>

      {askArea ? (
        <div>
          <label htmlFor={areaId} className="block font-semibold">
            Området andre ser
          </label>
          <span className="block text-sm text-muted">
            For eksempel Hafjell eller Kragerø. Adressen ser låneren først når lånet er betalt.
          </span>
          <input
            id={areaId}
            name="area"
            value={area}
            onChange={(event) => {
              areaFromTyping.current = false;
              setArea(event.target.value);
            }}
            required
            maxLength={80}
            className={`${inputClass} sm:max-w-sm`}
          />
        </div>
      ) : (
        <>
          <input type="hidden" name="area" value={area} />
          {area !== "" && (
            <p className="text-sm text-muted">
              Andre ser bare «{area}». Nøyaktig hvor hytta ligger, ser låneren først når lånet
              er betalt.{" "}
              <button
                type="button"
                onClick={() => setEditingArea(true)}
                className="cursor-pointer text-pine underline"
              >
                Endre
              </button>
            </p>
          )}
        </>
      )}

      {pin && focus && (
        <div>
          <p className="font-medium">Dra nålen til hytta, eller trykk der den ligger.</p>
          <LocationMap focus={focus} onMove={onMove} abroad={abroad} />
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <a href={mapLink(pin)} target="_blank" rel="noopener noreferrer" className="text-pine underline">
              Åpne i Google Maps
            </a>
            <button type="button" onClick={removePin} className="cursor-pointer text-pine underline">
              Fjern nålen
            </button>
          </div>
        </div>
      )}

      <details className="group">
        <summary className="cursor-pointer text-pine underline">Andre måter å finne hytta på</summary>
        <div className="mt-3 grid gap-4 rounded-xl border border-line bg-paper p-4">
          <div>
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="cursor-pointer font-medium text-pine underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {locating ? "Finner posisjonen …" : "Jeg er på hytta: bruk posisjonen min"}
            </button>
          </div>
          <div>
            <label htmlFor={pasteId} className="block font-medium">
              Lenke fra Google Maps eller koordinater
            </label>
            <span className="block text-sm text-muted">
              I Google Maps: trykk på hytta, velg «Del» og lim inn lenken her.
            </span>
            <input
              id={pasteId}
              value={pasted}
              onChange={(event) => void onPaste(event.target.value)}
              maxLength={1000}
              autoComplete="off"
              placeholder="61.2345, 10.4567"
              aria-busy={resolving}
              className={inputClass}
            />
            {resolving && <p role="status" className="mt-1 text-sm">Henter posisjonen fra lenken …</p>}
            {pastedUnreadable && (
              <p className="mt-1 text-sm text-barn">Vi finner ingen posisjon i dette ennå.</p>
            )}
          </div>
        </div>
      </details>

      {notice && (
        <p role="alert" className="max-w-[60ch] font-medium text-barn">
          {notice}
        </p>
      )}

      <input type="hidden" name="address" value={address} />
      <input type="hidden" name="position" value={position} />
    </div>
  );
}
