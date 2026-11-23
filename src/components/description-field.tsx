"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { suggestDescriptionAction } from "@/app/(app)/actions";
import { buttonClass, Field, Textarea } from "./ui";

/**
 * Hva knappen for tekstforslag kan gjøre:
 *  - "ready": hytta har et forsidebilde, og knappen virker.
 *  - "needs-photo": hytta har ingen bilder ennå. Knappen er grå.
 */
export type SuggestState = "ready" | "needs-photo";

/**
 * Beskrivelsen av hytta, med en knapp som foreslår en tekst ut fra bildene,
 * stedet, sengeplassene og det eieren alt har skrevet i feltet. Forslaget
 * legges i feltet og lagres først når eieren trykker «Lagre endringene».
 * Uten `suggest` er tekstforslag ikke slått på, og feltet står alene.
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
      !window.confirm("Forslaget bygger på teksten i feltet og erstatter den. Vil du fortsette?")
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
      <Field label="Beskrivelse">
        <Textarea ref={field} name="description" maxLength={2000} defaultValue={defaultValue} />
      </Field>

      {suggest && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={onSuggest}
              disabled={pending || suggest === "needs-photo"}
              className={buttonClass("secondary")}
            >
              Foreslå tekst fra bilde og sted
            </button>
            {pending && (
              <span role="status" className="text-muted">
                Lager et forslag …
              </span>
            )}
          </div>
          <p className="mt-2 max-w-[60ch] text-sm text-muted">
            {suggest === "needs-photo"
              ? "Legg til et bilde under «Bilder» først. Da kan du få et forslag ut fra bildene og opplysningene om hytta."
              : "Bildene, stedet, sengeplassene og det du har skrevet i feltet, sendes til en AI-tjeneste som skriver et utkast. Skriv gjerne stikkord først. Du retter på utkastet før du lagrer."}
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
