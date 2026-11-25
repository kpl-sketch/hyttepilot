import type { Metadata } from "next";
import { Pledge } from "@/components/pledge";
import { PublicShell } from "@/components/public-shell";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Hytteløftet" };

export default function PledgePage() {
  return (
    <PublicShell memberNav>
      <PageTitle title="Hytteløftet" />
      <Pledge />
    </PublicShell>
  );
}
