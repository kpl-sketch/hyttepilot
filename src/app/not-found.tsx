import { PublicShell } from "@/components/public-shell";
import { ButtonLink, PageTitle } from "@/components/ui";

export default function NotFound() {
  return (
    <PublicShell>
      <PageTitle
        title="Fant ikke siden"
        lead="Siden finnes ikke, eller du har ikke tilgang til den."
      />
      <ButtonLink href="/krets">Til din hyttekrets</ButtonLink>
    </PublicShell>
  );
}
