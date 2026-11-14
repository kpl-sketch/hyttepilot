import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PublicShell } from "@/components/public-shell";
import { Loading, PageTitle } from "@/components/ui";
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
  if (await getSessionUser()) redirect("/hytter");
  const { e } = await searchParams;
  return <LoginForm initialEmail={typeof e === "string" ? e : ""} />;
}
