import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, PageTitle, Panel } from "@/components/ui";
import { listOwnerInvitations } from "@/lib/services/invitations";
import { requireViewer } from "@/lib/session";
import { inviteOwnerAction } from "../actions";

export const metadata: Metadata = { title: "Inviter hytteeiere" };

export default async function AdminPage() {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  const owners = await listOwnerInvitations(viewer);

  return (
    <>
      <PageTitle
        title="Inviter hytteeiere"
        lead="Hytteeiere kan legge inn hytter, ser alle hyttene i kretsen og inviterer selv sine venner."
      />

      <Panel>
        <ActionForm action={inviteOwnerAction} resetOnOk>
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Hytteeierens e-postadresse" className="min-w-[16rem] flex-1">
              <Input name="email" type="email" required />
            </Field>
            <SubmitButton>Inviter</SubmitButton>
          </div>
        </ActionForm>
      </Panel>

      <h2 className="mb-3 mt-10 text-2xl font-bold">Inviterte hytteeiere</h2>
      {owners.length === 0 ? (
        <p className="text-muted">Ingen er invitert ennå.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {owners.map((owner) => (
            <li key={owner.id} className="flex flex-wrap justify-between gap-3 py-3">
              <span>
                <span className="font-semibold">{owner.name || owner.email}</span>
                {owner.name && <span className="block text-sm text-muted">{owner.email}</span>}
              </span>
              <span className="text-muted">
                {owner.acceptedAt ? "Er med" : "Har ikke logget inn ennå"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
