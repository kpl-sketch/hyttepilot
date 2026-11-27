import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public-shell";
import { PageTitle, Panel } from "@/components/ui";
import { APP_NAME } from "@/lib/brand";
import { ANSWER_WITHIN_DAYS } from "@/lib/join-request-limits";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "Be om invitasjon" };

/**
 * For den som ikke kjenner noen i tjenesten ennå. Tjenesten er fortsatt bare
 * for inviterte: skjemaet gir ingen adgang, og en administrator leser og
 * svarer på hver enkelt. Reglene ligger i src/lib/services/join-requests.ts.
 *
 * Siden lover ikke plass, og den sier at uten hytte ser man ingen hytter før
 * en eier viser sin.
 */
export default function RequestInvitationPage() {
  return (
    <PublicShell>
      {/* Tjenesten er lukket. Det skal stå først, også her. */}
      <p className="mb-5 inline-block rounded-full bg-pine px-4 py-1.5 text-sm font-bold uppercase tracking-wider text-white">
        Bare for inviterte
      </p>
      <PageTitle
        title="Be om invitasjon"
        lead={
          <>
            Kjenner du ingen som er med ennå? Fortell hvem du er. Vi som{" "}
            <Link href="/om" className="underline">
              står bak {APP_NAME}
            </Link>
            , leser alt selv.
          </>
        }
      />
      <Panel className="max-w-2xl">
        <RequestForm appName={APP_NAME} answerDays={ANSWER_WITHIN_DAYS} />
      </Panel>
    </PublicShell>
  );
}
