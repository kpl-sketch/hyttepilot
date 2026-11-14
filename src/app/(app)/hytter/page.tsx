import type { Metadata } from "next";
import Link from "next/link";
import { CabinThumb } from "@/components/cabin-photo";
import { ButtonLink, PageTitle, Panel } from "@/components/ui";
import { formatKroner } from "@/lib/pricing";
import { listVisibleCabins } from "@/lib/services/cabins";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Hytter" };

export default async function CabinsPage() {
  const viewer = await requireViewer();
  const cabins = await listVisibleCabins(viewer);

  return (
    <>
      <PageTitle
        title="Hytter"
        lead={
          viewer.isOwner
            ? "Alle hyttene i kretsen. Velg en hytte for å se når den er ledig."
            : "Hyttene du er invitert til. Velg en hytte for å se når den er ledig."
        }
      />

      {cabins.length === 0 && (
        <Panel>
          {viewer.isOwner ? (
            <>
              <p className="text-lg">Ingen hytter er lagt inn ennå. Bli den første.</p>
              <ButtonLink href="/mine-hytter/ny" className="mt-4">
                Legg inn hytta di
              </ButtonLink>
            </>
          ) : (
            <p className="text-lg">
              Du har ikke tilgang til noen hytter ennå. Be en hytteeier du kjenner om å
              invitere deg med e-postadressen {viewer.email}.
            </p>
          )}
        </Panel>
      )}

      <ul className="divide-y divide-line border-y border-line empty:hidden">
        {cabins.map(({ cabin, ownerName }) => {
          const perNight = Math.round(
            cabin.costPerNight * (1 + cabin.markupPercent / 100),
          );
          return (
            <li key={cabin.id}>
              <Link
                href={`/hytter/${cabin.id}`}
                className="group flex items-center gap-4 py-4 sm:gap-6"
              >
                <CabinThumb photoId={cabin.coverPhotoId} />
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-8 gap-y-1">
                  <span>
                    <span className="block text-2xl font-bold group-hover:underline">
                      {cabin.name}
                    </span>
                    <span className="block text-muted">
                      {cabin.area}, hos {cabin.ownerId === viewer.id ? "deg" : ownerName}
                    </span>
                  </span>
                  <span className="text-muted sm:text-right">
                    <span className="block font-semibold text-ink tabular-nums">
                      {formatKroner(perNight)} per døgn
                    </span>
                    <span className="block">{cabin.beds} sengeplasser</span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
