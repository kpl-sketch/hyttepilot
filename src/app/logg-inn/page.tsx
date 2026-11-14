import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PublicShell } from "@/components/public-shell";
import { Loading, PageTitle } from "@/components/ui";
import { getPublicInvitation, isInvitationToken } from "@/lib/services/invitations";
import { getSessionUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Logg inn" };

export default function LoginPage({ searchParams }: PageProps<"/logg-inn">) {
  return (
    <PublicShell>
      <PageTitle
        title="Logg inn"
        lead="Du får en engangskode på e-post. Det finnes ingen passord å huske."
      />
      <Suspense fallback={<Loading />}>
        <LoginGate searchParams={searchParams} />
      </Suspense>
    </PublicShell>
  );
}

async function LoginGate({
  searchParams,
}: {
  searchParams: PageProps<"/logg-inn">["searchParams"];
}) {
  const { e, invitasjon } = await searchParams;
  // Invitasjonen følger med gjennom innloggingen, slik at mottakeren lander
  // på riktig velkomst etterpå. Nøkkelen gir ingen tilgang i seg selv.
  const token = isInvitationToken(invitasjon) ? invitasjon : "";
  if (await getSessionUser()) redirect(token ? `/invitasjon/${token}` : "/krets");
  const invitation = token ? await getPublicInvitation(token) : null;
  return (
    <LoginForm
      initialEmail={typeof e === "string" ? e : ""}
      invitation={
        invitation && invitation.status !== "revoked" && invitation.status !== "expired"
          ? { token, inviterName: invitation.inviterName, maskedEmail: invitation.maskedEmail }
          : undefined
      }
    />
  );
}
