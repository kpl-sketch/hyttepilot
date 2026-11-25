import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Avatar } from "@/components/avatar";
import { ProfilePhotoControls } from "@/components/profile-photo-controls";
import { Field, Input, PageTitle, Panel } from "@/components/ui";
import { avatarSrc } from "@/lib/avatar";
import { APP_NAME } from "@/lib/brand";
import { formatDate, todayInOslo } from "@/lib/dates";
import { canFetchFromLinkedIn } from "@/lib/linkedin";
import { getOwnProfilePhoto } from "@/lib/services/profile-photos";
import { requireViewer } from "@/lib/session";
import {
  removeProfilePhotoAction,
  startLinkedInAction,
  updatePhoneAction,
  uploadProfilePhotoAction,
} from "./actions";

export const metadata: Metadata = { title: "Profilen din" };

/**
 * Det brukeren får vite etter en handling, eller når LinkedIn har sendt dem
 * tilbake hit. Utfallet står i adressen: /profil?bilde=<utfall>.
 */
const NOTICES: Record<string, { text: string; ok: boolean }> = {
  hentet: { text: "Bildet er hentet fra LinkedIn.", ok: true },
  lagret: { text: "Bildet er lagret.", ok: true },
  fjernet: { text: "Bildet er fjernet.", ok: true },
  avbrutt: { text: "Du avbrøt hos LinkedIn. Ingenting er hentet eller endret.", ok: false },
  "uten-bilde": {
    text: "Vi fant ikke noe profilbilde på LinkedIn-profilen din. Du kan laste opp et bilde selv.",
    ok: false,
  },
  feil: {
    text: "Vi fikk ikke hentet bildet fra LinkedIn. Prøv igjen om litt, eller last opp et bilde selv.",
    ok: false,
  },
};

/**
 * Profilen: bildet av brukeren og mobilnummeret. Bildet hentes fra LinkedIn
 * med ett trykk når det er slått på (canFetchFromLinkedIn), eller lastes opp.
 * Hvem som ser bildet, står i src/lib/services/profile-photos.ts og gjengis på
 * siden. Mobilnummeret er det brukeren ga på velkomstsiden, og kan rettes her.
 */
export default async function ProfilePage({ searchParams }: PageProps<"/profil">) {
  const viewer = await requireViewer();
  const [{ bilde }, photo] = await Promise.all([searchParams, getOwnProfilePhoto(viewer)]);
  const withLinkedIn = canFetchFromLinkedIn();
  const notice = typeof bilde === "string" ? NOTICES[bilde] : undefined;

  return (
    <>
      <PageTitle
        title="Profilen din"
        lead="Med et bilde ser de du låner av og låner bort til, hvem du er."
      />

      {notice && (
        <p
          role={notice.ok ? "status" : "alert"}
          className={`mb-8 max-w-3xl rounded-xl p-4 font-semibold ${
            notice.ok ? "bg-window" : "border border-barn text-barn"
          }`}
        >
          {notice.text}
        </p>
      )}

      <Panel className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar
            name={viewer.name}
            src={avatarSrc(viewer.id, photo?.version, "stor")}
            size="xl"
          />
          <div className="min-w-0">
            <h2 className="text-2xl font-bold break-words">{viewer.name}</h2>
            <p className="break-words text-muted">{viewer.email}</p>
            <p className="mt-2 max-w-[44ch]">
              {photo
                ? photo.source === "linkedin"
                  ? `Bildet ble hentet fra LinkedIn ${formatDate(todayInOslo(photo.updatedAt))}.`
                  : `Du lastet opp bildet ${formatDate(todayInOslo(photo.updatedAt))}.`
                : "Du har ikke noe bilde ennå. Da vises forbokstaven i navnet ditt."}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <ProfilePhotoControls
            hasPhoto={Boolean(photo)}
            startLinkedIn={withLinkedIn ? startLinkedInAction : null}
            upload={uploadProfilePhotoAction}
            remove={removeProfilePhotoAction}
          />
        </div>

        {withLinkedIn && (
          <p className="mt-4 max-w-[60ch] text-sm text-muted">
            Trykker du «Hent bildet fra LinkedIn», spør LinkedIn om {APP_NAME} får se navnet og
            profilbildet ditt. Vi henter bare bildet og lagrer en kopi her. Vi ser ikke
            kontaktene dine, og vi kan ikke publisere noe. Du logger fortsatt inn her med kode
            på e-post.
          </p>
        )}
      </Panel>

      <section aria-labelledby="hvem-ser" className="mt-10 max-w-[60ch]">
        <h2 id="hvem-ser" className="text-xl font-bold">
          Hvem ser bildet?
        </h2>
        <p className="mt-2">
          Bildet står ved navnet ditt, og bare der navnet ditt vises fra før:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>hos dem du viser en hytte til, og hos dem som viser deg sin</li>
          <li>i forespørsler mellom deg og en eier eller en låner</li>
          <li>på invitasjoner du sender, også før mottakeren har logget inn</li>
        </ul>
        <p className="mt-2 text-muted">
          Det finnes ingen liste over medlemmer. Andre medlemmer ser ikke bildet.
          Administratorene i {APP_NAME} kan se det. Du kan fjerne bildet når du vil.
        </p>
      </section>

      <Panel className="mt-10 max-w-3xl">
        <h2 className="text-xl font-bold">Mobilnummer</h2>
        <p className="mt-2 max-w-[60ch]">
          Eieren ser nummeret når du ber om å låne en hytte.
        </p>
        <ActionForm action={updatePhoneAction} className="mt-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Mobilnummer" className="w-full max-w-xs">
              <Input
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                required
                defaultValue={viewer.phone}
              />
            </Field>
            <SubmitButton variant="secondary">Lagre nummeret</SubmitButton>
          </div>
        </ActionForm>
        <p className="mt-4 max-w-[60ch] text-sm text-muted">
          Har du lagt inn en hytte, endrer du Vipps-nummeret på siden for hytta.
        </p>
      </Panel>
    </>
  );
}
