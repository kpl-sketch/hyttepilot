import { ButtonLink, PageTitle } from "@/components/ui";

/**
 * Vises når en innlogget bruker åpner en hytte eller side som ikke finnes,
 * eller som ikke er delt med brukeren. De to tilfellene ser helt like ut,
 * slik at siden ikke røper om en hytte finnes. Rammen rundt (meny og bunn)
 * kommer fra layout.tsx i samme mappe.
 */
export default function NotFound() {
  return (
    <>
      <PageTitle
        title="Fant ikke siden"
        lead="Siden finnes ikke, eller den er ikke delt med deg."
      />
      <ButtonLink href="/krets">Til din hyttekrets</ButtonLink>
    </>
  );
}
