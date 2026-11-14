import type { Metadata } from "next";
import { CabinForm } from "@/components/cabin-form";
import { PageTitle } from "@/components/ui";
import { requireViewer } from "@/lib/session";
import { createCabinAction } from "../../actions";

export const metadata: Metadata = { title: "Legg inn hytte" };

export default async function NewCabinPage() {
  const viewer = await requireViewer();
  return (
    <>
      <PageTitle
        title="Legg inn hytte"
        lead="Steg 1 av 3. Bare du ser hytta til du selv velger hvem som får se den. Beskrivelse, regler og nøkkel kan du legge til senere."
      />
      <CabinForm action={createCabinAction} defaultVipps={viewer.phone} />
    </>
  );
}
