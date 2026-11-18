import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buttonClass, PageTitle } from "@/components/ui";
import { formatDate, todayInOslo } from "@/lib/dates";
import { listMembers } from "@/lib/services/members";
import { requireViewer } from "@/lib/session";
import { AdminTabs } from "../tabs";

export const metadata: Metadata = { title: "Medlemmer" };

/**
 * Alle som har registrert seg: navn, e-post, når de ble med, når de sist
 * logget inn og hvem som inviterte. Siden viser ingenting om hytter, delinger eller forespørsler.
 */
/** «18. nov., 21:40» i norsk tid. */
function formatLogin(date: Date): string {
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo",
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function MembersPage() {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  const members = await listMembers(viewer);

  return (
    <>
      <PageTitle
        title="Medlemmer"
        lead="Alle som har registrert seg, med navn og e-post. Listen viser ikke hytter eller lån."
      />
      <AdminTabs active="medlemmer" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">
          {members.length} {members.length === 1 ? "person" : "personer"}
        </p>
        <a href="/admin/medlemmer/csv" download className={buttonClass("secondary")}>
          Last ned som regneark (CSV)
        </a>
      </div>

      {members.length === 0 ? (
        <p className="text-muted">Ingen har registrert seg ennå.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Medlemmer</caption>
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-4 font-semibold">Navn</th>
                <th scope="col" className="py-2 pr-4 font-semibold">E-post</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Ble med</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Sist innlogget</th>
                <th scope="col" className="py-2 font-semibold">Invitert av</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.email} className="border-b border-line align-top">
                  <th scope="row" className="py-2 pr-4 font-semibold">
                    {m.name}
                    {m.isAdmin && <span className="ml-2 text-xs font-normal text-muted">administrator</span>}
                  </th>
                  <td className="py-2 pr-4 break-all">
                    <a href={`mailto:${m.email}`} className="underline">{m.email}</a>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDate(todayInOslo(m.joinedAt))}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {m.lastLoginAt ? (
                      <time dateTime={m.lastLoginAt.toISOString()}>{formatLogin(m.lastLoginAt)}</time>
                    ) : (
                      <span className="text-muted">Ukjent</span>
                    )}
                  </td>
                  <td className="py-2">{m.invitedBy ?? <span className="text-muted">Ingen</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
