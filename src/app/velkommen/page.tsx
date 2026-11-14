import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Pledge } from "@/components/pledge";
import { PublicShell } from "@/components/public-shell";
import { Field, Input, Loading, PageTitle, Panel } from "@/components/ui";
import { PLEDGE_CONFIRM } from "@/lib/pledge";
import { getPublicInvitation, isInvitationToken } from "@/lib/services/invitations";
import { getSessionUser, getViewer } from "@/lib/session";
import { completeOnboarding } from "./actions";

export const metadata: Metadata = { title: "Velkommen" };

export default function WelcomePage({ searchParams }: PageProps<"/velkommen">) {
  return (
    <PublicShell>
      <PageTitle
        title="Velkommen"
        lead="To opplysninger og ett løfte, så er du med."
      />
      <Suspense fallback={<Loading />}>
        <WelcomeForm searchParams={searchParams} />
      </Suspense>
    </PublicShell>
  );
}

async function WelcomeForm({
  searchParams,
}: {
  searchParams: PageProps<"/velkommen">["searchParams"];
}) {
  const { invitasjon } = await searchParams;
  const token = isInvitationToken(invitasjon) ? invitasjon : "";
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect(token ? `/logg-inn?invitasjon=${token}` : "/logg-inn");
  if (await getViewer()) redirect(token ? `/invitasjon/${token}` : "/krets");
  const invitation = token ? await getPublicInvitation(token) : null;

  return (
    <ActionForm action={completeOnboarding} className="space-y-8">
      {token && <input type="hidden" name="invitasjon" value={token} />}
      {invitation?.status === "valid" && (
        <p className="max-w-xl rounded-xl border border-line bg-surface p-4">
          <strong>{invitation.inviterName}</strong> har invitert deg. Når du har gitt løftet,
          ser du hva {invitation.kind === "cabin" ? "du kan låne" : "du kan gjøre"}.
        </p>
      )}
      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        <Field label="Navn">
          <Input name="name" autoComplete="name" required defaultValue={sessionUser.name} />
        </Field>
        <Field label="Mobilnummer" hint="Vises til eieren når du ber om å låne.">
          <Input name="phone" type="tel" autoComplete="tel" inputMode="tel" required />
        </Field>
      </div>

      <Panel>
        <h2 className="mb-3 text-2xl font-bold">Hytteløftet</h2>
        <Pledge />
        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl bg-paper p-4 font-semibold">
          <input type="checkbox" name="pledge" required className="mt-1 size-5 accent-pine" />
          <span>{PLEDGE_CONFIRM}</span>
        </label>
      </Panel>

      <SubmitButton>Gi løftet og bli med</SubmitButton>
    </ActionForm>
  );
}
