import type { Cabin } from "@/lib/db/schema";
import type { FormState } from "@/lib/errors";
import { MAX_PHOTOS } from "@/lib/photo-limits";
import { formatPosition } from "@/lib/position";
import { ActionForm, SubmitButton } from "./action-form";
import { LocationFields } from "./location-fields";
import { PhotoPicker } from "./photo-picker";
import { Field, Input, Textarea } from "./ui";

/**
 * Skjema for å legge inn eller endre en hytte.
 *
 * En ny hytte legges inn med det som trengs for at noen kan spørre om å låne
 * den: navn, hvor den ligger, sengeplasser, bilder og pris per døgn. Vask,
 * påslag, regler og nøkkel fylles ut senere i det fulle skjemaet på siden
 * for hytta. Vipps-nummeret settes til eierens mobilnummer og kan endres der.
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
  if (!cabin) return <NewCabinForm action={action} defaultVipps={defaultVipps} />;
  return (
    <ActionForm action={action} className="space-y-10">
      {cabin && <input type="hidden" name="cabinId" value={cabin.id} />}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-xl font-bold">Hytta</legend>
        <Field label="Navn på hytta" className="sm:col-span-2">
          <Input name="name" required maxLength={80} defaultValue={cabin?.name} />
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
        <legend className="mb-3 text-xl font-bold">Hvor hytta ligger</legend>
        <LocationFields
          defaultArea={cabin.area}
          defaultAddress={cabin.address}
          defaultPosition={
            cabin.latitude !== null && cabin.longitude !== null
              ? formatPosition({ latitude: cabin.latitude, longitude: cabin.longitude })
              : ""
          }
        />
        <Field
          label="Nøkkel og veibeskrivelse"
          hint="Hvor nøkkelen ligger, parkering og det siste stykket fram. Vises til låneren når lånet er betalt."
          className="mt-6"
        >
          <Textarea name="arrivalInfo" maxLength={2000} defaultValue={cabin.arrivalInfo} />
        </Field>
      </fieldset>

      <SubmitButton>Lagre endringene</SubmitButton>
    </ActionForm>
  );
}

function NewCabinForm({
  action,
  defaultVipps,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaultVipps?: string;
}) {
  return (
    <ActionForm action={action} className="space-y-10">
      {/* Fylles ut senere i det fulle skjemaet. */}
      <input type="hidden" name="markupPercent" value="0" />
      <input type="hidden" name="cleaningFee" value="0" />
      <input type="hidden" name="vippsNumber" value={defaultVipps ?? ""} />

      <div className="grid max-w-xl gap-4">
        <Field label="Navn på hytta">
          <Input name="name" required maxLength={80} />
        </Field>
        <LocationFields />
      </div>

      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        <Field label="Sengeplasser">
          <Input name="beds" type="number" min={1} max={40} required defaultValue={6} />
        </Field>
        <Field label="Pris per døgn" hint="Hele kroner. Mange tar bare det hytta koster i strøm og avgifter.">
          <Input name="costPerNight" type="number" min={0} max={20000} required />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1 text-xl font-bold">Bilder</legend>
        <p className="mb-4 max-w-[60ch] text-muted">
          Frivillig, men et bilde gjør det lettere å si ja. Opptil {MAX_PHOTOS} bilder. Det
          første blir forsidebildet.
        </p>
        <PhotoPicker />
      </fieldset>

      <SubmitButton>Legg inn hytta</SubmitButton>
    </ActionForm>
  );
}
