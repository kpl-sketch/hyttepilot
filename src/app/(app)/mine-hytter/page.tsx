import type { Metadata } from "next";
import Link from "next/link";
import { CabinThumb } from "@/components/cabin-photo";
import { ButtonLink, PageTitle, Panel } from "@/components/ui";
import { formatRange } from "@/lib/dates";
import { listOwnCabins } from "@/lib/services/cabins";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Dine hytter" };

export default async function MyCabinsPage() {
  const viewer = await requireViewer();
  const cabins = await listOwnCabins(viewer);

  return (
    <>
      <PageTitle
        title="Dine hytter"
        lead="Du velger hvem som får se hver hytte, når den er ledig, og hvilke opphold du sier ja til."
      />
      {cabins.length === 0 && (
        <Panel className="mb-8">
          <h2 className="text-xl font-bold">Har du en hytte du vil låne bort til noen du kjenner?</h2>
          <p className="mt-2 max-w-[60ch]">
            Legg inn hytta, åpne noen datoer og velg hvem som får se den. Ingen andre enn deg
            ser hytta før du har valgt noen.
          </p>
          <p className="mt-2 max-w-[60ch] text-muted">
            Det er frivillig. Du kan låne uten å eie en hytte.
          </p>
        </Panel>
      )}
      <ul className="mb-10 grid gap-x-6 gap-y-8 empty:hidden sm:grid-cols-2">
        {cabins.map((cabin) => (
          <li key={cabin.id}>
            <Link
              href={`/mine-hytter/${cabin.id}`}
              className="group block rounded-2xl"
            >
              <CabinThumb photoId={cabin.coverPhotoId} card />
              <span className="mt-3 block">
                <span className="block text-xl font-bold group-hover:underline">
                  {cabin.name}
                </span>
                <span className="block text-muted">{cabin.area}</span>
                <span className="mt-1 block">
                  <span className="font-semibold">
                    {cabin.sharedWith === 0
                      ? "Privat. Bare du ser den."
                      : `${cabin.sharedWith === 1 ? "Én person" : `${cabin.sharedWith} personer`} ser hytta.`}
                  </span>{" "}
                  {cabin.free.length > 0
                    ? `Ledig: ${formatRange(cabin.free[0].startDate, cabin.free[0].endDate)}${cabin.free.length > 1 ? " med flere" : ""}.`
                    : "Ingen ledige datoer."}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <ButtonLink href="/mine-hytter/ny">
        {cabins.length === 0 ? "Legg inn hytta di" : "Legg inn en hytte til"}
      </ButtonLink>
    </>
  );
}
