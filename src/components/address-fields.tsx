"use client";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { formatPosition, mapLink, parsePosition } from "@/lib/position";
import { inputClass } from "./ui";

type Suggestion = { label: string; latitude: number; longitude: number };

/**
 * Adressen og kartposisjonen til hytta. Mens eieren skriver adressen, kommer
 * det forslag fra det offisielle adresseregisteret. Velger eieren et forslag,
 * fylles kartposisjonen inn. Hytter uten adresse kan få posisjonen fra
 * telefonen eller fra koordinater eieren limer inn.
 */
export function AddressFields({
  defaultAddress = "",
  defaultPosition = "",
}: {
  defaultAddress?: string;
  defaultPosition?: string;
}) {
  const [address, setAddress] = useState(defaultAddress);
  const [position, setPosition] = useState(defaultPosition);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);
  const addressId = useId();
  const positionId = useId();
  const listId = useId();

  function stopSearch() {
    if (timer.current) clearTimeout(timer.current);
    request.current?.abort();
  }
  useEffect(() => stopSearch, []);

  function onAddressChange(value: string) {
    setAddress(value);
    stopSearch();
    if (value.trim().length < 3) {
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
        // Uten forslag skriver eieren adressen selv.
      }
    }, 250);
  }

  function choose(suggestion: Suggestion) {
    stopSearch();
    setAddress(suggestion.label);
    setPosition(formatPosition(suggestion));
    setOpen(false);
    setNotice(null);
  }

  function onAddressKey(event: KeyboardEvent<HTMLInputElement>) {
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
      setNotice("Nettleseren deler ikke posisjonen din. Skriv inn koordinatene i stedet.");
      return;
    }
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      (found) => {
        const here = parsePosition(`${found.coords.latitude}, ${found.coords.longitude}`);
        if (here) setPosition(formatPosition(here));
        setLocating(false);
      },
      () => {
        setNotice(
          "Vi fikk ikke tak i posisjonen din. Sjekk at nettleseren har lov til å bruke posisjon, eller skriv inn koordinatene.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  const found = parsePosition(position);
  const unreadable = position.trim() !== "" && !found;

  return (
    <div className="grid gap-4">
      <div className="relative">
        <label htmlFor={addressId} className="block font-medium">
          Adresse
        </label>
        <span className="block text-sm text-muted">
          Begynn å skrive, og velg adressen fra forslagene hvis den dukker opp.
        </span>
        <input
          id={addressId}
          name="address"
          value={address}
          onChange={(event) => onAddressChange(event.target.value)}
          onKeyDown={onAddressKey}
          onBlur={() => setOpen(false)}
          maxLength={200}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          className={inputClass}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="Forslag til adresse"
          hidden={!open}
          className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-line bg-surface shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.label}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // mousedown, slik at valget skjer før feltet mister fokus og listen lukkes.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(suggestion);
              }}
              onMouseEnter={() => setActive(index)}
              className={`cursor-pointer px-3 py-2.5 ${index === active ? "bg-paper" : ""}`}
            >
              {suggestion.label}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <label htmlFor={positionId} className="block font-medium">
          Kartposisjon
        </label>
        <span className="block max-w-[60ch] text-sm text-muted">
          Fylles inn når du velger adressen fra forslagene. Har hytta ingen adresse, kan du
          lime inn koordinater eller en lenke fra Google Maps.
        </span>
        <input
          id={positionId}
          name="position"
          value={position}
          onChange={(event) => setPosition(event.target.value)}
          maxLength={1000}
          autoComplete="off"
          placeholder="61.2345, 10.4567"
          aria-invalid={unreadable}
          className={`${inputClass} sm:max-w-md`}
        />
        <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="cursor-pointer text-pine underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {locating ? "Finner posisjonen …" : "Jeg er på hytta: bruk posisjonen min"}
          </button>
          {found && (
            <a
              href={mapLink(found)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-pine underline"
            >
              Sjekk posisjonen i kartet
            </a>
          )}
          {unreadable && (
            <span className="text-barn">Vi finner ingen koordinater i dette ennå.</span>
          )}
        </div>
        {notice && (
          <p role="alert" className="mt-2 max-w-[60ch] font-medium text-barn">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}
