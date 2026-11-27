import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, PageTitle, Panel, Textarea } from "@/components/ui";
import { APP_NAME } from "@/lib/brand";
import { formatDate, todayInOslo } from "@/lib/dates";
import { ANSWER_WITHIN_DAYS } from "@/lib/join-request-limits";
import { INVITATION_DAYS, listAccountInvitations } from "@/lib/services/invitations";
import { listJoinRequests } from "@/lib/services/join-requests";
import { requireViewer } from "@/lib/session";
import {
  declineJoinRequestAction,
  inviteAccountAction,
  inviteFromJoinRequestAction,
  revokeAccountInvitationAction,
} from "../actions";
import { AdminTabs } from "./tabs";

export const metadata: Metadata = { title: "Administrasjon" };

/** Beskjeden øverst etter at administratoren har svart en som ba om invitasjon. */
const ANSWERED: Record<string, string> = {
  invitert: `Invitasjonen er sendt. Den gjelder i ${INVITATION_DAYS} dager.`,
  "invitert-uten-epost":
    "Invitasjonen er lagret, men e-posten ble ikke sendt. Si gjerne fra selv.",
  nei: "Du har sagt nei. Personen får ingen e-post.",
};

/**
 * Administrasjon er én ting: å slippe en person inn i tjenesten uten at noen
 * har delt en hytte med vedkommende ennå. Siden gir ikke innsyn i andres
 * hytter, delinger eller forespørsler. En administrator ser hytter på samme
 * måte som alle andre: bare egne, og de noen har delt.
 *
 * Øverst står de som har bedt om invitasjon i skjemaet på /be-om-invitasjon.
 * Reglene ligger i src/lib/services/join-requests.ts.
 */
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  const [{ endret }, invitations, asked] = await Promise.all([
    searchParams,
    listAccountInvitations(viewer),
    listJoinRequests(viewer),
  ]);
  const answeredNote = typeof endret === "string" ? ANSWERED[endret] : undefined;

  return (
    <>
      <PageTitle
        title="Administrasjon"
        lead={`Her inviterer du folk inn i ${APP_NAME} uten å vise dem en hytte. De kan da legge inn sin egen hytte.`}
      />
      <AdminTabs active="invitasjoner" />

      <section id="ber-om-invitasjon" className="mb-10">
        <h2 className="text-2xl font-bold">Ber om invitasjon</h2>
        <p className="mt-1 max-w-[60ch] text-muted">
          Disse har spurt i skjemaet på forsiden. De er ikke med før du inviterer, og de får
          bare e-post hvis du gjør det. Adressen er ikke bekreftet.
        </p>
        <p className="mt-2 max-w-[60ch] text-muted">
          Kvitteringen sier at den som ikke har hørt fra oss innen {ANSWER_WITHIN_DAYS} dager,
          ikke får plass nå. Svar derfor før fristen.
        </p>
        {answeredNote && (
          <p role="status" className="mt-4 max-w-[60ch] rounded-xl bg-window p-4 font-semibold">
            {answeredNote}
          </p>
        )}
        {asked.open.length === 0 ? (
          <p className="mt-4 text-muted">Ingen venter på svar.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {asked.open.map((person) => (
              <li key={person.id} className="py-4">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-lg font-semibold break-words">{person.name}</span>
                  <span
                    className={`rounded-full border px-3 py-0.5 text-sm font-semibold ${
                      person.hasCabin
                        ? "border-pine bg-pine text-white"
                        : "border-line bg-surface text-muted"
                    }`}
                  >
                    {person.hasCabin ? "Har hytte" : "Har ikke hytte"}
                  </span>
                </p>
                <p className="text-sm text-muted break-words">
                  {person.email}. Spurte {formatDate(todayInOslo(person.createdAt))}.
                </p>
                <p className={`text-sm ${person.overdue ? "font-semibold text-barn" : "text-muted"}`}>
                  {person.overdue
                    ? `Fristen gikk ut ${formatDate(person.deadline)}. Personen regner med et nei.`
                    : `Svar innen ${formatDate(person.deadline)}.`}
                </p>
                {person.note && <p className="mt-2 max-w-[60ch] break-words">«{person.note}»</p>}
                {person.state === "member" && (
                  <p className="mt-2 max-w-[60ch] font-medium">
                    Adressen er allerede med. Personen kan logge inn og trenger ingen invitasjon.
                  </p>
                )}
                {person.state === "invited" && (
                  <p className="mt-2 max-w-[60ch] font-medium">
                    Adressen har allerede en invitasjon som gjelder.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-start gap-3">
                  {person.state === "new" && (
                    <ActionForm action={inviteFromJoinRequestAction}>
                      <input type="hidden" name="requestId" value={person.id} />
                      <SubmitButton className="px-4 py-2">
                        Inviter<span className="sr-only"> {person.name}</span>
                      </SubmitButton>
                    </ActionForm>
                  )}
                  <ActionForm
                    action={declineJoinRequestAction}
                    confirm={
                      person.state === "new"
                        ? `Si nei til ${person.name}? Personen får ingen e-post.`
                        : `Fjerne ${person.name} fra listen?`
                    }
                  >
                    <input type="hidden" name="requestId" value={person.id} />
                    <SubmitButton variant="secondary" className="px-4 py-2">
                      {person.state === "new" ? "Si nei" : "Fjern fra listen"}
                      <span className="sr-only"> {person.name}</span>
                    </SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
        {asked.waiting > asked.open.length && (
          <p className="mt-3 text-muted">
            Viser de {asked.open.length} som har ventet lengst, av {asked.waiting}.
          </p>
        )}
        {asked.funnel.invited > 0 && (
          <p className="mt-4 max-w-[60ch]">
            Invitert herfra: {asked.funnel.invited}. Av dem er {asked.funnel.joined} med, og{" "}
            {asked.funnel.withCabin} har lagt inn hytte.
          </p>
        )}
        {asked.answered.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer font-semibold underline">
              De siste som har fått svar
            </summary>
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {asked.answered.map((person) => (
                <li key={person.id} className="py-3">
                  <span className="font-semibold break-words">{person.name}</span>
                  <span className="block text-sm text-muted break-words">
                    {person.email}.{" "}
                    {person.outcome === "invited"
                      ? `Invitert ${formatDate(todayInOslo(person.decidedAt))}`
                      : `Nei ${formatDate(todayInOslo(person.decidedAt))}`}
                    {person.decidedByName ? ` av ${person.decidedByName}` : ""}.
                    {person.outcome === "invited" &&
                      (person.joined ? " Er med." : " Har ikke logget inn ennå.")}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <p className="mb-8 max-w-[60ch] rounded-xl border border-line bg-surface p-4">
        Som administrator ser du alle hytter under Hytter, slik lånerne ser dem: bilder,
        pris, regler og ledige datoer, men ikke adresse eller Vipps-nummer. Du ser ikke
        andres forespørsler, og du kan bare spørre om å låne hytter eieren har vist deg.
      </p>

      <Panel>
        <h2 className="text-2xl font-bold">Inviter en person</h2>
        <p className="mt-1 mb-5 max-w-[60ch] text-muted">
          Invitasjonen gir adgang til tjenesten, men ikke til noen hytter. Vil du vise noen
          din egen hytte, gjør du det på siden for hytta.
        </p>
        <ActionForm action={inviteAccountAction} resetOnOk className="space-y-4">
          <Field label="E-postadresse" className="max-w-md">
            <Input name="email" type="email" autoComplete="off" required />
          </Field>
          <Field label="Personlig hilsen" hint="Valgfritt. Står i e-posten." className="max-w-xl">
            <Textarea name="message" rows={3} maxLength={500} />
          </Field>
          <SubmitButton>Send invitasjonen</SubmitButton>
        </ActionForm>
      </Panel>

      <h2 className="mb-3 mt-10 text-2xl font-bold">
        Invitasjoner du og andre administratorer har sendt
      </h2>
      {endret === "invitasjon" && (
        <p role="status" className="mb-4 max-w-[60ch] rounded-xl bg-window p-4 font-semibold">
          Invitasjonen er trukket tilbake. Lenken i e-posten virker ikke lenger.
        </p>
      )}
      {invitations.length === 0 ? (
        <p className="text-muted">Ingen er invitert ennå.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {invitations.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="font-semibold break-words">
                  {inv.status === "accepted" && inv.name ? inv.name : inv.email}
                </span>
                <span className="block text-sm text-muted">
                  {inv.status === "accepted" && `${inv.email}. Er med.`}
                  {inv.status === "valid" &&
                    `Har ikke logget inn ennå. Gjelder til ${formatDate(todayInOslo(inv.expiresAt))}.`}
                  {inv.status === "expired" && "Utløpt. Send en ny hvis det fortsatt er aktuelt."}
                </span>
              </span>
              {inv.status !== "accepted" && (
                <ActionForm
                  action={revokeAccountInvitationAction}
                  confirm={`Trekke tilbake invitasjonen til ${inv.email}?`}
                >
                  <input type="hidden" name="invitationId" value={inv.id} />
                  <button
                    type="submit"
                    className="cursor-pointer text-barn underline"
                    aria-label={`Trekk tilbake invitasjonen til ${inv.email}`}
                  >
                    Trekk tilbake
                  </button>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
