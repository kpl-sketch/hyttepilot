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
          <h2 className="text-xl font-bold">Har du en hytte du vil dele med noen du kjenner?</h2>
          <p className="mt-2 max-w-[60ch]">
            Legg inn hytta, åpne noen datoer og velg hvem du vil dele med. Hytta er privat til
            du deler den, og ingen andre ser den i mellomtiden.
          </p>
          <p className="mt-2 max-w-[60ch] text-muted">
            Det er frivillig. Du kan låne uten å eie en hytte.
          </p>
        </Panel>
      )}
      <ul className="mb-8 divide-y divide-line border-y border-line empty:hidden">
        {cabins.map((cabin) => (
          <li key={cabin.id}>
            <Link
              href={`/mine-hytter/${cabin.id}`}
              className="group flex items-start gap-4 py-4 sm:gap-6"
            >
              <CabinThumb photoId={cabin.coverPhotoId} />
              <span className="min-w-0">
                <span className="block text-2xl font-bold group-hover:underline">
                  {cabin.name}
                </span>
                <span className="block text-muted">{cabin.area}</span>
                <span className="mt-1 block">
                  <span className="font-semibold">
                    {cabin.sharedWith === 0
                      ? "Privat. Bare du ser den."
                      : `Delt med ${cabin.sharedWith === 1 ? "én person" : `${cabin.sharedWith} personer`}.`}
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
