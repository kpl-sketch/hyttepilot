import type { Cabin } from "@/lib/db/schema";
import type { FormState } from "@/lib/errors";
import { MAX_PHOTOS } from "@/lib/photo-limits";
import { formatPosition } from "@/lib/position";
import { ActionForm, SubmitButton } from "./action-form";
import { AddressFields } from "./address-fields";
import { PhotoPicker } from "./photo-picker";
import { Field, Input, Textarea } from "./ui";

/**
 * Skjema for å legge inn eller endre en hytte. Bilder velges her når hytta
 * legges inn. Etterpå styres de i egen del på siden for hytta.
 */
export function CabinForm({
  action,
  cabin,
  defaultVipps,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  cabin?: Cabin;
  /** Forslag til Vipps-nummer for en ny hytte: eierens eget mobilnummer. */
  defaultVipps?: string;
}) {
  return (
    <ActionForm action={action} className="space-y-10">
      {cabin && <input type="hidden" name="cabinId" value={cabin.id} />}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-xl font-bold">Hytta</legend>
        <Field label="Navn på hytta">
          <Input name="name" required maxLength={80} defaultValue={cabin?.name} />
        </Field>
        <Field label="Sted" hint="For eksempel Hafjell eller Kragerø.">
          <Input name="area" required maxLength={80} defaultValue={cabin?.area} />
        </Field>
        <Field label="Beskrivelse" className="sm:col-span-2">
          <Textarea name="description" maxLength={2000} defaultValue={cabin?.description} />
        </Field>
        <Field label="Sengeplasser">
          <Input
            name="beds"
            type="number"
            min={1}
            max={40}
            required
            defaultValue={cabin?.beds ?? 6}
          />
        </Field>
      </fieldset>

      {!cabin && (
        <fieldset>
          <legend className="mb-1 text-xl font-bold">Bilder</legend>
          <p className="mb-4 max-w-[60ch] text-muted">
            Opptil {MAX_PHOTOS} bilder. Det første blir forsidebildet. Du kan legge til og
            bytte bilder senere.
          </p>
          <PhotoPicker />
        </fieldset>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-1 text-xl font-bold">Pris</legend>
        <p className="mb-2 max-w-[60ch] text-muted sm:col-span-3">
          Utgangspunktet er selvkost: strøm og faste avgifter fordelt per døgn. Du kan legge
          på et lite påslag, eller ta betalt for vask.
        </p>
        <Field label="Selvkost per døgn" hint="Hele kroner.">
          <Input
            name="costPerNight"
            type="number"
            min={0}
            max={20000}
            required
            defaultValue={cabin?.costPerNight}
          />
        </Field>
        <Field label="Påslag" hint="Prosent. 0 hvis ingen.">
          <Input
            name="markupPercent"
            type="number"
            min={0}
            max={100}
            required
            defaultValue={cabin?.markupPercent ?? 10}
          />
        </Field>
        <Field label="Vask" hint="Kroner. 0 hvis låneren vasker.">
          <Input
            name="cleaningFee"
            type="number"
            min={0}
            max={20000}
            required
            defaultValue={cabin?.cleaningFee ?? 0}
          />
        </Field>
        <Field
          label="Vipps-nummer"
          hint="Vises til låneren når du har sagt ja."
          className="sm:col-span-2"
        >
          <Input
            name="vippsNumber"
            type="tel"
            inputMode="tel"
            required
            defaultValue={cabin?.vippsNumber ?? defaultVipps}
          />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-xl font-bold">Regler</legend>
        <Field
          label="Dine regler"
          hint="Dyr, røyking, fest, antall gjester."
          className="sm:col-span-2"
        >
          <Textarea name="rules" maxLength={2000} defaultValue={cabin?.rules} />
        </Field>
        <Field label="Aldersgrense" hint="La stå tom hvis du ikke har noen.">
          <Input name="minAge" type="number" min={18} max={99} defaultValue={cabin?.minAge ?? ""} />
        </Field>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-xl font-bold">Adresse og veien dit</legend>
        <p className="mb-4 max-w-[60ch] text-muted">
          Vises til låneren først når lånet er betalt. Da får låneren også en lenke som
          viser veien i kartet.
        </p>
        <AddressFields
          defaultAddress={cabin?.address}
          defaultPosition={
            cabin && cabin.latitude !== null && cabin.longitude !== null
              ? formatPosition({ latitude: cabin.latitude, longitude: cabin.longitude })
              : ""
          }
        />
        <Field
          label="Nøkkel og veibeskrivelse"
          hint="Hvor nøkkelen ligger, parkering og det siste stykket fram."
          className="mt-4"
        >
          <Textarea name="arrivalInfo" maxLength={2000} defaultValue={cabin?.arrivalInfo} />
        </Field>
      </fieldset>

      <SubmitButton>{cabin ? "Lagre endringene" : "Legg inn hytta"}</SubmitButton>
    </ActionForm>
  );
}
