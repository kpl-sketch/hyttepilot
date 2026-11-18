import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink, PageTitle } from "@/components/ui";
import { UserError } from "@/lib/errors";
import {
  FOLDER_LABELS,
  INBOX_FOLDERS,
  type InboxFolder,
  inboxSetup,
  isInboxFolder,
  listThreads,
  type ThreadListItem,
} from "@/lib/services/inbox";
import { requireViewer } from "@/lib/session";
import { AdminTabs } from "../tabs";
import { formatMailTime } from "./format";

export const metadata: Metadata = { title: "Innboks" };

const CHANGED: Record<string, string> = {
  sendt: "E-posten er sendt.",
  archive: "Tråden er flyttet til arkivet.",
  trash: "Tråden er flyttet til papirkurven.",
  inbox: "Tråden er flyttet tilbake til innboksen.",
};

/**
 * Den felles innboksen (for eksempel hei@<domene>). E-posten ligger hos
 * Resend. Bare administratorer ser den.
 */
export default async function InboxPage({ searchParams }: PageProps<"/admin/innboks">) {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  const { mappe, endret } = await searchParams;
  const folder: InboxFolder = isInboxFolder(mappe) ? mappe : "inbox";
  const setup = inboxSetup();

  let threads: ThreadListItem[] = [];
  let problem: string | null = setup.ok ? null : setup.reason;
  if (setup.ok) {
    try {
      ({ threads } = await listThreads(viewer, folder));
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      problem = error.message;
    }
  }

  return (
    <>
      <PageTitle
        title="Innboks"
        lead={setup.ok ? `E-post til og fra ${setup.address}.` : "Felles e-post for tjenesten."}
      />
      <AdminTabs active="innboks" />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Mapper" className="flex flex-wrap gap-2">
          {INBOX_FOLDERS.map((f) => (
            <Link
              key={f}
              href={f === "inbox" ? "/admin/innboks" : `/admin/innboks?mappe=${f}`}
              aria-current={f === folder ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                f === folder ? "bg-ink text-white" : "border border-line text-muted hover:text-ink"
              }`}
            >
              {FOLDER_LABELS[f]}
            </Link>
          ))}
        </nav>
        {setup.ok && <ButtonLink href="/admin/innboks/ny">Ny e-post</ButtonLink>}
      </div>

      {typeof endret === "string" && CHANGED[endret] && (
        <p role="status" className="mb-4 max-w-[60ch] rounded-xl bg-window p-4 font-semibold">
          {CHANGED[endret]}
        </p>
      )}

      {problem ? (
        <p role="alert" className="max-w-[60ch] rounded-xl border border-barn p-4 text-barn">
          {problem}
        </p>
      ) : threads.length === 0 ? (
        <p className="text-muted">Ingen e-post i {FOLDER_LABELS[folder].toLowerCase()}.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {threads.map((t) => (
            <li key={t.id}>
              <Link
                href={`/admin/innboks/${t.id}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 hover:bg-paper"
              >
                <span className="min-w-0 flex-1">
                  <span className={`block break-words ${t.read ? "" : "font-bold"}`}>
                    {!t.read && <span className="sr-only">Ulest: </span>}
                    {folder === "sent" ? `Til ${t.to.join(", ")}` : (t.from ?? "Ukjent avsender")}
                  </span>
                  <span className={`block break-words ${t.read ? "text-muted" : "font-semibold"}`}>
                    {t.subject || "(uten emne)"}
                    {t.email_count > 1 && <span className="text-muted"> ({t.email_count})</span>}
                    {t.has_attachment && <span className="text-muted"> · vedlegg</span>}
                  </span>
                </span>
                <span className="text-sm text-muted">{formatMailTime(t.received_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
