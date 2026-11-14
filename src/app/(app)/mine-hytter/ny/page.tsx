import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CabinForm } from "@/components/cabin-form";
import { PageTitle } from "@/components/ui";
import { requireViewer } from "@/lib/session";
import { createCabinAction } from "../../actions";

export const metadata: Metadata = { title: "Legg inn hytte" };

export default async function NewCabinPage() {
  const viewer = await requireViewer();
  if (!viewer.isOwner) redirect("/mine-hytter");
  return (
    <>
      <PageTitle
        title="Legg inn hytte"
        lead="Ingen ser hytta før du har lagret. Ledige perioder og venner legger du til etterpå."
      />
      <CabinForm action={createCabinAction} defaultVipps={viewer.phone} />
    </>
  );
}
