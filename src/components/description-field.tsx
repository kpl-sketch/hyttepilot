"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { suggestDescriptionAction } from "@/app/(app)/actions";
import { buttonClass, Field, Textarea } from "./ui";

/**
 * Hva knappen for tekstforslag kan gjøre:
 *  - "ready": hytta har et forsidebilde, og knappen virker.
 *  - "needs-photo": hytta har ingen bilder ennå. Knappen er grå.
 */
export type SuggestState = "ready" | "needs-photo";

/**
 * Beskrivelsen av hytta. Eieren skriver stikkord, og en knapp lar AI skrive
 * dem om til en ferdig tekst, sammen med bildene, stedet og sengeplassene.
 * At stikkord holder, står tre steder: under ledeteksten, i det tomme feltet
 * og i ruten med knappen (prosjekteier 2026-11-23: «supertydelig»).
 *
 * Teksten legges i feltet og lagres først når eieren trykker «Lagre
 * endringene». Uten `suggest` er tekstforslag ikke slått på. Da står feltet
 * alene, uten ett ord om AI.
 */
export function DescriptionField({
  cabinId,
  defaultValue,
  suggest,
  className = "",
}: {
  cabinId: string;
  defaultValue: string;
  suggest?: SuggestState;
  className?: string;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const helpId = useId();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Meldingen om at ingenting er lagret, skal ikke stå igjen etter at
  // skjemaet er sendt.
  useEffect(() => {
    const form = field.current?.form;
    if (!form) return;
    const onSubmit = () => setResult(null);
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  function onSuggest() {
    const written = field.current?.value.trim() ?? "";
    if (
      written &&
      !window.confirm(
        "AI skriver en ny tekst ut fra det som står i feltet, og erstatter det. Vil du fortsette?",
      )
    ) {
      return;
    }
    setResult(null);
    startTransition(async () => {
      try {
        const answer = await suggestDescriptionAction(cabinId, written);
        if ("error" in answer) {
          setResult({ ok: false, text: answer.error });
          return;
        }
        if (field.current) {
          field.current.value = answer.text;
          field.current.focus();
        }
        setResult({
          ok: true,
          text: "Forslaget står i feltet. Rett det som ikke stemmer, og legg gjerne til det dere liker best ved stedet. Ingenting er lagret før du trykker «Lagre endringene».",
        });
      } catch {
        setResult({
          ok: false,
          text: "Vi fikk ikke laget et forslag akkurat nå. Prøv igjen om litt, eller skriv teksten selv.",
        });
      }
    });
  }

  return (
    <div className={className}>
      <Field
        label="Beskrivelse"
        hint={suggest ? "Skriv stikkord. AI kan gjøre dem om til en ferdig tekst." : undefined}
      >
        <Textarea
          ref={field}
          name="description"
          maxLength={2000}
          defaultValue={defaultValue}
          placeholder={
            suggest ? "For eksempel: brygge, badstue, stor terrasse, 15 min til butikken" : undefined
          }
          aria-describedby={suggest ? helpId : undefined}
        />
      </Field>

      {suggest && (
        <div className="mt-3 rounded-xl bg-fjord-soft p-4">
          <p className="font-bold">Fra stikkord til ferdig tekst</p>
          <ol id={helpId} className="mt-2 max-w-[60ch] list-decimal space-y-1 pl-5">
            <li>
              Skriv det viktigste om hytta i feltet over. Stikkord holder, for eksempel «brygge,
              badstue, 15 min til butikken».
            </li>
            <li>
              Trykk på knappen. AI setter stikkordene sammen med bildene, stedet og sengeplassene
              til en ferdig tekst.
            </li>
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={onSuggest}
              disabled={pending || suggest === "needs-photo"}
              className={buttonClass("secondary")}
            >
              La AI skrive teksten
            </button>
            {pending && <span role="status">AI skriver …</span>}
          </div>
          <p className="mt-3 max-w-[60ch] text-sm text-muted">
            {suggest === "needs-photo"
              ? "Legg til et bilde under «Bilder» først. AI trenger minst ett bilde av hytta."
              : "Bildene, stedet, sengeplassene og det du har skrevet i feltet, sendes til en AI-tjeneste. Du retter på teksten før du lagrer."}
          </p>
          {result && (
            <p
              role={result.ok ? "status" : "alert"}
              className={`mt-2 max-w-[60ch] font-medium ${result.ok ? "text-pine" : "text-barn"}`}
            >
              {result.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
