import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, PageTitle, Panel, Textarea } from "@/components/ui";
import { APP_NAME } from "@/lib/brand";
import { formatDate, todayInOslo } from "@/lib/dates";
import { listAccountInvitations } from "@/lib/services/invitations";
import { requireViewer } from "@/lib/session";
import { inviteAccountAction, revokeAccountInvitationAction } from "../actions";
import { AdminTabs } from "./tabs";

export const metadata: Metadata = { title: "Administrasjon" };

/**
 * Administrasjon er én ting: å slippe en person inn i tjenesten uten at noen
 * har delt en hytte med vedkommende ennå. Siden gir ikke innsyn i andres
 * hytter, delinger eller forespørsler. En administrator ser hytter på samme
 * måte som alle andre: bare egne, og de noen har delt.
 */
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  const [{ endret }, invitations] = await Promise.all([
    searchParams,
    listAccountInvitations(viewer),
  ]);

  return (
    <>
      <PageTitle
        title="Administrasjon"
        lead={`Her inviterer du folk inn i ${APP_NAME} uten å vise dem en hytte. De kan da legge inn sin egen hytte.`}
      />
      <AdminTabs active="invitasjoner" />

      <p className="mb-8 max-w-[60ch] rounded-xl border border-line bg-surface p-4">
        Som administrator ser du ikke andres hytter eller forespørsler. Du ser hytter som
        alle andre: dine egne, og de eieren har valgt å vise deg. Under Hytter ser du bare
        navn, sted, eier og antall.
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
