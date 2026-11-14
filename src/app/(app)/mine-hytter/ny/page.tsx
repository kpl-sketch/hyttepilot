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
        lead="Hytta er privat til du selv velger hvem du vil dele den med. Ledige datoer og personer legger du til etterpå."
      />
      <CabinForm action={createCabinAction} defaultVipps={viewer.phone} />
    </>
  );
}
