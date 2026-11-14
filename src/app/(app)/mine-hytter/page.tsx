import type { Metadata } from "next";
import Link from "next/link";
import { CabinThumb } from "@/components/cabin-photo";
import { ButtonLink, PageTitle, Panel } from "@/components/ui";
import { listOwnCabins } from "@/lib/services/cabins";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Mine hytter" };

export default async function MyCabinsPage() {
  const viewer = await requireViewer();

  if (!viewer.isOwner) {
    return (
      <>
        <PageTitle title="Mine hytter" />
        <Panel>
          <p className="text-lg">
            Bare inviterte hytteeiere kan legge inn hytter. Har du en hytte du vil dele med
            kretsen, så si fra til den som inviterte deg.
          </p>
        </Panel>
      </>
    );
  }

  const cabins = await listOwnCabins(viewer);
  return (
    <>
      <PageTitle
        title="Mine hytter"
        lead="Her styrer du hyttene dine: pris, ledige perioder og hvilke venner som har tilgang."
      />
      {cabins.length === 0 && (
        <p className="mb-6 text-lg">Du har ikke lagt inn noen hytte ennå.</p>
      )}
      <ul className="mb-8 divide-y divide-line border-y border-line empty:hidden">
        {cabins.map((cabin) => (
          <li key={cabin.id}>
            <Link
              href={`/mine-hytter/${cabin.id}`}
              className="group flex items-center gap-4 py-4 sm:gap-6"
            >
              <CabinThumb photoId={cabin.coverPhotoId} />
              <span className="min-w-0">
                <span className="block text-2xl font-bold group-hover:underline">
                  {cabin.name}
                </span>
                <span className="block text-muted">{cabin.area}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <ButtonLink href="/mine-hytter/ny">Legg inn hytte</ButtonLink>
    </>
  );
}
